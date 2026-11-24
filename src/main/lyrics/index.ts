import fs from 'fs';
import path from 'path';
import * as musicMetadata from 'music-metadata';
import { Track, LyricLine, LyricsResult, LyricProviderOption } from '../../shared/types';

const MAX_LOCAL_LRC_BYTES = 512 * 1024;
const MAX_LRCLIB_RESPONSE_BYTES = 512 * 1024;
const LRCLIB_TIMEOUT_MS = 3500;
const LRCLIB_DURATION_TOLERANCE_SECONDS = 15;

/**
 * Parses LRC formatted text into structured, chronologically sorted LyricLine objects.
 */
export function parseLrc(lrcText: string): LyricLine[] {
  if (!lrcText || typeof lrcText !== 'string') return [];

  const lines = lrcText.split(/\r?\n/);
  const result: LyricLine[] = [];
  let offsetSeconds = 0;

  // First check for [offset: +/-ms] tag
  for (const line of lines) {
    const offsetMatch = line.match(/\[offset:\s*([+-]?\d+)\s*\]/i);
    if (offsetMatch) {
      const parsedOffset = parseInt(offsetMatch[1], 10);
      if (Number.isFinite(parsedOffset)) {
        offsetSeconds = parsedOffset / 1000;
      }
      break;
    }
  }

  const timeTagRegex = /\[\s*(\d+):(\d{2})(?:[.:](\d+))?\s*\]/g;
  const inlineTimeTagRegex = /<\s*\d+:\d{2}(?:[.:]\d+)?\s*>/g;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Check if line contains any time tags
    const timeMatches = [...trimmed.matchAll(timeTagRegex)];
    if (timeMatches.length === 0) continue;

    // Remove all line and inline enhanced LRC time tags to get text content
    const textContent = trimmed
      .replace(timeTagRegex, '')
      .replace(inlineTimeTagRegex, '')
      .trim();

    for (const match of timeMatches) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      const millisRaw = match[3] || '0';
      const millis = parseInt(millisRaw.padEnd(3, '0').slice(0, 3), 10);

      const totalSeconds = Math.max(0, minutes * 60 + seconds + millis / 1000 + offsetSeconds);
      if (!Number.isFinite(totalSeconds)) continue;

      result.push({
        time: totalSeconds,
        text: textContent,
      });
    }
  }

  return result.sort((a, b) => a.time - b.time);
}

/**
 * Cleans track and artist titles for improved lyrics search matching
 */
function cleanSongTitle(title: string): string {
  const cleaned = title
    .replace(/\s*[\(\[](?:feat\.?|ft\.?|with|prod\.?|explicit|remaster(?:ed)?|deluxe|bonus|version|edition|official|audio|video|lyrics).*?[\)\]]/gi, '')
    .replace(/\s*-\s*(?:remaster(?:ed)?|deluxe|bonus|version|edition).*$/gi, '')
    .trim();
  return cleaned || title.trim();
}

function cleanArtistName(artist: string): string {
  const cleaned = artist
    .replace(/\s*[\(\[](?:feat\.?|ft\.?|with).*?[\)\]]/gi, '')
    .trim();
  return cleaned || artist.trim();
}

interface ProviderData {
  syncedLyrics: LyricLine[];
  plainLyrics?: string;
  source: 'local' | 'embedded' | 'online';
  instrumental?: boolean;
}

const ONLINE_CACHE_LIMIT = 200;
const onlineCache = new Map<string, ProviderData | null>();

function getOnlineCacheKey(track: Track): string {
  return [
    track.title || '',
    track.artist || '',
    track.album || '',
    String(Math.round(track.duration || 0)),
  ]
    .map((part) => part.trim().toLowerCase())
    .join('\u0000');
}

function readOnlineCache(key: string): ProviderData | null | undefined {
  if (!onlineCache.has(key)) return undefined;

  // Refresh insertion order so the oldest entries are evicted first.
  const cached = onlineCache.get(key) ?? null;
  onlineCache.delete(key);
  onlineCache.set(key, cached);
  return cached;
}

function writeOnlineCache(key: string, data: ProviderData | null): void {
  if (onlineCache.has(key)) {
    onlineCache.delete(key);
  } else if (onlineCache.size >= ONLINE_CACHE_LIMIT) {
    const oldestKey = onlineCache.keys().next().value;
    if (oldestKey !== undefined) {
      onlineCache.delete(oldestKey);
    }
  }
  onlineCache.set(key, data);
}

type FetchJsonResult =
  | { status: 'ok'; data: unknown }
  | { status: 'not_found' }
  | { status: 'error' };

async function cancelBodySafely(res: Response): Promise<void> {
  try {
    await res.body?.cancel();
  } catch {
    // Ignore stream cancellation errors.
  }
}

async function fetchJsonWithLimits(
  url: string,
  timeoutMs = LRCLIB_TIMEOUT_MS,
  maxBytes = MAX_LRCLIB_RESPONSE_BYTES
): Promise<FetchJsonResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'MaJaPlayer/1.0 (https://github.com/ComplexMaJa/MusicPlayer)',
      },
      redirect: 'error',
      signal: controller.signal,
    });

    if (res.status === 404) {
      await cancelBodySafely(res);
      return { status: 'not_found' };
    }

    if (!res.ok) {
      await cancelBodySafely(res);
      return { status: 'error' };
    }

    const contentLengthHeader = res.headers.get('content-length');
    if (contentLengthHeader) {
      const contentLength = Number(contentLengthHeader);
      if (Number.isFinite(contentLength) && contentLength > maxBytes) {
        await cancelBodySafely(res);
        return { status: 'error' };
      }
    }

    let rawBytes: Buffer;
    if (res.body && typeof res.body.getReader === 'function') {
      const reader = res.body.getReader();
      const chunks: Buffer[] = [];
      let totalBytes = 0;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!value) continue;

          totalBytes += value.byteLength;
          if (totalBytes > maxBytes) {
            await reader.cancel().catch(() => {});
            return { status: 'error' };
          }
          chunks.push(Buffer.from(value));
        }
      } catch {
        await reader.cancel().catch(() => {});
        return { status: 'error' };
      }

      rawBytes = Buffer.concat(chunks, totalBytes);
    } else {
      const ab = await res.arrayBuffer();
      if (ab.byteLength > maxBytes) {
        return { status: 'error' };
      }
      rawBytes = Buffer.from(ab);
    }

    const parsed: unknown = JSON.parse(rawBytes.toString('utf8'));
    return { status: 'ok', data: parsed };
  } catch {
    return { status: 'error' };
  } finally {
    clearTimeout(timer);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function extractOnlineLyrics(raw: unknown): ProviderData | null {
  if (!isRecord(raw)) return null;

  if (raw.instrumental === true) {
    return {
      syncedLyrics: [],
      plainLyrics: '♪ Instrumental ♪',
      source: 'online',
      instrumental: true,
    };
  }

  const rawSynced = typeof raw.syncedLyrics === 'string' ? raw.syncedLyrics : '';
  const rawPlain = typeof raw.plainLyrics === 'string' ? raw.plainLyrics : '';

  if (rawSynced.trim()) {
    const parsed = parseLrc(rawSynced);
    if (parsed.length > 0) {
      return {
        syncedLyrics: parsed,
        plainLyrics: rawPlain || rawSynced,
        source: 'online',
      };
    }
  }

  if (rawPlain.trim()) {
    return {
      syncedLyrics: [],
      plainLyrics: rawPlain,
      source: 'online',
    };
  }

  return null;
}

function pickBestSearchMatch(items: unknown[], trackDuration: number): ProviderData | null {
  const candidates: Array<{ provider: ProviderData; durationDiff: number }> = [];
  const hasTrackDuration = Number.isFinite(trackDuration) && trackDuration > 0;

  for (const item of items) {
    if (!isRecord(item)) continue;
    const extracted = extractOnlineLyrics(item);
    if (!extracted) continue;

    const itemDuration = typeof item.duration === 'number' && Number.isFinite(item.duration)
      ? item.duration
      : null;

    if (hasTrackDuration && itemDuration !== null) {
      const diff = Math.abs(itemDuration - trackDuration);
      if (diff > LRCLIB_DURATION_TOLERANCE_SECONDS) {
        continue;
      }
      candidates.push({ provider: extracted, durationDiff: diff });
    } else {
      candidates.push({
        provider: extracted,
        durationDiff: hasTrackDuration ? LRCLIB_DURATION_TOLERANCE_SECONDS : 0,
      });
    }
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    const aSynced = a.provider.syncedLyrics.length > 0 ? 1 : 0;
    const bSynced = b.provider.syncedLyrics.length > 0 ? 1 : 0;
    if (aSynced !== bSynced) return bSynced - aSynced;

    const aInstr = a.provider.instrumental ? 1 : 0;
    const bInstr = b.provider.instrumental ? 1 : 0;
    if (aInstr !== bInstr) return bInstr - aInstr;

    return a.durationDiff - b.durationDiff;
  });

  return candidates[0].provider;
}

async function readLocalLrcFile(trackPath: string): Promise<ProviderData | null> {
  const trackStat = await fs.promises.stat(trackPath).catch(() => null);
  if (!trackStat || !trackStat.isFile()) return null;

  const dir = path.dirname(trackPath);
  const baseName = path.basename(trackPath, path.extname(trackPath));
  const candidates = [
    path.join(dir, `${baseName}.lrc`),
    `${trackPath}.lrc`,
    path.join(dir, `${baseName}.LRC`),
  ];

  for (const candidate of candidates) {
    const stat = await fs.promises.stat(candidate).catch(() => null);
    if (!stat || !stat.isFile()) continue;
    if (stat.size > MAX_LOCAL_LRC_BYTES) {
      console.warn(`Skipping oversized LRC file (${stat.size} bytes): ${candidate}`);
      continue;
    }

    const content = await fs.promises.readFile(candidate, 'utf8');
    if (content && content.trim()) {
      const parsed = parseLrc(content);
      return {
        syncedLyrics: parsed,
        plainLyrics: content,
        source: 'local',
      };
    }
  }

  return null;
}

async function readEmbeddedLyrics(trackPath: string): Promise<ProviderData | null> {
  const trackStat = await fs.promises.stat(trackPath).catch(() => null);
  if (!trackStat || !trackStat.isFile()) return null;

  const metadata = await musicMetadata.parseFile(trackPath, { skipCovers: true });
  const lyricsArray = metadata.common.lyrics;
  if (!Array.isArray(lyricsArray) || lyricsArray.length === 0) {
    return null;
  }

  let plainFallback: ProviderData | null = null;

  for (const rawEntry of lyricsArray as unknown[]) {
    if (!rawEntry) continue;

    if (typeof rawEntry === 'string') {
      if (rawEntry.trim()) {
        const parsed = parseLrc(rawEntry);
        if (parsed.length > 0) {
          return { syncedLyrics: parsed, plainLyrics: rawEntry, source: 'embedded' };
        }
        if (!plainFallback) {
          plainFallback = { syncedLyrics: [], plainLyrics: rawEntry, source: 'embedded' };
        }
      }
      continue;
    }

    if (!isRecord(rawEntry)) continue;
    const entry = rawEntry as { text?: unknown; syncText?: unknown };

    if (Array.isArray(entry.syncText) && entry.syncText.length > 0) {
      const syncedLines: LyricLine[] = [];
      for (const syncItem of entry.syncText) {
        if (
          isRecord(syncItem) &&
          typeof syncItem.text === 'string' &&
          typeof syncItem.timestamp === 'number' &&
          Number.isFinite(syncItem.timestamp)
        ) {
          syncedLines.push({
            time: Math.max(0, syncItem.timestamp / 1000),
            text: syncItem.text.trim(),
          });
        }
      }
      if (syncedLines.length > 0) {
        syncedLines.sort((a, b) => a.time - b.time);
        const plainFromSync =
          (typeof entry.text === 'string' && entry.text.trim()) ||
          syncedLines.map((l) => l.text).filter(Boolean).join('\n');
        return {
          syncedLyrics: syncedLines,
          plainLyrics: plainFromSync,
          source: 'embedded',
        };
      }
    }

    if (typeof entry.text === 'string' && entry.text.trim()) {
      const parsed = parseLrc(entry.text);
      if (parsed.length > 0) {
        return {
          syncedLyrics: parsed,
          plainLyrics: entry.text,
          source: 'embedded',
        };
      }
      if (!plainFallback) {
        plainFallback = {
          syncedLyrics: [],
          plainLyrics: entry.text,
          source: 'embedded',
        };
      }
    }
  }

  return plainFallback;
}

/**
 * Fetches lyrics from a specified or automatic provider:
 * - 'auto': Checks local -> embedded -> online, picking the best synced stream
 * - 'online': Forces online LRCLIB provider
 * - 'embedded': Forces embedded audio tag provider
 * - 'local': Forces local .lrc file provider
 */
export async function getLyricsForTrack(
  track: Track,
  preferredProvider: LyricProviderOption = 'auto'
): Promise<LyricsResult | null> {
  if (!track) return null;

  let localData: ProviderData | null = null;
  let embeddedData: ProviderData | null = null;
  let onlineData: ProviderData | null = null;

  // 1. Check local .lrc file
  if (track.path) {
    try {
      localData = await readLocalLrcFile(track.path);
    } catch (err) {
      console.warn('Error checking local LRC file:', err);
    }
  }

  // 2. Check embedded audio tags (skip cover decoding)
  if (track.path) {
    try {
      embeddedData = await readEmbeddedLyrics(track.path);
    } catch (err) {
      console.warn('Error checking embedded lyrics:', err);
    }
  }

  // 3. Check online LRCLIB only when the requested provider needs it and no
  // higher-priority synced source is already available.
  const hasLocalSynced = Boolean(localData?.syncedLyrics.length);
  const hasEmbeddedSynced = Boolean(embeddedData?.syncedLyrics.length);
  const needOnline =
    preferredProvider === 'online' ||
    (preferredProvider === 'auto' && !hasLocalSynced && !hasEmbeddedSynced);

  if (needOnline && track.title && track.artist && track.artist !== 'Unknown Artist') {
    const cacheKey = getOnlineCacheKey(track);
    const cachedOnline = readOnlineCache(cacheKey);

    if (cachedOnline !== undefined) {
      onlineData = cachedOnline;
    } else {
      let hadTransientError = false;

      try {
        const cleanTitle = cleanSongTitle(track.title);
        const cleanArtist = cleanArtistName(track.artist);

        // 3A. Exact /api/get query
        const params1 = new URLSearchParams({
          track_name: track.title,
          artist_name: track.artist,
        });
        if (track.album && track.album !== 'Unknown Album') {
          params1.append('album_name', track.album);
        }
        if (track.duration && track.duration > 0) {
          params1.append('duration', `${Math.round(track.duration)}`);
        }

        const res1 = await fetchJsonWithLimits(`https://lrclib.net/api/get?${params1.toString()}`);
        if (res1.status === 'ok') {
          onlineData = extractOnlineLyrics(res1.data);
        } else if (res1.status === 'error') {
          hadTransientError = true;
        }

        // 3B. Cleaned /api/get query fallback
        if (
          !onlineData?.syncedLyrics?.length &&
          (cleanTitle !== track.title || cleanArtist !== track.artist)
        ) {
          const params2 = new URLSearchParams({
            track_name: cleanTitle,
            artist_name: cleanArtist,
          });
          const res2 = await fetchJsonWithLimits(`https://lrclib.net/api/get?${params2.toString()}`);
          if (res2.status === 'ok') {
            const candidate = extractOnlineLyrics(res2.data);
            if (candidate && (candidate.syncedLyrics.length > 0 || !onlineData)) {
              onlineData = candidate;
            }
          } else if (res2.status === 'error') {
            hadTransientError = true;
          }
        }

        // 3C. Search endpoint fallback
        if (!onlineData?.syncedLyrics?.length) {
          const searchParams = new URLSearchParams({
            track_name: cleanTitle,
            artist_name: cleanArtist,
          });
          const searchRes = await fetchJsonWithLimits(
            `https://lrclib.net/api/search?${searchParams.toString()}`
          );
          if (searchRes.status === 'ok' && Array.isArray(searchRes.data)) {
            const candidate = pickBestSearchMatch(searchRes.data, track.duration || 0);
            if (candidate && (candidate.syncedLyrics.length > 0 || !onlineData)) {
              onlineData = candidate;
            }
          } else if (searchRes.status === 'error') {
            hadTransientError = true;
          }
        }
      } catch (err) {
        hadTransientError = true;
        console.warn('LRCLIB online fetch error:', err);
      }

      if (onlineData !== null || !hadTransientError) {
        writeOnlineCache(cacheKey, onlineData);
      }
    }
  }

  // Compile available sources list
  const availableSources: ('local' | 'embedded' | 'online')[] = [];
  if (localData) availableSources.push('local');
  if (embeddedData) availableSources.push('embedded');
  if (onlineData) availableSources.push('online');

  // Select provider based on explicit preference or auto priority
  let chosen: ProviderData | null = null;

  if (preferredProvider === 'local') {
    chosen = localData;
  } else if (preferredProvider === 'embedded') {
    chosen = embeddedData;
  } else if (preferredProvider === 'online') {
    chosen = onlineData;
  } else {
    if (localData?.syncedLyrics?.length) {
      chosen = localData;
    } else if (embeddedData?.syncedLyrics?.length) {
      chosen = embeddedData;
    } else if (onlineData?.syncedLyrics?.length) {
      chosen = onlineData;
    } else if (onlineData?.instrumental) {
      chosen = onlineData;
    } else if (embeddedData?.plainLyrics) {
      chosen = embeddedData;
    } else if (localData?.plainLyrics) {
      chosen = localData;
    } else if (onlineData?.plainLyrics) {
      chosen = onlineData;
    }
  }

  if (chosen) {
    return {
      syncedLyrics: chosen.syncedLyrics || [],
      plainLyrics: chosen.plainLyrics,
      source: chosen.source,
      instrumental: chosen.instrumental,
      availableSources,
    };
  }

  return {
    syncedLyrics: [],
    plainLyrics: 'No lyrics available for this track.',
    source: 'none',
    availableSources,
  };
}

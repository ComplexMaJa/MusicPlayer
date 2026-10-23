import fs from 'fs';
import path from 'path';
import * as musicMetadata from 'music-metadata';
import { Track, LyricLine, LyricsResult, LyricProviderOption } from '../../shared/types';

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
      offsetSeconds = parseInt(offsetMatch[1], 10) / 1000;
      break;
    }
  }

  const timeTagRegex = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Check if line contains any time tags
    const timeMatches = [...trimmed.matchAll(timeTagRegex)];
    if (timeMatches.length === 0) continue;

    // Remove all time tags to get text content
    const textContent = trimmed.replace(timeTagRegex, '').trim();

    for (const match of timeMatches) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      const millisRaw = match[3] || '0';
      const millis = parseInt(millisRaw.padEnd(3, '0').slice(0, 3), 10);

      const totalSeconds = Math.max(0, minutes * 60 + seconds + millis / 1000 + offsetSeconds);

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
  return title
    .replace(/\s*[\(\[](?:feat\.?|ft\.?|with|prod\.?|explicit|remaster(?:ed)?|deluxe|bonus|version|edition|official|audio|video|lyrics).*?[\)\]]/gi, '')
    .replace(/\s*-\s*(?:remaster(?:ed)?|deluxe|bonus|version|edition).*$/gi, '')
    .trim();
}

function cleanArtistName(artist: string): string {
  return artist
    .replace(/\s*[\(\[](?:feat\.?|ft\.?|with).*?[\)\]]/gi, '')
    .trim();
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
  if (onlineCache.size >= ONLINE_CACHE_LIMIT) {
    const oldestKey = onlineCache.keys().next().value;
    if (oldestKey !== undefined) {
      onlineCache.delete(oldestKey);
    }
  }
  onlineCache.set(key, data);
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
  try {
    if (track.path && fs.existsSync(track.path)) {
      const dir = path.dirname(track.path);
      const baseName = path.basename(track.path, path.extname(track.path));
      const candidates = [
        path.join(dir, `${baseName}.lrc`),
        `${track.path}.lrc`,
        path.join(dir, `${baseName}.LRC`),
      ];

      for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
          const content = await fs.promises.readFile(candidate, 'utf8');
          if (content && content.trim()) {
            const parsed = parseLrc(content);
            localData = {
              syncedLyrics: parsed,
              plainLyrics: content,
              source: 'local',
            };
            break;
          }
        }
      }
    }
  } catch (err) {
    console.warn('Error checking local LRC file:', err);
  }

  // 2. Check embedded audio tags
  try {
    if (track.path && fs.existsSync(track.path)) {
      const metadata = await musicMetadata.parseFile(track.path);
      const lyricsArray = metadata.common.lyrics;
      if (lyricsArray && lyricsArray.length > 0) {
        const raw = typeof lyricsArray[0] === 'string' ? lyricsArray[0] : (lyricsArray[0] as any).text;
        if (raw && typeof raw === 'string' && raw.trim()) {
          const parsed = parseLrc(raw);
          embeddedData = {
            syncedLyrics: parsed,
            plainLyrics: raw,
            source: 'embedded',
          };
        }
      }
    }
  } catch (err) {
    console.warn('Error checking embedded lyrics:', err);
  }

  // 3. Check online LRCLIB only when the requested provider needs it and no
  // higher-priority synced source is already available.
  const hasLocalSynced = Boolean(localData?.syncedLyrics.length);
  const hasEmbeddedSynced = Boolean(embeddedData?.syncedLyrics.length);
  const needOnline =
    preferredProvider === 'online' || (!hasLocalSynced && !hasEmbeddedSynced);

  if (needOnline && track.title && track.artist && track.artist !== 'Unknown Artist') {
    const cacheKey = getOnlineCacheKey(track);
    const cachedOnline = readOnlineCache(cacheKey);

    if (cachedOnline !== undefined) {
      onlineData = cachedOnline;
    } else {
      try {
        const cleanTitle = cleanSongTitle(track.title);
        const cleanArtist = cleanArtistName(track.artist);

      const fetchOptions = {
        headers: {
          'User-Agent': 'MaJaPlayer/1.0 (https://github.com/ComplexMaJa/MusicPlayer)',
        },
      };

      const fetchWithTimeout = async (url: string, timeoutMs = 3500) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const res = await fetch(url, { ...fetchOptions, signal: controller.signal });
          clearTimeout(timer);
          return res;
        } catch (e) {
          clearTimeout(timer);
          return null;
        }
      };

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

      let res = await fetchWithTimeout(`https://lrclib.net/api/get?${params1.toString()}`);
      if (res && res.ok) {
        const data = await res.json();
        if (data) {
          if (data.instrumental) {
            onlineData = {
              syncedLyrics: [],
              plainLyrics: '♪ Instrumental ♪',
              source: 'online',
              instrumental: true,
            };
          } else if (data.syncedLyrics) {
            const parsed = parseLrc(data.syncedLyrics);
            onlineData = {
              syncedLyrics: parsed,
              plainLyrics: data.plainLyrics || data.syncedLyrics,
              source: 'online',
            };
          } else if (data.plainLyrics) {
            onlineData = {
              syncedLyrics: [],
              plainLyrics: data.plainLyrics,
              source: 'online',
            };
          }
        }
      }

      // 3B. Cleaned /api/get query fallback
      if (!onlineData?.syncedLyrics?.length && (cleanTitle !== track.title || cleanArtist !== track.artist)) {
        const params2 = new URLSearchParams({
          track_name: cleanTitle,
          artist_name: cleanArtist,
        });
        res = await fetchWithTimeout(`https://lrclib.net/api/get?${params2.toString()}`);
        if (res && res.ok) {
          const data = await res.json();
          if (data?.syncedLyrics) {
            const parsed = parseLrc(data.syncedLyrics);
            if (parsed.length > 0) {
              onlineData = {
                syncedLyrics: parsed,
                plainLyrics: data.plainLyrics || data.syncedLyrics,
                source: 'online',
              };
            }
          }
        }
      }

      // 3C. Search endpoint fallback
      if (!onlineData?.syncedLyrics?.length) {
        const searchParams = new URLSearchParams({
          track_name: cleanTitle,
          artist_name: cleanArtist,
        });
        const searchRes = await fetchWithTimeout(`https://lrclib.net/api/search?${searchParams.toString()}`);
        if (searchRes && searchRes.ok) {
          const searchList = await searchRes.json();
          if (Array.isArray(searchList)) {
            const matchWithSynced = searchList.find(
              (item) => item.syncedLyrics && typeof item.syncedLyrics === 'string'
            );
            if (matchWithSynced) {
              const parsed = parseLrc(matchWithSynced.syncedLyrics);
              if (parsed.length > 0) {
                onlineData = {
                  syncedLyrics: parsed,
                  plainLyrics: matchWithSynced.plainLyrics || matchWithSynced.syncedLyrics,
                  source: 'online',
                };
              }
            }
          }
        }
      }
      } catch (err) {
        console.warn('LRCLIB online fetch error:', err);
      }
      writeOnlineCache(cacheKey, onlineData);
    }
  }

  // Compile available sources list
  const availableSources: ('local' | 'embedded' | 'online')[] = [];
  if (localData) availableSources.push('local');
  if (embeddedData) availableSources.push('embedded');
  if (onlineData) availableSources.push('online');

  // Select provider based on preference
  let chosen: ProviderData | null = null;

  if (preferredProvider === 'local' && localData) {
    chosen = localData;
  } else if (preferredProvider === 'embedded' && embeddedData) {
    chosen = embeddedData;
  } else if (preferredProvider === 'online' && onlineData) {
    chosen = onlineData;
  } else {
    // Auto resolution: prefer timestamped synced lyrics first
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

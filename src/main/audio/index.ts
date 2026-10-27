import * as musicMetadata from 'music-metadata';
import path from 'path';
import fs from 'fs';
import { Readable } from 'stream';
import { protocol, net, app } from 'electron';
import { pathToFileURL } from 'url';
import { AudioFormatInfo } from '../../shared/types';
import { SUPPORTED_EXTENSIONS } from '../../shared/constants';
import { isTrackPathKnown } from '../database';
import { ensureArtworkDirExists } from '../library';

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.avif']);
const approvedWallpaperPaths = new Set<string>();

function normalizePathForComparison(filePath: string): string {
  const resolved = path.resolve(filePath);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function extractWallpaperPath(url: unknown): string | null {
  if (typeof url !== 'string' || !url.startsWith('maja-artwork://load')) return null;

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'maja-artwork:' || parsed.hostname !== 'load') return null;

    const rawPath = parsed.searchParams.get('path');
    if (!rawPath) return null;

    // URLSearchParams already percent-decodes the value.
    return path.resolve(rawPath);
  } catch (_) {
    return null;
  }
}

/**
 * Records a wallpaper that the user picked through the native file dialog.
 * Only paths registered here (or an already persisted, unchanged value) may be
 * written to settings, which prevents the renderer from pointing the privileged
 * artwork protocol at arbitrary files.
 */
export function rememberSelectedWallpaper(filePath: string): string | null {
  try {
    const resolved = path.resolve(filePath);
    if (!isImagePath(resolved) || !fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
      return null;
    }

    approvedWallpaperPaths.add(normalizePathForComparison(resolved));
    return `maja-artwork://load?path=${encodeURIComponent(resolved)}`;
  } catch (_) {
    return null;
  }
}

export function isAllowedWallpaperUrl(value: unknown): boolean {
  if (value === '' || value === undefined || value === null) return true;
  if (typeof value !== 'string') return false;

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch (_) {
    return false;
  }

  if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return true;
  if (parsed.protocol !== 'maja-artwork:' || parsed.hostname !== 'load') return false;

  try {
    const approvedPath = extractWallpaperPath(value);
    return approvedPath !== null && approvedWallpaperPaths.has(normalizePathForComparison(approvedPath));
  } catch (_) {
    return false;
  }
}

function getAllowedWallpaperPath(): string | null {
  try {
    const settingsPath = path.join(app.getPath('userData'), 'settings.json');
    if (!fs.existsSync(settingsPath)) return null;
    const data = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    return extractWallpaperPath(data?.customBackgroundUrl);
  } catch (_) {}
  return null;
}

function isPathInside(parent: string, child: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function isSupportedAudioPath(filePath: string): boolean {
  return SUPPORTED_EXTENSIONS.includes(path.extname(filePath).toLowerCase());
}

function isImagePath(filePath: string): boolean {
  return IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

type ParsedRange =
  | { kind: 'none' }
  | { kind: 'satisfiable'; start: number; end: number }
  | { kind: 'unsatisfiable' };

function parseRangeHeader(rangeHeader: string, fileSize: number): ParsedRange {
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim().replace(/\s+/g, ''));
  // RFC 9110 §14.1.2: syntactically invalid Range headers must be ignored.
  if (!match) return { kind: 'none' };

  const [, rawStart, rawEnd] = match;
  if (!rawStart && !rawEnd) return { kind: 'none' };

  let start: number;
  let end: number;

  if (!rawStart) {
    const suffixLength = Number(rawEnd);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return { kind: 'none' };
    start = Math.max(0, fileSize - suffixLength);
    end = fileSize - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd ? Number(rawEnd) : fileSize - 1;
  }

  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) return { kind: 'none' };
  if (start < 0 || start >= fileSize || end < start) return { kind: 'unsatisfiable' };

  return { kind: 'satisfiable', start, end: Math.min(end, fileSize - 1) };
}

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.flac':
      return 'audio/flac';
    case '.mp3':
      return 'audio/mpeg';
    case '.wav':
      return 'audio/wav';
    case '.ogg':
      return 'audio/ogg';
    case '.m4a':
    case '.aac':
      return 'audio/aac';
    default:
      return 'application/octet-stream';
  }
}

export function registerAudioSchemes(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'maja-audio',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
        corsEnabled: true,
      },
    },
    {
      scheme: 'maja-artwork',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
      },
    },
  ]);
}

let audioProtocolsRegistered = false;

export function registerAudioProtocols(): void {
  if (audioProtocolsRegistered) return;
  audioProtocolsRegistered = true;
  protocol.handle('maja-audio', (request) => {
    try {
      const method = request.method.toUpperCase();
      if (method !== 'GET' && method !== 'HEAD') {
        return new Response('Method Not Allowed', {
          status: 405,
          headers: { Allow: 'GET, HEAD' },
        });
      }

      const parsedUrl = new URL(request.url);
      if (parsedUrl.hostname !== 'stream') {
        return new Response('File not found', { status: 404 });
      }

      const filePath = parsedUrl.searchParams.get('path');
      if (
        !filePath ||
        !path.isAbsolute(filePath) ||
        !isSupportedAudioPath(filePath) ||
        !isTrackPathKnown(filePath)
      ) {
        return new Response('File not found', { status: 404 });
      }

      const stat = fs.statSync(filePath);
      if (!stat.isFile()) {
        return new Response('File not found', { status: 404 });
      }

      const fileSize = stat.size;
      const mimeType = getMimeType(filePath);
      const rangeHeader = request.headers.get('range');
      const baseHeaders = {
        'Accept-Ranges': 'bytes',
        'Content-Type': mimeType,
        'X-Content-Type-Options': 'nosniff',
      };

      if (rangeHeader) {
        const range = parseRangeHeader(rangeHeader, fileSize);

        if (range.kind === 'unsatisfiable') {
          return new Response('Range Not Satisfiable', {
            status: 416,
            headers: {
              'Content-Range': `bytes */${fileSize}`,
              'Accept-Ranges': 'bytes',
              'X-Content-Type-Options': 'nosniff',
            },
          });
        }

        if (range.kind === 'satisfiable') {
          const { start, end } = range;
          const headers = {
            ...baseHeaders,
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Content-Length': (end - start + 1).toString(),
          };

          if (method === 'HEAD') {
            return new Response(null, { status: 206, statusText: 'Partial Content', headers });
          }

          const nodeStream = fs.createReadStream(filePath, { start, end });
          const webStream = Readable.toWeb(nodeStream);

          return new Response(webStream as any, {
            status: 206,
            statusText: 'Partial Content',
            headers,
          });
        }
      }

      if (method === 'HEAD') {
        return new Response(null, {
          status: 200,
          headers: {
            ...baseHeaders,
            'Content-Length': fileSize.toString(),
          },
        });
      }

      const nodeStream = fs.createReadStream(filePath);
      const webStream = Readable.toWeb(nodeStream);

      return new Response(webStream as any, {
        status: 200,
        headers: {
          ...baseHeaders,
          'Content-Length': fileSize.toString(),
        },
      });
    } catch (err) {
      console.error('Error serving audio protocol:', err);
    }
    return new Response('File not found', { status: 404 });
  });

  protocol.handle('maja-artwork', (request) => {
    try {
      const method = request.method.toUpperCase();
      if (method !== 'GET' && method !== 'HEAD') {
        return new Response('Method Not Allowed', {
          status: 405,
          headers: { Allow: 'GET, HEAD' },
        });
      }

      const parsedUrl = new URL(request.url);

      if (parsedUrl.hostname === 'stream') {
        const fileName = parsedUrl.searchParams.get('file');
        if (!fileName || !fileName.startsWith('art_') || path.basename(fileName) !== fileName) {
          return new Response('Artwork not found', { status: 404 });
        }

        const artDir = path.resolve(ensureArtworkDirExists());
        const fullPath = path.resolve(artDir, fileName);
        if (
          !isPathInside(artDir, fullPath) ||
          !isImagePath(fullPath) ||
          !fs.existsSync(fullPath) ||
          !fs.statSync(fullPath).isFile()
        ) {
          return new Response('Artwork not found', { status: 404 });
        }

        return net.fetch(pathToFileURL(fullPath).toString(), {
          headers: request.headers,
          method: request.method,
        });
      }

      if (parsedUrl.hostname === 'load') {
        const targetPath = extractWallpaperPath(request.url);
        if (!targetPath) {
          return new Response('Artwork not found', { status: 404 });
        }

        const allowedWallpaperPath = getAllowedWallpaperPath();
        const isMatch =
          allowedWallpaperPath !== null &&
          normalizePathForComparison(targetPath) === normalizePathForComparison(allowedWallpaperPath);

        if (!isMatch) {
          return new Response('Access denied: unapproved wallpaper path', { status: 403 });
        }

        if (
          !isImagePath(targetPath) ||
          !fs.existsSync(targetPath) ||
          !fs.statSync(targetPath).isFile()
        ) {
          return new Response('Artwork not found', { status: 404 });
        }

        return net.fetch(pathToFileURL(targetPath).toString(), {
          headers: request.headers,
          method: request.method,
        });
      }
    } catch (err) {
      console.error('Error serving artwork protocol:', err);
    }
    return new Response('Artwork not found', { status: 404 });
  });
}

export async function getAudioFormatInfo(filePath: string): Promise<AudioFormatInfo> {
  try {
    const metadata = await musicMetadata.parseFile(filePath);
    const format = metadata.format;
    const codec = (format.container || format.codec || path.extname(filePath).replace('.', '')).toUpperCase();
    const sampleRate = format.sampleRate || 44100;
    const bitDepth = format.bitsPerSample || 16;
    const channels = format.numberOfChannels || 2;
    const bitrate = format.bitrate ? Math.round(format.bitrate / 1000) : undefined;

    return {
      codec,
      sampleRate,
      bitDepth,
      channels,
      bitrate,
    };
  } catch (err) {
    console.error('Error reading format info:', err);
    return {
      codec: path.extname(filePath).replace('.', '').toUpperCase(),
      sampleRate: 44100,
      bitDepth: 16,
      channels: 2,
    };
  }
}

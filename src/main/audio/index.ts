import * as musicMetadata from 'music-metadata';
import path from 'path';
import fs from 'fs';
import { Readable } from 'stream';
import { protocol, net } from 'electron';
import { pathToFileURL } from 'url';
import { AudioFormatInfo } from '../../shared/types';
import { SUPPORTED_EXTENSIONS } from '../../shared/constants';
import { isTrackPathKnown } from '../database';
import { ensureArtworkDirExists } from '../library';
import { normalizePathForComparison, normalizePlatformPath } from '../security';

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.avif']);
const MAX_APPROVED_WALLPAPERS = 64;

const approvedWallpaperPaths = new Set<string>();
let activeWallpaperPath: string | null = null;

function extractWallpaperPath(url: unknown): string | null {
  if (typeof url !== 'string' || !url.startsWith('maja-artwork://load')) return null;

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'maja-artwork:' || parsed.hostname !== 'load') return null;

    const rawPath = parsed.searchParams.get('path');
    if (!rawPath || rawPath.includes('\0') || !path.isAbsolute(rawPath)) return null;

    // URLSearchParams already percent-decodes the value.
    return normalizePlatformPath(rawPath);
  } catch {
    return null;
  }
}

/**
 * Tracks the currently persisted wallpaper path in memory so protocol requests
 * do not synchronously read and parse settings.json on every image load.
 */
export function setActiveWallpaperUrl(url: string): void {
  const extracted = extractWallpaperPath(url);
  activeWallpaperPath = extracted ? normalizePathForComparison(extracted) : null;
}

/**
 * Records a wallpaper that the user picked through the native file dialog.
 * Only paths registered here (or the active persisted wallpaper) may be
 * loaded by the privileged artwork protocol or written to settings.
 */
export function rememberSelectedWallpaper(filePath: string): string | null {
  try {
    if (!filePath || filePath.includes('\0')) return null;
    const resolved = normalizePlatformPath(filePath);
    if (!isImagePath(resolved) || !fs.statSync(resolved).isFile()) {
      return null;
    }

    const key = normalizePathForComparison(resolved);
    if (approvedWallpaperPaths.size >= MAX_APPROVED_WALLPAPERS) {
      const oldest = approvedWallpaperPaths.values().next().value;
      if (oldest !== undefined) approvedWallpaperPaths.delete(oldest);
    }
    approvedWallpaperPaths.add(key);
    return `maja-artwork://load?path=${encodeURIComponent(resolved)}`;
  } catch {
    return null;
  }
}

export function isAllowedWallpaperUrl(value: unknown): boolean {
  if (value === '' || value === undefined || value === null) return true;
  if (typeof value !== 'string' || value.includes('\0')) return false;

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }

  // Only HTTPS remote URLs are allowed (matches CSP img-src).
  if (parsed.protocol === 'https:') return true;
  if (parsed.protocol !== 'maja-artwork:' || parsed.hostname !== 'load') return false;

  const wallpaperPath = extractWallpaperPath(value);
  if (!wallpaperPath) return false;
  const key = normalizePathForComparison(wallpaperPath);
  return approvedWallpaperPaths.has(key) || activeWallpaperPath === key;
}

function isWallpaperPathApproved(filePath: string): boolean {
  const key = normalizePathForComparison(filePath);
  return activeWallpaperPath === key || approvedWallpaperPaths.has(key);
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
  const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
  // RFC 9110 §14.1.2: syntactically invalid Range headers must be ignored.
  if (!match) return { kind: 'none' };

  const [, rawStart, rawEnd] = match;
  if (!rawStart && !rawEnd) return { kind: 'none' };

  const sizeBig = BigInt(fileSize);

  if (!rawStart) {
    const suffixLength = BigInt(rawEnd);
    // RFC 9110 §14.1.2: suffix-length of 0 or empty representation is unsatisfiable.
    if (suffixLength === 0n || sizeBig <= 0n) return { kind: 'unsatisfiable' };
    const startBig = suffixLength >= sizeBig ? 0n : sizeBig - suffixLength;
    return { kind: 'satisfiable', start: Number(startBig), end: fileSize - 1 };
  }

  const startBig = BigInt(rawStart);
  if (rawEnd) {
    const endBig = BigInt(rawEnd);
    // RFC 9110 §14.1.2: int-range-spec is syntactically invalid if last-pos < first-pos.
    if (endBig < startBig) return { kind: 'none' };
    if (sizeBig <= 0n || startBig >= sizeBig) return { kind: 'unsatisfiable' };
    const clampedEnd = endBig >= sizeBig ? sizeBig - 1n : endBig;
    return { kind: 'satisfiable', start: Number(startBig), end: Number(clampedEnd) };
  }

  if (sizeBig <= 0n || startBig >= sizeBig) return { kind: 'unsatisfiable' };
  return { kind: 'satisfiable', start: Number(startBig), end: fileSize - 1 };
}

type ResponseBody = ConstructorParameters<typeof Response>[0];

function createProtocolResponse(
  method: string,
  body: ResponseBody,
  init: ResponseInit
): Response {
  // RFC 9110 §9.3.2: HEAD responses must never contain a message body.
  return new Response(method === 'HEAD' ? null : body, init);
}

function createWebReadStream(
  filePath: string,
  signal?: AbortSignal,
  options?: { start?: number; end?: number }
): ReadableStream<Uint8Array> {
  const nodeStream = fs.createReadStream(filePath, options);
  if (signal) {
    if (signal.aborted) {
      nodeStream.destroy();
    } else {
      const onAbort = () => nodeStream.destroy();
      signal.addEventListener('abort', onAbort, { once: true });
      nodeStream.once('close', () => signal.removeEventListener('abort', onAbort));
    }
  }
  return Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;
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
      return 'audio/mp4';
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

  protocol.handle('maja-audio', async (request) => {
    const method = request.method.toUpperCase();
    try {
      if (method !== 'GET' && method !== 'HEAD') {
        return createProtocolResponse(method, 'Method Not Allowed', {
          status: 405,
          headers: { Allow: 'GET, HEAD' },
        });
      }

      const parsedUrl = new URL(request.url);
      if (parsedUrl.hostname !== 'stream') {
        return createProtocolResponse(method, 'File not found', { status: 404 });
      }

      const rawPath = parsedUrl.searchParams.get('path');
      if (!rawPath || rawPath.includes('\0') || !path.isAbsolute(rawPath)) {
        return createProtocolResponse(method, 'File not found', { status: 404 });
      }

      const filePath = normalizePlatformPath(rawPath);
      if (!isSupportedAudioPath(filePath) || !isTrackPathKnown(filePath)) {
        return createProtocolResponse(method, 'File not found', { status: 404 });
      }

      const stat = await fs.promises.stat(filePath);
      if (!stat.isFile()) {
        return createProtocolResponse(method, 'File not found', { status: 404 });
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
          return createProtocolResponse(method, 'Range Not Satisfiable', {
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
            return createProtocolResponse(method, null, {
              status: 206,
              statusText: 'Partial Content',
              headers,
            });
          }

          const webStream = createWebReadStream(filePath, request.signal, { start, end });
          return new Response(webStream, {
            status: 206,
            statusText: 'Partial Content',
            headers,
          });
        }
      }

      if (method === 'HEAD') {
        return createProtocolResponse(method, null, {
          status: 200,
          headers: {
            ...baseHeaders,
            'Content-Length': fileSize.toString(),
          },
        });
      }

      const webStream = createWebReadStream(filePath, request.signal);
      return new Response(webStream, {
        status: 200,
        headers: {
          ...baseHeaders,
          'Content-Length': fileSize.toString(),
        },
      });
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code !== 'ENOENT') {
        console.error('Error serving audio protocol:', err);
      }
      return createProtocolResponse(method, 'File not found', { status: 404 });
    }
  });

  protocol.handle('maja-artwork', async (request) => {
    const method = request.method.toUpperCase();
    try {
      if (method !== 'GET' && method !== 'HEAD') {
        return createProtocolResponse(method, 'Method Not Allowed', {
          status: 405,
          headers: { Allow: 'GET, HEAD' },
        });
      }

      const parsedUrl = new URL(request.url);

      if (parsedUrl.hostname === 'stream') {
        const fileName = parsedUrl.searchParams.get('file');
        if (
          !fileName ||
          fileName.includes('\0') ||
          !fileName.startsWith('art_') ||
          path.basename(fileName) !== fileName
        ) {
          return createProtocolResponse(method, 'Artwork not found', { status: 404 });
        }

        const artDir = path.resolve(ensureArtworkDirExists());
        const fullPath = path.resolve(artDir, fileName);
        if (!isPathInside(artDir, fullPath) || !isImagePath(fullPath)) {
          return createProtocolResponse(method, 'Artwork not found', { status: 404 });
        }

        const stat = await fs.promises.stat(fullPath);
        if (!stat.isFile()) {
          return createProtocolResponse(method, 'Artwork not found', { status: 404 });
        }

        return await net.fetch(pathToFileURL(fullPath).toString(), {
          headers: request.headers,
          method: request.method,
        });
      }

      if (parsedUrl.hostname === 'load') {
        const targetPath = extractWallpaperPath(request.url);
        if (!targetPath) {
          return createProtocolResponse(method, 'Artwork not found', { status: 404 });
        }

        if (!isWallpaperPathApproved(targetPath)) {
          return createProtocolResponse(method, 'Access denied: unapproved wallpaper path', {
            status: 403,
          });
        }

        if (!isImagePath(targetPath)) {
          return createProtocolResponse(method, 'Artwork not found', { status: 404 });
        }

        const stat = await fs.promises.stat(targetPath);
        if (!stat.isFile()) {
          return createProtocolResponse(method, 'Artwork not found', { status: 404 });
        }

        return await net.fetch(pathToFileURL(targetPath).toString(), {
          headers: request.headers,
          method: request.method,
        });
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code !== 'ENOENT') {
        console.error('Error serving artwork protocol:', err);
      }
    }
    return createProtocolResponse(method, 'Artwork not found', { status: 404 });
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

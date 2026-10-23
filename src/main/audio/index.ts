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

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.avif']);

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

function parseRangeHeader(rangeHeader: string, fileSize: number): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!match) return null;

  const [, rawStart, rawEnd] = match;
  if (!rawStart && !rawEnd) return null;

  let start: number;
  let end: number;

  if (!rawStart) {
    const suffixLength = Number(rawEnd);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null;
    start = Math.max(0, fileSize - suffixLength);
    end = fileSize - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd ? Number(rawEnd) : fileSize - 1;
  }

  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) return null;
  if (start < 0 || start >= fileSize || end < start) return null;

  return { start, end: Math.min(end, fileSize - 1) };
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

export function registerAudioProtocols(): void {
  protocol.handle('maja-audio', (request) => {
    try {
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

      if (rangeHeader) {
        const range = parseRangeHeader(rangeHeader, fileSize);
        if (!range) {
          return new Response('Range Not Satisfiable', {
            status: 416,
            headers: {
              'Content-Range': `bytes */${fileSize}`,
              'Accept-Ranges': 'bytes',
            },
          });
        }

        const { start, end } = range;
        const nodeStream = fs.createReadStream(filePath, { start, end });
        const webStream = Readable.toWeb(nodeStream);

        return new Response(webStream as any, {
          status: 206,
          statusText: 'Partial Content',
          headers: {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': (end - start + 1).toString(),
            'Content-Type': mimeType,
          },
        });
      }

      const nodeStream = fs.createReadStream(filePath);
      const webStream = Readable.toWeb(nodeStream);

      return new Response(webStream as any, {
        status: 200,
        headers: {
          'Content-Length': fileSize.toString(),
          'Accept-Ranges': 'bytes',
          'Content-Type': mimeType,
        },
      });
    } catch (err) {
      console.error('Error serving audio protocol:', err);
    }
    return new Response('File not found', { status: 404 });
  });

  protocol.handle('maja-artwork', (request) => {
    try {
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
        const directPath = parsedUrl.searchParams.get('path');
        if (!directPath) {
          return new Response('Artwork not found', { status: 404 });
        }

        let targetPath = directPath;
        if (!fs.existsSync(targetPath)) {
          try {
            targetPath = decodeURIComponent(targetPath);
          } catch (_) {}
        }

        if (
          !path.isAbsolute(targetPath) ||
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

    const isBitPerfect = codec === 'FLAC' || codec === 'WAV';

    return {
      codec,
      sampleRate,
      bitDepth,
      channels,
      bitrate,
      outputDevice: 'Default (WASAPI)',
      outputMode: isBitPerfect ? 'WASAPI Shared' : 'Default',
      isBitPerfect,
    };
  } catch (err) {
    console.error('Error reading format info:', err);
    return {
      codec: path.extname(filePath).replace('.', '').toUpperCase(),
      sampleRate: 44100,
      bitDepth: 16,
      channels: 2,
      outputDevice: 'Default (WASAPI)',
      outputMode: 'WASAPI Shared',
      isBitPerfect: false,
    };
  }
}

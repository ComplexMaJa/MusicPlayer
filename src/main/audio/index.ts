import * as musicMetadata from 'music-metadata';
import path from 'path';
import fs from 'fs';
import { Readable } from 'stream';
import { protocol, net } from 'electron';
import { pathToFileURL } from 'url';
import { AudioFormatInfo } from '../../shared/types';
import { ensureArtworkDirExists } from '../library';

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
        bypassCSP: true,
      },
    },
    {
      scheme: 'maja-artwork',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        bypassCSP: true,
      },
    },
  ]);
}

export function registerAudioProtocols(): void {
  protocol.handle('maja-audio', (request) => {
    try {
      const parsedUrl = new URL(request.url);
      const filePath = parsedUrl.searchParams.get('path');
      if (filePath && fs.existsSync(filePath)) {
        const stat = fs.statSync(filePath);
        const fileSize = stat.size;
        const mimeType = getMimeType(filePath);
        const rangeHeader = request.headers.get('range');

        if (rangeHeader) {
          const parts = rangeHeader.replace(/bytes=/, '').split('-');
          const start = parseInt(parts[0], 10);
          const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
          const chunksize = end - start + 1;

          const nodeStream = fs.createReadStream(filePath, { start, end });
          const webStream = Readable.toWeb(nodeStream);

          return new Response(webStream as any, {
            status: 206,
            statusText: 'Partial Content',
            headers: {
              'Content-Range': `bytes ${start}-${end}/${fileSize}`,
              'Accept-Ranges': 'bytes',
              'Content-Length': chunksize.toString(),
              'Content-Type': mimeType,
            },
          });
        } else {
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
        }
      }
    } catch (err) {
      console.error('Error serving audio protocol:', err);
    }
    return new Response('File not found', { status: 404 });
  });

  protocol.handle('maja-artwork', (request) => {
    try {
      const parsedUrl = new URL(request.url);
      const fileName = parsedUrl.searchParams.get('file');
      const directPath = parsedUrl.searchParams.get('path');
      if (fileName) {
        const artDir = ensureArtworkDirExists();
        const fullPath = path.join(artDir, fileName);
        if (fs.existsSync(fullPath)) {
          return net.fetch(pathToFileURL(fullPath).toString(), {
            headers: request.headers,
            method: request.method,
          });
        }
      } else if (directPath && fs.existsSync(directPath)) {
        return net.fetch(pathToFileURL(directPath).toString(), {
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

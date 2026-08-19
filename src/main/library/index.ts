import * as musicMetadata from 'music-metadata';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { app, BrowserWindow } from 'electron';
import { findAudioFilesRecursive } from '../filesystem';
import { upsertTrack, removeTracksNotInPaths } from '../database';
import { Track, ScanProgress } from '../../shared/types';

const artworkCacheDir = () => path.join(app.getPath('userData'), 'artwork');

export function ensureArtworkDirExists(): string {
  const dir = artworkCacheDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export async function scanFolders(
  folders: string[],
  mainWindow: BrowserWindow | null
): Promise<void> {
  const cacheDir = ensureArtworkDirExists();
  const allAudioFiles: string[] = [];

  for (const folder of folders) {
    if (fs.existsSync(folder)) {
      const files = await findAudioFilesRecursive(folder);
      allAudioFiles.push(...files);
    }
  }

  const totalFiles = allAudioFiles.length;
  let processedFiles = 0;

  const notifyProgress = (file?: string, error?: string) => {
    if (!mainWindow) return;
    const progress: ScanProgress = {
      isScanning: processedFiles < totalFiles,
      totalFiles,
      processedFiles,
      currentFile: file ? path.basename(file) : undefined,
      error,
    };
    mainWindow.webContents.send('library:scanProgress', progress);
  };

  notifyProgress();

  const fileSet = new Set<string>();

  for (const filePath of allAudioFiles) {
    fileSet.add(filePath);
    processedFiles++;
    notifyProgress(filePath);

    try {
      const stats = await fs.promises.stat(filePath);
      const fileId = crypto.createHash('md5').update(filePath).digest('hex');

      const metadata = await musicMetadata.parseFile(filePath, { duration: true });

      const common = metadata.common;
      const format = metadata.format;

      let artworkPath: string | undefined;

      if (common.picture && common.picture.length > 0) {
        const pic = common.picture[0];
        const ext = pic.format.includes('png') ? 'png' : 'jpg';
        const artFileName = `art_${fileId}.${ext}`;
        const artFullPath = path.join(cacheDir, artFileName);

        if (!fs.existsSync(artFullPath)) {
          await fs.promises.writeFile(artFullPath, pic.data);
        }
        artworkPath = `maja-artwork://stream?file=${encodeURIComponent(artFileName)}`;
      }

      const track: Track = {
        id: fileId,
        path: filePath,
        title: common.title || path.basename(filePath, path.extname(filePath)),
        artist: common.artist || common.albumartist || 'Unknown Artist',
        album: common.album || 'Unknown Album',
        albumArtist: common.albumartist || undefined,
        trackNumber: common.track.no || undefined,
        discNumber: common.disk.no || undefined,
        genre: common.genre && common.genre.length ? common.genre.join(', ') : undefined,
        year: common.year || undefined,
        duration: format.duration || 0,
        codec: (format.container || format.codec || path.extname(filePath).replace('.', '')).toUpperCase(),
        sampleRate: format.sampleRate,
        bitDepth: format.bitsPerSample,
        bitrate: format.bitrate ? Math.round(format.bitrate / 1000) : undefined,
        channels: format.numberOfChannels,
        artworkPath,
        dateAdded: Math.round(stats.birthtimeMs || stats.ctimeMs || Date.now()),
        playCount: 0,
        isFavorite: false,
      };

      upsertTrack(track);
    } catch (err: any) {
      console.error(`Error parsing file ${filePath}:`, err);
      const fileId = crypto.createHash('md5').update(filePath).digest('hex');
      const ext = path.extname(filePath).replace('.', '').toUpperCase();
      const stats = fs.existsSync(filePath) ? fs.statSync(filePath) : null;
      upsertTrack({
        id: fileId,
        path: filePath,
        title: path.basename(filePath, path.extname(filePath)),
        artist: 'Unknown Artist',
        album: 'Unknown Album',
        duration: 0,
        codec: ext || 'AUDIO',
        dateAdded: stats ? stats.ctimeMs : Date.now(),
        playCount: 0,
        isFavorite: false,
      });
    }
  }

  removeTracksNotInPaths(fileSet);

  if (mainWindow) {
    mainWindow.webContents.send('library:scanProgress', {
      isScanning: false,
      totalFiles,
      processedFiles: totalFiles,
    });
  }
}

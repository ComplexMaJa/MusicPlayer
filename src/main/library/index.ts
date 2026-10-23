import * as musicMetadata from 'music-metadata';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { app, BrowserWindow } from 'electron';
import { findAudioFilesRecursive } from '../filesystem';
import { upsertTrack, removeTracksNotInPaths, saveDatabase } from '../database';
import { Track, ScanProgress } from '../../shared/types';

const artworkCacheDir = () => path.join(app.getPath('userData'), 'artwork');

export function ensureArtworkDirExists(): string {
  const dir = artworkCacheDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Scans the provided folders and prunes any indexed track that is not present
 * in one of them. Callers must pass the complete set of monitored folders;
 * passing a subset will remove tracks that belong to omitted folders. Pruning
 * is skipped when any requested folder is unavailable so a disconnected drive
 * or network share does not erase its tracks from the library.
 */
export async function scanFolders(
  folders: string[],
  mainWindow: BrowserWindow | null
): Promise<void> {
  const requestedFolders = Array.from(new Set(folders.filter((folder) => folder.length > 0)));
  const uniqueFolders = requestedFolders.filter((folder) => fs.existsSync(folder));
  const missingFolders = requestedFolders.filter((folder) => !fs.existsSync(folder));

  if (uniqueFolders.length === 0) {
    console.warn('Library scan skipped: no existing folders were provided');
    return;
  }

  if (missingFolders.length > 0) {
    console.warn(
      `Skipping track pruning because these folders are unavailable: ${missingFolders.join(', ')}`
    );
  }

  const cacheDir = ensureArtworkDirExists();
  const allAudioFiles: string[] = [];

  for (const folder of uniqueFolders) {
    const files = await findAudioFilesRecursive(folder);
    allAudioFiles.push(...files);
  }

  const totalFiles = allAudioFiles.length;
  let processedFiles = 0;
  let scanError: string | undefined;

  const notifyProgress = (file?: string) => {
    if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return;
    const progress: ScanProgress = {
      isScanning: processedFiles < totalFiles,
      totalFiles,
      processedFiles,
      currentFile: file ? path.basename(file) : undefined,
      error: scanError,
    };
    mainWindow.webContents.send('library:scanProgress', progress);
  };

  notifyProgress();

  const fileSet = new Set<string>();

  try {
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

    if (missingFolders.length === 0) {
      removeTracksNotInPaths(fileSet);
    }
  } catch (err: any) {
    scanError = err instanceof Error ? err.message : String(err);
    console.error('Library scan failed:', err);
  } finally {
    // Persist metadata for files processed before any unexpected failure.
    // The scanner's database mutations are otherwise only held in memory.
    saveDatabase();

    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
      mainWindow.webContents.send('library:scanProgress', {
        isScanning: false,
        totalFiles,
        processedFiles,
        error: scanError,
      } satisfies ScanProgress);
    }
  }
}

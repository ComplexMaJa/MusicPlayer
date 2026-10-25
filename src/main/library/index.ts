import * as musicMetadata from 'music-metadata';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { app, BrowserWindow } from 'electron';
import { findAudioFilesRecursive } from '../filesystem';
import {
  getAllArtworkPaths,
  upsertTrack,
  removeTracksNotInPaths,
  saveDatabase,
  normalizePathForPlatform,
} from '../database';
import { Track, ScanProgress } from '../../shared/types';

const artworkCacheDir = () => path.join(app.getPath('userData'), 'artwork');

export function ensureArtworkDirExists(): string {
  const dir = artworkCacheDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function getCachedArtworkName(artworkPath: string): string | null {
  try {
    const fileName = new URL(artworkPath).searchParams.get('file');
    return fileName && path.basename(fileName) === fileName ? fileName : null;
  } catch {
    return null;
  }
}

function pruneArtworkCache(cacheDir: string): void {
  try {
    const referenced = new Set(
      getAllArtworkPaths()
        .map(getCachedArtworkName)
        .filter((fileName): fileName is string => Boolean(fileName))
    );

    for (const fileName of fs.readdirSync(cacheDir)) {
      if (fileName.startsWith('art_') && !referenced.has(fileName)) {
        fs.rmSync(path.join(cacheDir, fileName), { force: true });
      }
    }
  } catch (err) {
    console.warn('Could not prune artwork cache:', err);
  }
}

let activeScanPromise: Promise<void> | null = null;
let hasQueuedScan = false;
let queuedFolders: string[] = [];
let queuedMainWindow: BrowserWindow | null = null;
let queuedScanPromise: Promise<void> | null = null;

export function isScanInProgress(): boolean {
  return activeScanPromise !== null || hasQueuedScan;
}

export async function scanFolders(
  folders: string[],
  mainWindow: BrowserWindow | null
): Promise<void> {
  if (activeScanPromise) {
    hasQueuedScan = true;
    queuedFolders = Array.from(new Set([...queuedFolders, ...folders]));
    if (mainWindow) {
      queuedMainWindow = mainWindow;
    }
    if (!queuedScanPromise) {
      queuedScanPromise = (async () => {
        try {
          await activeScanPromise;
        } catch (_) {}
        if (hasQueuedScan) {
          hasQueuedScan = false;
          const nextFolders = queuedFolders;
          const nextWindow = queuedMainWindow;
          queuedFolders = [];
          queuedMainWindow = null;
          queuedScanPromise = null;
          return scanFolders(nextFolders, nextWindow);
        }
      })();
    }
    return queuedScanPromise;
  }

  activeScanPromise = executeScanFolders(folders, mainWindow);
  try {
    await activeScanPromise;
  } finally {
    activeScanPromise = null;
  }
}

/**
 * Scans the provided folders and prunes any indexed track that is not present
 * in one of them. Callers must pass the complete set of monitored folders;
 * passing a subset will remove tracks that belong to omitted folders. Pruning
 * is skipped when any requested folder is unavailable so a disconnected drive
 * or network share does not erase its tracks from the library.
 */
async function executeScanFolders(
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
  let traversalHadErrors = false;

  for (const folder of uniqueFolders) {
    const { files, hasErrors } = await findAudioFilesRecursive(folder);
    allAudioFiles.push(...files);
    if (hasErrors) {
      traversalHadErrors = true;
    }
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
      const normalizedPath = normalizePathForPlatform(filePath);
      fileSet.add(normalizedPath);
      processedFiles++;
      notifyProgress(filePath);

      try {
        const stats = await fs.promises.stat(filePath);
        const fileId = crypto.createHash('md5').update(normalizedPath).digest('hex');

        const metadata = await musicMetadata.parseFile(filePath, { duration: true });

        const common = metadata.common;
        const format = metadata.format;

        let artworkPath: string | undefined;

        if (common.picture && common.picture.length > 0) {
          const pic = common.picture[0];
          const pictureFormat = pic.format.toLowerCase();
          const ext = pictureFormat.includes('png')
            ? 'png'
            : pictureFormat.includes('webp')
              ? 'webp'
              : pictureFormat.includes('gif')
                ? 'gif'
                : 'jpg';
          const artworkHash = crypto.createHash('md5').update(pic.data).digest('hex');
          const artFileName = `art_${artworkHash}.${ext}`;
          const artFullPath = path.join(cacheDir, artFileName);

          if (!fs.existsSync(artFullPath)) {
            await fs.promises.writeFile(artFullPath, pic.data);
          }
          artworkPath = `maja-artwork://stream?file=${encodeURIComponent(artFileName)}`;
        }

        const track: Track = {
          id: fileId,
          path: normalizedPath,
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
        const fileId = crypto.createHash('md5').update(normalizedPath).digest('hex');
        const ext = path.extname(filePath).replace('.', '').toUpperCase();
        const stats = fs.existsSync(filePath) ? fs.statSync(filePath) : null;
        upsertTrack({
          id: fileId,
          path: normalizedPath,
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

    if (missingFolders.length === 0 && !traversalHadErrors) {
      removeTracksNotInPaths(fileSet);
    } else if (traversalHadErrors) {
      console.warn('Skipping track pruning because one or more subdirectories could not be read');
    }
  } catch (err: any) {
    scanError = err instanceof Error ? err.message : String(err);
    console.error('Library scan failed:', err);
  } finally {
    // Persist metadata for files processed before any unexpected failure.
    // The scanner's database mutations are otherwise only held in memory.
    const saved = saveDatabase();

    if (saved && !scanError) {
      pruneArtworkCache(cacheDir);
    }

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

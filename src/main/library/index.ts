import * as musicMetadata from 'music-metadata';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { app, BrowserWindow } from 'electron';
import { findAudioFilesRecursive } from '../filesystem';
import {
  getAllArtworkPaths,
  getIndexedTracksForScan,
  upsertTracksBatch,
  removeTracksNotInPaths,
  saveDatabase,
  normalizePathForPlatform,
  UpsertTrackBatchItem,
} from '../database';
import { Track, ScanProgress } from '../../shared/types';

const PROGRESS_THROTTLE_MS = 100;
const UPSERT_BATCH_SIZE = 250;

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

function folderComparisonKey(folder: string): string {
  const normalized = normalizePathForPlatform(folder);
  const parsed = path.parse(normalized);
  const trimmed = normalized === parsed.root ? normalized : normalized.replace(/[\\/]+$/, '');
  return process.platform === 'win32' ? trimmed.toLowerCase() : trimmed;
}

function isNestedUnderFolder(ancestor: string, candidate: string): boolean {
  const ancestorKey = folderComparisonKey(ancestor);
  const candidateKey = folderComparisonKey(candidate);
  if (ancestorKey === candidateKey) return true;
  const prefix = ancestorKey.endsWith(path.sep) ? ancestorKey : `${ancestorKey}${path.sep}`;
  return candidateKey.startsWith(prefix);
}

function stripOverlappingChildFolders(folders: string[]): string[] {
  const sorted = [...folders].sort(
    (a, b) => folderComparisonKey(a).length - folderComparisonKey(b).length
  );
  const roots: string[] = [];
  for (const folder of sorted) {
    if (!roots.some((root) => isNestedUnderFolder(root, folder))) {
      roots.push(folder);
    }
  }
  return roots;
}

async function writeArtworkAtomically(
  cacheDir: string,
  artFileName: string,
  data: Uint8Array,
  existingArtworkFiles: Set<string>
): Promise<void> {
  if (existingArtworkFiles.has(artFileName)) {
    return;
  }
  const artFullPath = path.join(cacheDir, artFileName);
  const tempPath = path.join(
    cacheDir,
    `.tmp-${artFileName}-${process.pid}-${crypto.randomUUID()}`
  );
  try {
    await fs.promises.writeFile(tempPath, data);
    await fs.promises.rename(tempPath, artFullPath);
    existingArtworkFiles.add(artFileName);
  } catch (err) {
    try {
      await fs.promises.rm(tempPath, { force: true });
    } catch {
      // Ignore temp cleanup errors.
    }
    throw err;
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
    queuedFolders = folders.slice();
    if (mainWindow) {
      queuedMainWindow = mainWindow;
    }
    if (!queuedScanPromise) {
      queuedScanPromise = (async () => {
        try {
          await activeScanPromise;
        } catch {
          // Active scan failure is handled in executeScanFolders; proceed to queued scan.
        }
        let nextFolders: string[] | null = null;
        let nextWindow: BrowserWindow | null = null;
        try {
          if (hasQueuedScan) {
            hasQueuedScan = false;
            nextFolders = queuedFolders;
            nextWindow = queuedMainWindow;
            queuedFolders = [];
            queuedMainWindow = null;
          }
        } finally {
          queuedScanPromise = null;
        }
        if (nextFolders !== null) {
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
 * or network share does not erase its tracks from the library. When the
 * configured folder set is intentionally empty, all tracks are pruned.
 */
async function executeScanFolders(
  folders: string[],
  mainWindow: BrowserWindow | null
): Promise<void> {
  const dedupedRequested = new Map<string, string>();
  for (const rawFolder of folders) {
    if (typeof rawFolder !== 'string') continue;
    const trimmed = rawFolder.trim();
    if (trimmed.length === 0) continue;
    const normalized = normalizePathForPlatform(trimmed);
    const key = folderComparisonKey(normalized);
    if (!dedupedRequested.has(key)) {
      dedupedRequested.set(key, normalized);
    }
  }
  const requestedFolders = Array.from(dedupedRequested.values());

  let totalFiles = 0;
  let processedFiles = 0;
  let scanError: string | undefined;
  let lastProgressEmitAt = 0;
  let shouldPruneArtwork = false;
  let cacheDir = '';

  const emitProgress = (isScanning: boolean, file?: string, force = false) => {
    if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return;
    const now = Date.now();
    if (!force && isScanning && now - lastProgressEmitAt < PROGRESS_THROTTLE_MS) {
      return;
    }
    lastProgressEmitAt = now;
    const progress: ScanProgress = {
      isScanning,
      totalFiles,
      processedFiles,
      currentFile: file ? path.basename(file) : undefined,
      error: scanError,
    };
    mainWindow.webContents.send('library:scanProgress', progress);
  };

  try {
    cacheDir = ensureArtworkDirExists();
    emitProgress(true, undefined, true);

    if (requestedFolders.length === 0) {
      removeTracksNotInPaths(new Set());
      shouldPruneArtwork = true;
      return;
    }

    const existingFolders: string[] = [];
    const missingFolders: string[] = [];

    for (const folder of requestedFolders) {
      try {
        const stat = await fs.promises.stat(folder);
        if (stat.isDirectory()) {
          existingFolders.push(folder);
        } else {
          missingFolders.push(folder);
        }
      } catch {
        missingFolders.push(folder);
      }
    }

    if (missingFolders.length > 0) {
      console.warn(
        `Skipping track pruning because these folders are unavailable: ${missingFolders.join(', ')}`
      );
    }

    if (existingFolders.length === 0) {
      console.warn('Library scan skipped: all configured folders are currently unavailable');
      return;
    }

    const foldersToWalk = stripOverlappingChildFolders(existingFolders);
    const discoveredFiles = new Map<string, string>();
    let traversalHadErrors = false;

    for (const folder of foldersToWalk) {
      const { files, hasErrors } = await findAudioFilesRecursive(folder);
      if (hasErrors) {
        traversalHadErrors = true;
      }
      for (const filePath of files) {
        const normalizedPath = normalizePathForPlatform(filePath);
        const dedupeKey =
          process.platform === 'win32' ? normalizedPath.toLowerCase() : normalizedPath;
        if (!discoveredFiles.has(dedupeKey)) {
          discoveredFiles.set(dedupeKey, normalizedPath);
        }
      }
    }

    const allAudioFiles = Array.from(discoveredFiles.values());
    totalFiles = allAudioFiles.length;
    emitProgress(true, undefined, true);

    const existingArtworkFiles = new Set<string>(
      (await fs.promises.readdir(cacheDir)).filter((name) => name.startsWith('art_'))
    );
    const indexedTracks = getIndexedTracksForScan();
    const fileSet = new Set<string>();
    const pendingUpserts: UpsertTrackBatchItem[] = [];

    const flushUpsertBatch = () => {
      if (pendingUpserts.length > 0) {
        upsertTracksBatch(pendingUpserts);
        pendingUpserts.length = 0;
      }
    };

    for (const normalizedPath of allAudioFiles) {
      fileSet.add(normalizedPath);
      processedFiles++;
      emitProgress(true, normalizedPath);

      const fileId = crypto.createHash('md5').update(normalizedPath).digest('hex');
      const existing = indexedTracks.get(normalizedPath);

      try {
        const stats = await fs.promises.stat(normalizedPath);

        if (
          existing &&
          existing.id === fileId &&
          existing.fileMtime !== null &&
          existing.fileSize !== null &&
          Math.abs(stats.mtimeMs - existing.fileMtime) < 1 &&
          stats.size === existing.fileSize
        ) {
          const cachedArtName = existing.artworkPath
            ? getCachedArtworkName(existing.artworkPath)
            : null;
          if (!cachedArtName || existingArtworkFiles.has(cachedArtName)) {
            continue;
          }
        }

        const metadata = await musicMetadata.parseFile(normalizedPath, { duration: true });
        const common = metadata.common;
        const format = metadata.format;

        let artworkPath: string | undefined;

        if (common.picture && common.picture.length > 0) {
          const pic = common.picture[0];
          const pictureFormat = (pic.format || '').toLowerCase();
          const ext = pictureFormat.includes('png')
            ? 'png'
            : pictureFormat.includes('webp')
              ? 'webp'
              : pictureFormat.includes('gif')
                ? 'gif'
                : 'jpg';
          const artworkHash = crypto.createHash('md5').update(pic.data).digest('hex');
          const artFileName = `art_${artworkHash}.${ext}`;

          await writeArtworkAtomically(cacheDir, artFileName, pic.data, existingArtworkFiles);
          artworkPath = `maja-artwork://stream?file=${encodeURIComponent(artFileName)}`;
        }

        const track: Track = {
          id: fileId,
          path: normalizedPath,
          title: common.title || path.basename(normalizedPath, path.extname(normalizedPath)),
          artist: common.artist || common.albumartist || 'Unknown Artist',
          album: common.album || 'Unknown Album',
          albumArtist: common.albumartist || undefined,
          trackNumber: common.track.no ?? undefined,
          discNumber: common.disk.no ?? undefined,
          genre: common.genre && common.genre.length ? common.genre.join(', ') : undefined,
          year: common.year ?? undefined,
          duration: format.duration || 0,
          codec: (
            format.container ||
            format.codec ||
            path.extname(normalizedPath).replace('.', '')
          ).toUpperCase(),
          sampleRate: format.sampleRate,
          bitDepth: format.bitsPerSample,
          bitrate: format.bitrate ? Math.round(format.bitrate / 1000) : undefined,
          channels: format.numberOfChannels,
          artworkPath,
          dateAdded: Math.round(stats.birthtimeMs || stats.ctimeMs || Date.now()),
          playCount: 0,
          isFavorite: false,
        };

        pendingUpserts.push({ track, fileMtime: stats.mtimeMs, size: stats.size });
        if (pendingUpserts.length >= UPSERT_BATCH_SIZE) {
          flushUpsertBatch();
        }
      } catch (err) {
        console.error(`Error parsing file ${normalizedPath}:`, err);
        if (existing) {
          // Keep previously indexed valid metadata intact on transient read/lock failures.
          continue;
        }
        const ext = path.extname(normalizedPath).replace('.', '').toUpperCase();
        const stats = await fs.promises.stat(normalizedPath).catch(() => null);
        pendingUpserts.push({
          track: {
            id: fileId,
            path: normalizedPath,
            title: path.basename(normalizedPath, path.extname(normalizedPath)),
            artist: 'Unknown Artist',
            album: 'Unknown Album',
            duration: 0,
            codec: ext || 'AUDIO',
            dateAdded: stats ? Math.round(stats.birthtimeMs || stats.ctimeMs || Date.now()) : Date.now(),
            playCount: 0,
            isFavorite: false,
          },
        });
        if (pendingUpserts.length >= UPSERT_BATCH_SIZE) {
          flushUpsertBatch();
        }
      }
    }

    flushUpsertBatch();

    if (missingFolders.length === 0 && !traversalHadErrors) {
      removeTracksNotInPaths(fileSet);
      shouldPruneArtwork = true;
    } else if (traversalHadErrors) {
      console.warn('Skipping track pruning because one or more subdirectories could not be read');
    }
  } catch (err) {
    scanError = err instanceof Error ? err.message : String(err);
    console.error('Library scan failed:', err);
  } finally {
    const saved = saveDatabase();

    if (saved && !scanError && shouldPruneArtwork && cacheDir) {
      pruneArtworkCache(cacheDir);
    }

    emitProgress(false, undefined, true);
  }
}

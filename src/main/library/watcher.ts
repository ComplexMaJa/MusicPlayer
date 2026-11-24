import fs from 'fs';
import path from 'path';
import { BrowserWindow } from 'electron';
import { scanFolders } from './index';
import { normalizePathForPlatform } from '../database';
import { SUPPORTED_EXTENSIONS } from '../../shared/constants';

const IGNORED_NON_AUDIO_FILE_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
  '.bmp',
  '.avif',
  '.svg',
  '.lrc',
  '.txt',
  '.nfo',
  '.cue',
  '.log',
  '.m3u',
  '.m3u8',
  '.pdf',
  '.db',
  '.ini',
  '.tmp',
  '.part',
  '.crdownload',
  '.ds_store',
]);

const OFFLINE_RECONNECT_POLL_MS = 10000;

function folderKey(folder: string): string {
  const normalized = normalizePathForPlatform(folder);
  const parsed = path.parse(normalized);
  const trimmed = normalized === parsed.root ? normalized : normalized.replace(/[\\/]+$/, '');
  return process.platform === 'win32' ? trimmed.toLowerCase() : trimmed;
}

function deduplicateFolders(folders: string[]): string[] {
  const seen = new Map<string, string>();
  for (const raw of folders) {
    if (typeof raw !== 'string') continue;
    const trimmed = raw.trim();
    if (trimmed.length === 0) continue;
    const normalized = normalizePathForPlatform(trimmed);
    const key = folderKey(normalized);
    if (!seen.has(key)) {
      seen.set(key, normalized);
    }
  }
  return Array.from(seen.values());
}

function isExistingDirectory(folder: string): boolean {
  try {
    return fs.statSync(folder).isDirectory();
  } catch {
    return false;
  }
}

class FolderWatcherManager {
  private watchers: Map<string, fs.FSWatcher> = new Map();
  private debounceTimer: NodeJS.Timeout | null = null;
  private offlinePollTimer: NodeJS.Timeout | null = null;
  private currentFolders: string[] = [];
  private allConfiguredFolders: string[] = [];
  private mainWindow: BrowserWindow | null = null;
  private isScanning = false;
  private hasPendingRescan = false;
  private isStopped = true;

  public setMainWindow(window: BrowserWindow | null): void {
    this.mainWindow = window;
  }

  public updateFolders(folders: string[], mainWindow?: BrowserWindow | null): void {
    if (mainWindow !== undefined) {
      this.mainWindow = mainWindow;
    }
    this.isStopped = false;
    this.allConfiguredFolders = deduplicateFolders(folders);
    this.currentFolders = this.allConfiguredFolders.filter(isExistingDirectory);
    this.syncWatchers();
    this.syncOfflineFolderPolling();
  }

  public startWatching(folders: string[], mainWindow?: BrowserWindow | null): void {
    this.updateFolders(folders, mainWindow);
  }

  public stopWatching(): void {
    this.isStopped = true;
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.offlinePollTimer) {
      clearInterval(this.offlinePollTimer);
      this.offlinePollTimer = null;
    }
    this.hasPendingRescan = false;
    for (const [folder, watcher] of this.watchers.entries()) {
      try {
        watcher.close();
      } catch (err) {
        console.warn(`Error closing watcher for ${folder}:`, err);
      }
    }
    this.watchers.clear();
  }

  private syncOfflineFolderPolling(): void {
    const hasMissingFolders = this.allConfiguredFolders.length > this.currentFolders.length;
    if (!hasMissingFolders || this.isStopped) {
      if (this.offlinePollTimer) {
        clearInterval(this.offlinePollTimer);
        this.offlinePollTimer = null;
      }
      return;
    }

    if (this.offlinePollTimer) return;

    this.offlinePollTimer = setInterval(() => {
      if (this.isStopped) return;
      const available = this.allConfiguredFolders.filter(isExistingDirectory);
      if (available.length !== this.currentFolders.length) {
        this.currentFolders = available;
        this.syncWatchers();
        this.syncOfflineFolderPolling();
        this.scheduleRescan();
      }
    }, OFFLINE_RECONNECT_POLL_MS);
    this.offlinePollTimer.unref();
  }

  private syncWatchers(): void {
    const targetSet = new Set(this.currentFolders);

    // Close watchers for removed folders
    for (const [folder, watcher] of this.watchers.entries()) {
      if (!targetSet.has(folder)) {
        try {
          watcher.close();
        } catch (err) {
          console.warn(`Error closing watcher for ${folder}:`, err);
        }
        this.watchers.delete(folder);
      }
    }

    // Add watchers for new folders
    for (const folder of this.currentFolders) {
      if (!this.watchers.has(folder) && isExistingDirectory(folder)) {
        try {
          const watcher = fs.watch(folder, { recursive: true }, (_eventType, filename) => {
            void this.handleFsEvent(folder, filename);
          });
          watcher.on('error', (err) => {
            console.warn(`Watcher error for ${folder}:`, err);
            try {
              watcher.close();
            } catch {
              // Ignore close error on failed watcher.
            }
            if (this.watchers.get(folder) === watcher) {
              this.watchers.delete(folder);
            }
            this.currentFolders = this.allConfiguredFolders.filter(isExistingDirectory);
            this.syncOfflineFolderPolling();
          });
          this.watchers.set(folder, watcher);
        } catch (err) {
          console.warn(`Failed to attach watcher to ${folder}:`, err);
        }
      }
    }
  }

  private async handleFsEvent(watchedFolder: string, filename: string | null): Promise<void> {
    if (this.isStopped) return;

    if (filename) {
      const ext = path.extname(filename).toLowerCase();
      if (ext && !SUPPORTED_EXTENSIONS.includes(ext)) {
        // Directory names can contain dots (e.g. "R.E.M.", "Album (2024.05)").
        // Check whether the path is a directory before discarding non-audio extensions.
        const fullPath = path.join(watchedFolder, filename);
        try {
          const stat = await fs.promises.stat(fullPath);
          if (!stat.isDirectory()) {
            return;
          }
        } catch {
          // Path was deleted or renamed away: skip known non-audio file extensions,
          // but still rescan for unknown/dotted directory deletions.
          if (IGNORED_NON_AUDIO_FILE_EXTENSIONS.has(ext)) {
            return;
          }
        }
      }
    }

    this.scheduleRescan();
  }

  private scheduleRescan(): void {
    if (this.isStopped) return;

    if (this.isScanning) {
      this.hasPendingRescan = true;
      return;
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(async () => {
      this.debounceTimer = null;
      if (this.isStopped || this.allConfiguredFolders.length === 0) {
        return;
      }
      if (this.isScanning) {
        this.hasPendingRescan = true;
        return;
      }
      this.isScanning = true;
      try {
        await scanFolders(this.allConfiguredFolders, this.mainWindow);

        if (
          !this.isStopped &&
          this.mainWindow &&
          !this.mainWindow.isDestroyed() &&
          !this.mainWindow.webContents.isDestroyed()
        ) {
          this.mainWindow.webContents.send('library:changed');
        }
      } catch (err) {
        console.error('Error during auto-rescan triggered by file watcher:', err);
      } finally {
        this.isScanning = false;
        if (!this.isStopped && this.hasPendingRescan) {
          this.hasPendingRescan = false;
          this.scheduleRescan();
        }
      }
    }, 1500);
  }
}

export const folderWatcher = new FolderWatcherManager();

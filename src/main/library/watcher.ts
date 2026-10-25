import fs from 'fs';
import path from 'path';
import { BrowserWindow } from 'electron';
import { scanFolders } from './index';
import { SUPPORTED_EXTENSIONS } from '../../shared/constants';

class FolderWatcherManager {
  private watchers: Map<string, fs.FSWatcher> = new Map();
  private debounceTimer: NodeJS.Timeout | null = null;
  private currentFolders: string[] = [];
  private allConfiguredFolders: string[] = [];
  private mainWindow: BrowserWindow | null = null;
  private isScanning = false;
  private hasPendingRescan = false;

  public setMainWindow(window: BrowserWindow | null): void {
    this.mainWindow = window;
  }

  public updateFolders(folders: string[], mainWindow?: BrowserWindow | null): void {
    if (mainWindow !== undefined) {
      this.mainWindow = mainWindow;
    }
    this.allConfiguredFolders = Array.from(new Set(folders.filter((f) => f && f.trim().length > 0)));
    this.currentFolders = Array.from(new Set(folders.filter((f) => fs.existsSync(f))));
    this.syncWatchers();
  }

  public startWatching(folders: string[], mainWindow?: BrowserWindow | null): void {
    this.updateFolders(folders, mainWindow);
  }

  public stopWatching(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
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
      if (!this.watchers.has(folder) && fs.existsSync(folder)) {
        try {
          // Use recursive watch where supported (Windows/macOS)
          const watcher = fs.watch(folder, { recursive: true }, (_eventType, filename) => {
            this.handleFsEvent(filename);
          });
          watcher.on('error', (err) => {
            console.warn(`Watcher error for ${folder}:`, err);
          });
          this.watchers.set(folder, watcher);
        } catch (err) {
          console.warn(`Failed to attach watcher to ${folder}:`, err);
        }
      }
    }
  }

  private handleFsEvent(filename: string | null): void {
    if (filename) {
      const ext = path.extname(filename).toLowerCase();
      // If it's a file with an extension not in SUPPORTED_EXTENSIONS, ignore (unless empty ext like a directory rename)
      if (ext && !SUPPORTED_EXTENSIONS.includes(ext)) {
        return;
      }
    }

    if (this.isScanning) {
      this.hasPendingRescan = true;
      return;
    }

    // Trigger debounced scan across all monitored folders
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(async () => {
      if (this.isScanning || this.allConfiguredFolders.length === 0) {
        if (this.isScanning) {
          this.hasPendingRescan = true;
        }
        return;
      }
      this.isScanning = true;
      try {
        await scanFolders(this.allConfiguredFolders, this.mainWindow);

        if (
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
        if (this.hasPendingRescan) {
          this.hasPendingRescan = false;
          this.handleFsEvent(null);
        }
      }
    }, 1500);
  }
}

export const folderWatcher = new FolderWatcherManager();

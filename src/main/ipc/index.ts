import { ipcMain, dialog, BrowserWindow, app } from 'electron';
import type { IpcMainEvent, IpcMainInvokeEvent } from 'electron';
import fs from 'fs';
import path from 'path';
import {
  getAllTracks,
  getAlbums,
  getArtists,
  getAllPlaylists,
  createPlaylistInDb,
  deletePlaylistInDb,
  addTrackToPlaylistInDb,
  addTracksToPlaylistInDb,
  getTracksByAlbum,
  getTracksByArtist,
  removeTrackFromPlaylistInDb,
  getPlaylistTracksFromDb,
  toggleFavoriteInDb,
  getFavorites,
  getRecentlyPlayed,
  getRecentlyAdded,
  recordPlayInDb,
  getLibraryStats,
  isTrackPathKnown,
} from '../database';
import { scanFolders } from '../library';
import { folderWatcher } from '../library/watcher';
import {
  getAudioFormatInfo,
  isAllowedWallpaperUrl,
  rememberSelectedWallpaper,
} from '../audio';
import { getLyricsForTrack } from '../lyrics';
import {
  updatePresence,
  clearPresence,
  disconnect as disconnectDiscordRPC,
  initDiscordRPC,
  setDiscordClientId,
} from '../discord';
import { isAllowedInternalUrl } from '../security';
import { Settings, Track, LyricProviderOption } from '../../shared/types';
import { DEFAULT_SETTINGS } from '../../shared/constants';

let currentSettings: Settings = { ...DEFAULT_SETTINGS };

const getSettingsFilePath = () => path.join(app.getPath('userData'), 'settings.json');

function isTrustedIpcSender(event: IpcMainInvokeEvent | IpcMainEvent): boolean {
  const frame = event.senderFrame;
  const mainFrame = event.sender.mainFrame;
  if (!frame || !mainFrame) return false;
  if (frame.processId !== mainFrame.processId || frame.routingId !== mainFrame.routingId) {
    return false;
  }
  return isAllowedInternalUrl(frame.url);
}

type IpcHandler = (event: IpcMainInvokeEvent, ...args: any[]) => unknown;

function handle(channel: string, listener: IpcHandler): void {
  ipcMain.handle(channel, (event, ...args) => {
    if (!isTrustedIpcSender(event)) {
      throw new Error(`Blocked IPC request from an untrusted frame: ${channel}`);
    }
    return listener(event, ...args);
  });
}

function on(channel: string, listener: (event: IpcMainEvent) => void): void {
  ipcMain.on(channel, (event) => {
    if (!isTrustedIpcSender(event)) return;
    listener(event);
  });
}

const BOOLEAN_SETTING_KEYS = [
  'isMuted',
  'discordEnabled',
  'discordShowTrack',
  'discordShowElapsed',
  'customBackgroundEnabled',
  'reducedMotion',
] as const;

const STRING_SETTING_KEYS = [
  'discordClientId',
  'discordLargeImage',
  'discordLargeImageText',
  'accentColor',
] as const;

const NUMBER_SETTING_KEYS = ['volume', 'customBackgroundOpacity', 'customBackgroundBlur'] as const;

const approvedFolderPaths = new Set<string>();

function folderKey(folder: string): string {
  const resolved = path.resolve(folder);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

/** Records folders returned by the native picker so only user-chosen roots can
 * be added to the monitored library. */
function rememberSelectedFolders(folders: string[]): void {
  for (const folder of folders) {
    approvedFolderPaths.add(folderKey(folder));
  }
}

function isPersistedWallpaperUrl(value: string): boolean {
  return (
    value === '' ||
    value.startsWith('http://') ||
    value.startsWith('https://') ||
    value.startsWith('maja-artwork://load?path=')
  );
}

/**
 * Accepts only the known settings fields with the expected primitive types.
 * This keeps a compromised renderer from persisting values that later crash the
 * main process or expand the privileged file boundary.
 */
function sanitizeSettingsPatch(
  input: unknown,
  allowPersistedValues = false
): Partial<Settings> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};

  const raw = input as Record<string, unknown>;
  const patch: Record<string, unknown> = {};

  for (const key of BOOLEAN_SETTING_KEYS) {
    if (typeof raw[key] === 'boolean') patch[key] = raw[key];
  }

  for (const key of STRING_SETTING_KEYS) {
    if (typeof raw[key] === 'string') patch[key] = raw[key];
  }

  for (const key of NUMBER_SETTING_KEYS) {
    if (typeof raw[key] === 'number' && Number.isFinite(raw[key])) patch[key] = raw[key];
  }

  if (typeof patch.volume === 'number') {
    patch.volume = Math.min(1, Math.max(0, patch.volume));
  }
  if (typeof patch.customBackgroundOpacity === 'number') {
    patch.customBackgroundOpacity = Math.min(1, Math.max(0, patch.customBackgroundOpacity));
  }
  if (typeof patch.customBackgroundBlur === 'number') {
    patch.customBackgroundBlur = Math.min(100, Math.max(0, patch.customBackgroundBlur));
  }

  if (
    raw.customBackgroundFit === 'cover' ||
    raw.customBackgroundFit === 'contain' ||
    raw.customBackgroundFit === 'tile'
  ) {
    patch.customBackgroundFit = raw.customBackgroundFit;
  }
  if (raw.discordActivityType === 'listening' || raw.discordActivityType === 'playing') {
    patch.discordActivityType = raw.discordActivityType;
  }
  if (
    raw.lyricsProvider === 'auto' ||
    raw.lyricsProvider === 'online' ||
    raw.lyricsProvider === 'embedded' ||
    raw.lyricsProvider === 'local'
  ) {
    patch.lyricsProvider = raw.lyricsProvider;
  }

  if (Array.isArray(raw.musicFolders)) {
    const existingFolders = new Set(currentSettings.musicFolders.map(folderKey));
    const rawFolders = raw.musicFolders;
    const hasInvalidEntry = rawFolders.some(
      (folder) =>
        typeof folder !== 'string' || folder.trim().length === 0 || folder.includes('\0')
    );

    if (hasInvalidEntry) {
      console.warn('Rejected a music folder list containing invalid entries');
    } else {
      const normalizedFolders = (rawFolders as string[]).map((folder) => path.resolve(folder.trim()));
      const hasUnapprovedEntry =
        !allowPersistedValues &&
        normalizedFolders.some((folder) => {
          const key = folderKey(folder);
          return !approvedFolderPaths.has(key) && !existingFolders.has(key);
        });

      if (hasUnapprovedEntry) {
        console.warn('Rejected a music folder list containing unapproved paths');
      } else {
        const seen = new Set<string>();
        patch.musicFolders = normalizedFolders.filter((folder) => {
          const key = folderKey(folder);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      }
    }
  }

  if (typeof raw.customBackgroundUrl === 'string') {
    const proposedUrl = raw.customBackgroundUrl;
    const isUnchanged = proposedUrl === currentSettings.customBackgroundUrl;
    const isTrustedPersistedValue = allowPersistedValues && isPersistedWallpaperUrl(proposedUrl);
    if (isUnchanged || isTrustedPersistedValue || isAllowedWallpaperUrl(proposedUrl)) {
      patch.customBackgroundUrl = proposedUrl;
    } else {
      console.warn('Rejected an unapproved custom background URL');
      if (raw.customBackgroundEnabled === true) {
        patch.customBackgroundEnabled = false;
      }
    }
  }

  return patch as Partial<Settings>;
}

export function loadSettings(): Settings {
  const filePath = getSettingsFilePath();
  if (fs.existsSync(filePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      currentSettings = {
        ...DEFAULT_SETTINGS,
        ...sanitizeSettingsPatch(data, true),
      };
      // Auto-migrate defunct default client ID if present
      if (currentSettings.discordClientId === '1223948332155703357' || !currentSettings.discordClientId) {
        currentSettings.discordClientId = DEFAULT_SETTINGS.discordClientId;
        try {
          fs.writeFileSync(filePath, JSON.stringify(currentSettings, null, 2));
        } catch (_) {}
      }
    } catch (err) {
      console.error('Error loading settings:', err);
      currentSettings = { ...DEFAULT_SETTINGS };
    }
  }
  return currentSettings;
}

export function saveSettings(settings: Partial<Settings>): Settings {
  const patch = sanitizeSettingsPatch(settings);
  currentSettings = { ...currentSettings, ...patch };
  try {
    fs.writeFileSync(getSettingsFilePath(), JSON.stringify(currentSettings, null, 2));

    // Handle Discord RPC updates
    if (patch.discordClientId && currentSettings.discordEnabled && patch.discordEnabled !== true) {
      setDiscordClientId(patch.discordClientId);
    }
    if (patch.discordEnabled === false) {
      clearPresence();
      disconnectDiscordRPC();
    } else if (patch.discordEnabled === true) {
      initDiscordRPC(currentSettings.discordClientId);
    }

    // Handle folder watcher updates if musicFolders changed
    if (patch.musicFolders) {
      folderWatcher.updateFolders(currentSettings.musicFolders);
    }
  } catch (err) {
    console.error('Error saving settings:', err);
  }
  return currentSettings;
}

let ipcHandlersRegistered = false;

export function registerIpcHandlers(mainWindow: BrowserWindow): void {
  folderWatcher.setMainWindow(mainWindow);
  mainWindow.on('closed', () => {
    folderWatcher.setMainWindow(null);
  });
  loadSettings();

  // Start live folder watcher for monitored music folders
  folderWatcher.startWatching(currentSettings.musicFolders, mainWindow);

  // Initialize Discord RPC with loaded Client ID
  if (currentSettings.discordEnabled) {
    initDiscordRPC(currentSettings.discordClientId);
  }

  if (ipcHandlersRegistered) return;
  ipcHandlersRegistered = true;

  // Dialog & Folders
  handle('dialog:selectFolder', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? undefined;
    const result = win
      ? await dialog.showOpenDialog(win, {
          properties: ['openDirectory', 'multiSelections'],
          title: 'Select Music Folder',
        })
      : await dialog.showOpenDialog({
          properties: ['openDirectory', 'multiSelections'],
          title: 'Select Music Folder',
        });
    if (result.canceled) return null;
    rememberSelectedFolders(result.filePaths);
    return result.filePaths;
  });

  handle('dialog:selectImage', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? undefined;
    const result = win
      ? await dialog.showOpenDialog(win, {
          properties: ['openFile'],
          filters: [
            { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'avif'] },
          ],
          title: 'Select Custom Background Image',
        })
      : await dialog.showOpenDialog({
          properties: ['openFile'],
          filters: [
            { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'avif'] },
          ],
          title: 'Select Custom Background Image',
        });
    if (result.canceled || result.filePaths.length === 0) return null;
    return rememberSelectedWallpaper(result.filePaths[0]);
  });

  // Library Scanning
  handle('library:scan', async (event, folders: string[]) => {
    const selectedFolders = Array.isArray(folders)
      ? folders
          .filter(
            (folder): folder is string =>
              typeof folder === 'string' && folder.trim().length > 0 && !folder.includes('\0')
          )
          .map((folder) => path.resolve(folder.trim()))
      : [];
    const merged = Array.from(new Set([...currentSettings.musicFolders, ...selectedFolders]));

    if (merged.length === 0) {
      return;
    }

    const savedSettings = saveSettings({ musicFolders: merged });
    // Scan every monitored folder, not just the newly selected ones. This keeps
    // the pruning step from deleting tracks that belong to other folders.
    const win = BrowserWindow.fromWebContents(event.sender) ?? null;
    await scanFolders(savedSettings.musicFolders, win);
  });

  handle('library:getStats', async () => getLibraryStats());

  // Library Queries
  handle('library:getTracks', async () => getAllTracks());
  handle('library:getAlbums', async () => getAlbums());
  handle('library:getAlbumDetail', async (_event, albumId: string) => {
    const albums = getAlbums();
    const album = albums.find((a) => a.id === albumId);
    if (!album) return null;
    const tracks = getTracksByAlbum(album.artist, album.title);
    return { ...album, tracks };
  });

  handle('library:getArtists', async () => getArtists());
  handle('library:getArtistDetail', async (_event, artistId: string) => {
    const artists = getArtists();
    const artist = artists.find((a) => a.id === artistId);
    if (!artist) return null;
    const albums = getAlbums().filter((a) => a.artist === artist.name);
    const tracks = getTracksByArtist(artist.name);
    return { artist, albums, tracks };
  });

  handle('library:getRecentlyPlayed', async () => getRecentlyPlayed());
  handle('library:getRecentlyAdded', async () => getRecentlyAdded());

  // Playlists & Favorites
  handle('playlists:getAll', async () => getAllPlaylists());
  handle('playlists:create', async (_event, name: string, description?: string) =>
    createPlaylistInDb(name, description)
  );
  handle('playlists:delete', async (_event, id: string) => deletePlaylistInDb(id));
  handle('playlists:addTrack', async (_event, playlistId: string, trackId: string) =>
    addTrackToPlaylistInDb(playlistId, trackId)
  );
  handle('playlists:addTracks', async (_event, playlistId: string, trackIds: string[]) =>
    addTracksToPlaylistInDb(playlistId, trackIds)
  );
  handle('library:addTracksToPlaylist', async (_event, playlistId: string, trackIds: string[]) =>
    addTracksToPlaylistInDb(playlistId, trackIds)
  );
  handle('playlists:removeTrack', async (_event, playlistId: string, trackId: string) =>
    removeTrackFromPlaylistInDb(playlistId, trackId)
  );
  handle('playlists:getTracks', async (_event, playlistId: string) =>
    getPlaylistTracksFromDb(playlistId)
  );
  handle('library:toggleFavorite', async (_event, trackId: string) => toggleFavoriteInDb(trackId));
  handle('library:getFavorites', async () => getFavorites());
  handle('library:recordPlay', async (_event, trackId: string) => recordPlayInDb(trackId));

  // Audio Engine Bridge
  handle('audio:getFormat', async (_event, filePath: string) => {
    if (typeof filePath !== 'string' || !isTrackPathKnown(filePath)) {
      throw new Error('Unknown track path');
    }

    return getAudioFormatInfo(filePath);
  });

  // Lyrics Engine
  handle('lyrics:getForTrack', async (_event, track: Track, provider?: LyricProviderOption) => {
    if (!track || typeof track.path !== 'string' || !isTrackPathKnown(track.path)) {
      return null;
    }

    return getLyricsForTrack(
      track,
      provider || (currentSettings.lyricsProvider as LyricProviderOption) || 'auto'
    );
  });

  // Settings
  handle('settings:get', async () => currentSettings);
  handle('settings:save', async (_event, settings: Partial<Settings>) => saveSettings(settings));

  // Discord RPC
  handle(
    'discord:updatePresence',
    async (_event, track: Track | null, isPlaying: boolean, currentTime: number) => {
      if (track !== null && (typeof track !== 'object' || typeof track.id !== 'string')) {
        return;
      }

      const safeTime =
        typeof currentTime === 'number' && Number.isFinite(currentTime) ? currentTime : 0;

      if (currentSettings.discordEnabled) {
        updatePresence(
          track,
          Boolean(isPlaying),
          safeTime,
          currentSettings.discordShowTrack ?? true,
          currentSettings.discordShowElapsed ?? true,
          currentSettings.discordLargeImage ?? 'logo',
          currentSettings.discordLargeImageText ?? 'MaJa Player',
          currentSettings.discordActivityType ?? 'listening'
        );
      } else {
        clearPresence();
      }
    }
  );

  // Window controls
  on('window:minimize', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize();
  });
  on('window:maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
  });
  on('window:close', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
  });
}

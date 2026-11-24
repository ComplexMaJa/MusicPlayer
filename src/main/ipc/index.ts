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
  setActiveWallpaperUrl,
} from '../audio';
import { getLyricsForTrack } from '../lyrics';
import {
  updatePresence,
  clearPresence,
  disconnect as disconnectDiscordRPC,
  initDiscordRPC,
  setDiscordClientId,
} from '../discord';
import {
  isAllowedInternalUrl,
  normalizePathForComparison,
  normalizePlatformPath,
} from '../security';
import { Settings, Track, LyricProviderOption } from '../../shared/types';
import { DEFAULT_SETTINGS } from '../../shared/constants';

let currentSettings: Settings = { ...DEFAULT_SETTINGS };

const getSettingsFilePath = () => path.join(app.getPath('userData'), 'settings.json');

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const DISCORD_CLIENT_ID_RE = /^\d{17,20}$/;
const MAX_FOLDER_COUNT = 200;
const MAX_BATCH_TRACK_IDS = 50000;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function assertNonEmptyString(value: unknown, label: string, maxLength = 512): string {
  if (
    typeof value !== 'string' ||
    value.includes('\0') ||
    value.trim().length === 0 ||
    value.length > maxLength
  ) {
    throw new Error(`Invalid ${label}`);
  }
  return value;
}

function assertOptionalString(value: unknown, label: string, maxLength = 2000): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.includes('\0') || value.length > maxLength) {
    throw new Error(`Invalid ${label}`);
  }
  return value;
}

function assertStringArray(
  value: unknown,
  label: string,
  maxItems = MAX_BATCH_TRACK_IDS,
  maxItemLength = 512
): string[] {
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new Error(`Invalid ${label}`);
  }
  return value.map((item, idx) => assertNonEmptyString(item, `${label}[${idx}]`, maxItemLength));
}

function isValidLyricProvider(value: unknown): value is LyricProviderOption {
  return value === 'auto' || value === 'online' || value === 'embedded' || value === 'local';
}

function isValidTrackPayload(value: unknown, requirePath: boolean): value is Track {
  if (!isPlainObject(value)) return false;
  if (
    typeof value.id !== 'string' ||
    value.id.length === 0 ||
    value.id.length > 256 ||
    typeof value.title !== 'string' ||
    value.title.length > 512 ||
    typeof value.artist !== 'string' ||
    value.artist.length > 512 ||
    typeof value.album !== 'string' ||
    value.album.length > 512 ||
    typeof value.duration !== 'number' ||
    !Number.isFinite(value.duration) ||
    value.duration < 0
  ) {
    return false;
  }
  if (requirePath) {
    if (
      typeof value.path !== 'string' ||
      value.path.length === 0 ||
      value.path.length > 2048 ||
      value.path.includes('\0')
    ) {
      return false;
    }
  } else if (
    value.path !== undefined &&
    (typeof value.path !== 'string' || value.path.length > 2048 || value.path.includes('\0'))
  ) {
    return false;
  }
  return true;
}

function isTrustedIpcSender(event: IpcMainInvokeEvent | IpcMainEvent): boolean {
  const frame = event.senderFrame;
  const mainFrame = event.sender.mainFrame;
  if (!frame || !mainFrame) return false;
  if (frame.processId !== mainFrame.processId || frame.routingId !== mainFrame.routingId) {
    return false;
  }
  return isAllowedInternalUrl(frame.url);
}

type IpcHandler = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown;

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

const NUMBER_SETTING_KEYS = ['volume', 'customBackgroundOpacity', 'customBackgroundBlur'] as const;

const approvedFolderPaths = new Set<string>();

/** Records folders returned by the native picker so only user-chosen roots can
 * be added to the monitored library. */
function rememberSelectedFolders(folders: string[]): void {
  for (const folder of folders) {
    approvedFolderPaths.add(normalizePathForComparison(folder));
  }
}

function isPersistedWallpaperUrl(value: string): boolean {
  return (
    value === '' ||
    value.startsWith('https://') ||
    value.startsWith('maja-artwork://load?path=')
  );
}

function normalizeAndDedupeFolders(folders: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const folder of folders) {
    const normalized = normalizePlatformPath(folder.trim());
    const key = normalizePathForComparison(normalized);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

function areStringArraysEqual(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((item, idx) => item === b[idx]);
}

function hasSettingsChanged(prev: Settings, next: Settings): boolean {
  return (Object.keys(next) as Array<keyof Settings>).some((key) => {
    const prevVal = prev[key];
    const nextVal = next[key];
    if (Array.isArray(prevVal) && Array.isArray(nextVal)) {
      return !areStringArraysEqual(prevVal, nextVal);
    }
    return prevVal !== nextVal;
  });
}

function writeSettingsFileAtomic(filePath: string, data: Settings): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmpPath = `${filePath}.tmp-${process.pid}`;
  const json = JSON.stringify(data, null, 2);
  let fd: number | null = null;
  try {
    fd = fs.openSync(tmpPath, 'w');
    fs.writeFileSync(fd, json, 'utf8');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = null;
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch {
        // Ignore close error during cleanup.
      }
    }
    if (fs.existsSync(tmpPath)) {
      try {
        fs.unlinkSync(tmpPath);
      } catch {
        // Ignore unlink error during cleanup.
      }
    }
    throw err;
  }
}

/**
 * Accepts only the known settings fields with the expected primitive types and
 * strict security bounds.
 */
function sanitizeSettingsPatch(
  input: unknown,
  allowPersistedValues = false
): Partial<Settings> {
  if (!isPlainObject(input)) return {};

  const raw = input;
  const patch: Partial<Settings> = {};

  for (const key of BOOLEAN_SETTING_KEYS) {
    if (typeof raw[key] === 'boolean') {
      patch[key] = raw[key] as boolean;
    }
  }

  if (
    typeof raw.discordClientId === 'string' &&
    (raw.discordClientId === '' || DISCORD_CLIENT_ID_RE.test(raw.discordClientId))
  ) {
    patch.discordClientId = raw.discordClientId;
  }

  if (
    typeof raw.discordLargeImage === 'string' &&
    !raw.discordLargeImage.includes('\0') &&
    raw.discordLargeImage.length <= 128
  ) {
    patch.discordLargeImage = raw.discordLargeImage;
  }

  if (
    typeof raw.discordLargeImageText === 'string' &&
    !raw.discordLargeImageText.includes('\0') &&
    raw.discordLargeImageText.length <= 128
  ) {
    patch.discordLargeImageText = raw.discordLargeImageText;
  }

  if (typeof raw.accentColor === 'string' && HEX_COLOR_RE.test(raw.accentColor)) {
    patch.accentColor = raw.accentColor;
  }

  for (const key of NUMBER_SETTING_KEYS) {
    if (typeof raw[key] === 'number' && Number.isFinite(raw[key])) {
      patch[key] = raw[key] as number;
    }
  }

  if (typeof patch.volume === 'number') {
    patch.volume = Math.min(1, Math.max(0, patch.volume));
  }
  if (typeof patch.customBackgroundOpacity === 'number') {
    patch.customBackgroundOpacity = Math.min(1, Math.max(0, patch.customBackgroundOpacity));
  }
  if (typeof patch.customBackgroundBlur === 'number') {
    patch.customBackgroundBlur = Math.min(40, Math.max(0, patch.customBackgroundBlur));
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
  if (isValidLyricProvider(raw.lyricsProvider)) {
    patch.lyricsProvider = raw.lyricsProvider;
  }

  if (Array.isArray(raw.musicFolders)) {
    if (raw.musicFolders.length > MAX_FOLDER_COUNT) {
      console.warn('Rejected a music folder list exceeding maximum folder count');
    } else {
      const existingFolders = new Set(currentSettings.musicFolders.map(normalizePathForComparison));
      const rawFolders = raw.musicFolders;
      const hasInvalidEntry = rawFolders.some(
        (folder) =>
          typeof folder !== 'string' ||
          folder.trim().length === 0 ||
          folder.length > 1024 ||
          folder.includes('\0')
      );

      if (hasInvalidEntry) {
        console.warn('Rejected a music folder list containing invalid entries');
      } else {
        const normalizedFolders = normalizeAndDedupeFolders(rawFolders as string[]);
        const hasUnapprovedEntry =
          !allowPersistedValues &&
          normalizedFolders.some((folder) => {
            const key = normalizePathForComparison(folder);
            return !approvedFolderPaths.has(key) && !existingFolders.has(key);
          });

        if (hasUnapprovedEntry) {
          console.warn('Rejected a music folder list containing unapproved paths');
        } else {
          patch.musicFolders = normalizedFolders;
        }
      }
    }
  }

  if (typeof raw.customBackgroundUrl === 'string') {
    const proposedUrl = raw.customBackgroundUrl;
    const isBounded = !proposedUrl.includes('\0') && proposedUrl.length <= 2048;
    const isUnchanged = !allowPersistedValues && proposedUrl === currentSettings.customBackgroundUrl;
    const isTrustedPersistedValue = allowPersistedValues && isPersistedWallpaperUrl(proposedUrl);
    if (isBounded && (isUnchanged || isTrustedPersistedValue || isAllowedWallpaperUrl(proposedUrl))) {
      patch.customBackgroundUrl = proposedUrl;
    } else {
      console.warn('Rejected an unapproved custom background URL');
      if (raw.customBackgroundEnabled === true) {
        patch.customBackgroundEnabled = false;
      }
    }
  }

  return patch;
}

export function loadSettings(): Settings {
  const filePath = getSettingsFilePath();
  if (fs.existsSync(filePath)) {
    try {
      const data: unknown = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      currentSettings = {
        ...DEFAULT_SETTINGS,
        ...sanitizeSettingsPatch(data, true),
      };
      // Auto-migrate defunct default client ID if present
      if (currentSettings.discordClientId === '1223948332155703357' || !currentSettings.discordClientId) {
        currentSettings.discordClientId = DEFAULT_SETTINGS.discordClientId;
        try {
          writeSettingsFileAtomic(filePath, currentSettings);
        } catch {
          // Non-fatal if migration write fails on read-only media.
        }
      }
    } catch (err) {
      console.error('Error loading settings:', err);
      currentSettings = { ...DEFAULT_SETTINGS };
    }
  }
  setActiveWallpaperUrl(currentSettings.customBackgroundUrl ?? '');
  return currentSettings;
}

export function saveSettings(settings: Partial<Settings>): Settings {
  const prevSettings = currentSettings;
  const patch = sanitizeSettingsPatch(settings);
  const nextSettings: Settings = { ...prevSettings, ...patch };

  if (!hasSettingsChanged(prevSettings, nextSettings)) {
    return currentSettings;
  }

  currentSettings = nextSettings;
  try {
    writeSettingsFileAtomic(getSettingsFilePath(), currentSettings);

    if (currentSettings.customBackgroundUrl !== prevSettings.customBackgroundUrl) {
      setActiveWallpaperUrl(currentSettings.customBackgroundUrl ?? '');
    }

    // Handle Discord RPC updates only when relevant fields actually changed.
    if (!currentSettings.discordEnabled) {
      if (prevSettings.discordEnabled) {
        clearPresence();
        disconnectDiscordRPC();
      }
    } else if (!prevSettings.discordEnabled) {
      initDiscordRPC(currentSettings.discordClientId);
    } else if (currentSettings.discordClientId !== prevSettings.discordClientId) {
      setDiscordClientId(
        currentSettings.discordClientId || DEFAULT_SETTINGS.discordClientId || '463097721130188830'
      );
    }

    // Handle folder watcher updates only if musicFolders changed.
    if (!areStringArraysEqual(prevSettings.musicFolders, currentSettings.musicFolders)) {
      folderWatcher.updateFolders(currentSettings.musicFolders);
    }
  } catch (err) {
    console.error('Error saving settings:', err);
  }
  return currentSettings;
}

export function bindMainWindow(mainWindow: BrowserWindow): void {
  folderWatcher.setMainWindow(mainWindow);
  mainWindow.on('closed', () => {
    folderWatcher.setMainWindow(null);
  });
}

export function shutdownServices(): void {
  folderWatcher.stopWatching();
  clearPresence();
  disconnectDiscordRPC();
}

let ipcHandlersRegistered = false;

export function registerIpcHandlers(): void {
  if (ipcHandlersRegistered) return;
  ipcHandlersRegistered = true;

  loadSettings();
  folderWatcher.startWatching(currentSettings.musicFolders, null);

  if (currentSettings.discordEnabled) {
    initDiscordRPC(currentSettings.discordClientId);
  }

  // Dialog & Folders
  handle('dialog:selectFolder', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const activeWin = win && !win.isDestroyed() ? win : undefined;
    const result = activeWin
      ? await dialog.showOpenDialog(activeWin, {
          properties: ['openDirectory', 'multiSelections'],
          title: 'Select Music Folder',
        })
      : await dialog.showOpenDialog({
          properties: ['openDirectory', 'multiSelections'],
          title: 'Select Music Folder',
        });
    if (result.canceled) return null;
    const normalized = normalizeAndDedupeFolders(result.filePaths);
    rememberSelectedFolders(normalized);
    return normalized;
  });

  handle('dialog:selectImage', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const activeWin = win && !win.isDestroyed() ? win : undefined;
    const result = activeWin
      ? await dialog.showOpenDialog(activeWin, {
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
  handle('library:scan', async (event, folders: unknown) => {
    if (!Array.isArray(folders) || folders.length > MAX_FOLDER_COUNT) {
      throw new Error('Invalid folder list');
    }

    const rawSelected = folders.map((folder, idx) => assertNonEmptyString(folder, `folders[${idx}]`, 1024));
    const selectedFolders = normalizeAndDedupeFolders(rawSelected);
    const existingFolders = new Set(currentSettings.musicFolders.map(normalizePathForComparison));

    const hasUnapproved = selectedFolders.some((folder) => {
      const key = normalizePathForComparison(folder);
      return !approvedFolderPaths.has(key) && !existingFolders.has(key);
    });
    if (hasUnapproved) {
      throw new Error('Unapproved music folder path');
    }

    const merged = normalizeAndDedupeFolders([...currentSettings.musicFolders, ...selectedFolders]);
    const savedSettings = saveSettings({ musicFolders: merged });

    // Scan every monitored folder (including empty [] when the last folder was removed)
    // so track pruning and DB cleanup always reflect the authoritative folder set.
    const win = BrowserWindow.fromWebContents(event.sender);
    const activeWin = win && !win.isDestroyed() ? win : null;
    await scanFolders(savedSettings.musicFolders, activeWin);
  });

  handle('library:getStats', async () => getLibraryStats());

  // Library Queries
  handle('library:getTracks', async () => getAllTracks());
  handle('library:getAlbums', async () => getAlbums());
  handle('library:getAlbumDetail', async (_event, albumId: unknown) => {
    const safeAlbumId = assertNonEmptyString(albumId, 'albumId', 512);
    const albums = getAlbums();
    const album = albums.find((a) => a.id === safeAlbumId);
    if (!album) return null;
    const tracks = getTracksByAlbum(album.artist, album.title);
    return { ...album, tracks };
  });

  handle('library:getArtists', async () => getArtists());
  handle('library:getArtistDetail', async (_event, artistId: unknown) => {
    const safeArtistId = assertNonEmptyString(artistId, 'artistId', 512);
    const artists = getArtists();
    const artist = artists.find((a) => a.id === safeArtistId);
    if (!artist) return null;
    const albums = getAlbums().filter((a) => a.artist === artist.name);
    const tracks = getTracksByArtist(artist.name);
    return { artist, albums, tracks };
  });

  handle('library:getRecentlyPlayed', async () => getRecentlyPlayed());
  handle('library:getRecentlyAdded', async () => getRecentlyAdded());

  // Playlists & Favorites
  handle('playlists:getAll', async () => getAllPlaylists());
  handle('playlists:create', async (_event, name: unknown, description?: unknown) => {
    const safeName = assertNonEmptyString(name, 'playlist name', 200).trim();
    const safeDescription = assertOptionalString(description, 'playlist description', 1000);
    return createPlaylistInDb(safeName, safeDescription);
  });
  handle('playlists:delete', async (_event, id: unknown) => {
    const safeId = assertNonEmptyString(id, 'playlist id', 256);
    return deletePlaylistInDb(safeId);
  });
  handle('playlists:addTrack', async (_event, playlistId: unknown, trackId: unknown) => {
    const safePlaylistId = assertNonEmptyString(playlistId, 'playlistId', 256);
    const safeTrackId = assertNonEmptyString(trackId, 'trackId', 256);
    return addTrackToPlaylistInDb(safePlaylistId, safeTrackId);
  });
  handle('playlists:addTracks', async (_event, playlistId: unknown, trackIds: unknown) => {
    const safePlaylistId = assertNonEmptyString(playlistId, 'playlistId', 256);
    const safeTrackIds = assertStringArray(trackIds, 'trackIds', MAX_BATCH_TRACK_IDS, 256);
    return addTracksToPlaylistInDb(safePlaylistId, safeTrackIds);
  });
  handle('playlists:removeTrack', async (_event, playlistId: unknown, trackId: unknown) => {
    const safePlaylistId = assertNonEmptyString(playlistId, 'playlistId', 256);
    const safeTrackId = assertNonEmptyString(trackId, 'trackId', 256);
    return removeTrackFromPlaylistInDb(safePlaylistId, safeTrackId);
  });
  handle('playlists:getTracks', async (_event, playlistId: unknown) => {
    const safePlaylistId = assertNonEmptyString(playlistId, 'playlistId', 256);
    return getPlaylistTracksFromDb(safePlaylistId);
  });
  handle('library:toggleFavorite', async (_event, trackId: unknown) => {
    const safeTrackId = assertNonEmptyString(trackId, 'trackId', 256);
    return toggleFavoriteInDb(safeTrackId);
  });
  handle('library:getFavorites', async () => getFavorites());
  handle('library:recordPlay', async (_event, trackId: unknown) => {
    const safeTrackId = assertNonEmptyString(trackId, 'trackId', 256);
    recordPlayInDb(safeTrackId);
  });

  // Audio Engine Bridge
  handle('audio:getFormat', async (_event, filePath: unknown) => {
    const rawPath = assertNonEmptyString(filePath, 'filePath', 2048);
    const normalizedPath = normalizePlatformPath(rawPath);
    if (!isTrackPathKnown(normalizedPath)) {
      throw new Error('Unknown track path');
    }

    return getAudioFormatInfo(normalizedPath);
  });

  // Lyrics Engine
  handle('lyrics:getForTrack', async (_event, track: unknown, provider?: unknown) => {
    if (!isValidTrackPayload(track, true)) {
      return null;
    }

    const normalizedPath = normalizePlatformPath(track.path);
    if (!isTrackPathKnown(normalizedPath)) {
      return null;
    }

    if (provider !== undefined && !isValidLyricProvider(provider)) {
      throw new Error('Invalid lyric provider');
    }

    const safeTrack: Track = { ...track, path: normalizedPath };
    return getLyricsForTrack(
      safeTrack,
      provider || (currentSettings.lyricsProvider as LyricProviderOption) || 'auto'
    );
  });

  // Settings
  handle('settings:get', async () => currentSettings);
  handle('settings:save', async (_event, settings: unknown) => {
    if (!isPlainObject(settings)) {
      throw new Error('Invalid settings payload');
    }
    return saveSettings(settings as Partial<Settings>);
  });

  // Discord RPC
  handle(
    'discord:updatePresence',
    async (_event, track: unknown, isPlaying: unknown, currentTime: unknown) => {
      if (track !== null && !isValidTrackPayload(track, false)) {
        return;
      }

      const safeTime =
        typeof currentTime === 'number' && Number.isFinite(currentTime) && currentTime >= 0
          ? currentTime
          : 0;

      if (currentSettings.discordEnabled) {
        updatePresence(
          track,
          typeof isPlaying === 'boolean' ? isPlaying : Boolean(isPlaying),
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
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) return;
    win.minimize();
  });
  on('window:maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) return;
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
  });
  on('window:close', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) return;
    win.close();
  });
}

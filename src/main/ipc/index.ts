import { ipcMain, dialog, BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';
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
import { getAudioFormatInfo } from '../audio';
import { getLyricsForTrack } from '../lyrics';
import { updatePresence, clearPresence, initDiscordRPC, setDiscordClientId } from '../discord';
import { Settings, Track, LyricProviderOption } from '../../shared/types';
import { DEFAULT_SETTINGS } from '../../shared/constants';

let currentSettings: Settings = { ...DEFAULT_SETTINGS };

const getSettingsFilePath = () => path.join(app.getPath('userData'), 'settings.json');

export function loadSettings(): Settings {
  const filePath = getSettingsFilePath();
  if (fs.existsSync(filePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      currentSettings = { ...DEFAULT_SETTINGS, ...data };
      // Auto-migrate defunct default client ID if present
      if (currentSettings.discordClientId === '1223948332155703357' || !currentSettings.discordClientId) {
        currentSettings.discordClientId = DEFAULT_SETTINGS.discordClientId;
        try {
          fs.writeFileSync(filePath, JSON.stringify(currentSettings, null, 2));
        } catch (_) {}
      }
    } catch (err) {
      console.error('Error loading settings:', err);
    }
  }
  return currentSettings;
}

export function saveSettings(settings: Partial<Settings>): Settings {
  currentSettings = { ...currentSettings, ...settings };
  try {
    fs.writeFileSync(getSettingsFilePath(), JSON.stringify(currentSettings, null, 2));

    // Handle Discord RPC updates
    if (settings.discordClientId) {
      setDiscordClientId(settings.discordClientId);
    }
    if (settings.discordEnabled === false) {
      clearPresence();
    } else if (settings.discordEnabled === true) {
      initDiscordRPC(currentSettings.discordClientId);
    }

    // Handle folder watcher updates if musicFolders changed
    if (settings.musicFolders) {
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
  ipcMain.handle('dialog:selectFolder', async (event) => {
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
    return result.filePaths;
  });

  ipcMain.handle('dialog:selectImage', async (event) => {
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
    const filePath = result.filePaths[0];
    return `maja-artwork://load?path=${encodeURIComponent(filePath)}`;
  });

  // Library Scanning
  ipcMain.handle('library:scan', async (event, folders: string[]) => {
    const selectedFolders = Array.isArray(folders)
      ? folders.filter((folder): folder is string => typeof folder === 'string' && folder.length > 0)
      : [];
    const merged = Array.from(new Set([...currentSettings.musicFolders, ...selectedFolders]));

    if (merged.length === 0) {
      return;
    }

    saveSettings({ musicFolders: merged });
    // Scan every monitored folder, not just the newly selected ones. This keeps
    // the pruning step from deleting tracks that belong to other folders.
    const win = BrowserWindow.fromWebContents(event.sender) ?? null;
    await scanFolders(merged, win);
  });

  ipcMain.handle('library:getStats', async () => getLibraryStats());

  // Library Queries
  ipcMain.handle('library:getTracks', async () => getAllTracks());
  ipcMain.handle('library:getAlbums', async () => getAlbums());
  ipcMain.handle('library:getAlbumDetail', async (_event, albumId: string) => {
    const albums = getAlbums();
    const album = albums.find((a) => a.id === albumId);
    if (!album) return null;
    const tracks = getTracksByAlbum(album.artist, album.title);
    return { ...album, tracks };
  });

  ipcMain.handle('library:getArtists', async () => getArtists());
  ipcMain.handle('library:getArtistDetail', async (_event, artistId: string) => {
    const artists = getArtists();
    const artist = artists.find((a) => a.id === artistId);
    if (!artist) return null;
    const albums = getAlbums().filter((a) => a.artist === artist.name);
    const tracks = getTracksByArtist(artist.name);
    return { artist, albums, tracks };
  });

  ipcMain.handle('library:getRecentlyPlayed', async () => getRecentlyPlayed());
  ipcMain.handle('library:getRecentlyAdded', async () => getRecentlyAdded());

  // Playlists & Favorites
  ipcMain.handle('playlists:getAll', async () => getAllPlaylists());
  ipcMain.handle('playlists:create', async (_event, name: string, description?: string) =>
    createPlaylistInDb(name, description)
  );
  ipcMain.handle('playlists:delete', async (_event, id: string) => deletePlaylistInDb(id));
  ipcMain.handle('playlists:addTrack', async (_event, playlistId: string, trackId: string) =>
    addTrackToPlaylistInDb(playlistId, trackId)
  );
  ipcMain.handle('playlists:addTracks', async (_event, playlistId: string, trackIds: string[]) =>
    addTracksToPlaylistInDb(playlistId, trackIds)
  );
  ipcMain.handle('library:addTracksToPlaylist', async (_event, playlistId: string, trackIds: string[]) =>
    addTracksToPlaylistInDb(playlistId, trackIds)
  );
  ipcMain.handle('playlists:removeTrack', async (_event, playlistId: string, trackId: string) =>
    removeTrackFromPlaylistInDb(playlistId, trackId)
  );
  ipcMain.handle('playlists:getTracks', async (_event, playlistId: string) =>
    getPlaylistTracksFromDb(playlistId)
  );
  ipcMain.handle('library:toggleFavorite', async (_event, trackId: string) => toggleFavoriteInDb(trackId));
  ipcMain.handle('library:getFavorites', async () => getFavorites());
  ipcMain.handle('library:recordPlay', async (_event, trackId: string) => recordPlayInDb(trackId));

  // Audio Engine Bridge
  ipcMain.handle('audio:getFormat', async (_event, filePath: string) => {
    if (typeof filePath !== 'string' || !isTrackPathKnown(filePath)) {
      throw new Error('Unknown track path');
    }

    return getAudioFormatInfo(filePath);
  });

  // Lyrics Engine
  ipcMain.handle('lyrics:getForTrack', async (_event, track: Track, provider?: LyricProviderOption) => {
    if (!track || typeof track.path !== 'string' || !isTrackPathKnown(track.path)) {
      return null;
    }

    return getLyricsForTrack(
      track,
      provider || (currentSettings.lyricsProvider as LyricProviderOption) || 'auto'
    );
  });

  // Settings
  ipcMain.handle('settings:get', async () => currentSettings);
  ipcMain.handle('settings:save', async (_event, settings: Partial<Settings>) => saveSettings(settings));

  // Discord RPC
  ipcMain.handle('discord:updatePresence', async (_event, track, isPlaying, currentTime) => {
    if (currentSettings.discordEnabled) {
      updatePresence(
        track,
        isPlaying,
        currentTime,
        currentSettings.discordShowTrack ?? true,
        currentSettings.discordShowElapsed ?? true,
        currentSettings.discordLargeImage ?? 'logo',
        currentSettings.discordLargeImageText ?? 'MaJa Player',
        currentSettings.discordActivityType ?? 'listening'
      );
    } else {
      clearPresence();
    }
  });

  // Window controls
  ipcMain.on('window:minimize', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize();
  });
  ipcMain.on('window:maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
  });
  ipcMain.on('window:close', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
  });
}

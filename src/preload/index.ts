import { contextBridge, ipcRenderer } from 'electron';
import {
  Track,
  Album,
  Artist,
  Playlist,
  Settings,
  ScanProgress,
  LibraryStats,
  AudioFormatInfo,
  LyricsResult,
  LyricProviderOption,
} from '../shared/types';

export const electronAPI = {
  // Folder & Scanning
  selectFolder: (): Promise<string[] | null> => ipcRenderer.invoke('dialog:selectFolder'),
  selectImage: (): Promise<string | null> => ipcRenderer.invoke('dialog:selectImage'),
  scanLibrary: (folders: string[]): Promise<void> => ipcRenderer.invoke('library:scan', folders),
  onScanProgress: (callback: (progress: ScanProgress) => void) => {
    const handler = (_event: unknown, progress: ScanProgress) => callback(progress);
    ipcRenderer.on('library:scanProgress', handler);
    return () => ipcRenderer.removeListener('library:scanProgress', handler);
  },
  getLibraryStats: (): Promise<LibraryStats> => ipcRenderer.invoke('library:getStats'),

  // Library Queries
  getTracks: (): Promise<Track[]> => ipcRenderer.invoke('library:getTracks'),
  getAlbums: (): Promise<Album[]> => ipcRenderer.invoke('library:getAlbums'),
  getAlbumDetail: (albumId: string): Promise<Album | null> => ipcRenderer.invoke('library:getAlbumDetail', albumId),
  getArtists: (): Promise<Artist[]> => ipcRenderer.invoke('library:getArtists'),
  getArtistDetail: (artistId: string): Promise<{ artist: Artist; albums: Album[]; tracks: Track[] } | null> =>
    ipcRenderer.invoke('library:getArtistDetail', artistId),
  getRecentlyPlayed: (): Promise<Track[]> => ipcRenderer.invoke('library:getRecentlyPlayed'),
  getRecentlyAdded: (): Promise<Track[]> => ipcRenderer.invoke('library:getRecentlyAdded'),

  // Playlists & Favorites
  getPlaylists: (): Promise<Playlist[]> => ipcRenderer.invoke('playlists:getAll'),
  createPlaylist: (name: string, description?: string): Promise<Playlist> =>
    ipcRenderer.invoke('playlists:create', name, description),
  deletePlaylist: (id: string): Promise<boolean> => ipcRenderer.invoke('playlists:delete', id),
  addTrackToPlaylist: (playlistId: string, trackId: string): Promise<boolean> =>
    ipcRenderer.invoke('playlists:addTrack', playlistId, trackId),
  removeTrackFromPlaylist: (playlistId: string, trackId: string): Promise<boolean> =>
    ipcRenderer.invoke('playlists:removeTrack', playlistId, trackId),
  getPlaylistTracks: (playlistId: string): Promise<Track[]> =>
    ipcRenderer.invoke('playlists:getTracks', playlistId),
  toggleFavorite: (trackId: string): Promise<boolean> => ipcRenderer.invoke('library:toggleFavorite', trackId),
  getFavorites: (): Promise<Track[]> => ipcRenderer.invoke('library:getFavorites'),
  recordPlay: (trackId: string): Promise<void> => ipcRenderer.invoke('library:recordPlay', trackId),

  // Audio Engine Bridge
  getAudioFormat: (filePath: string): Promise<AudioFormatInfo> =>
    ipcRenderer.invoke('audio:getFormat', filePath),
  readAudioStreamUrl: (filePath: string): string =>
    `maja-audio://stream?path=${encodeURIComponent(filePath)}`,
  getLyrics: (track: Track, provider?: LyricProviderOption): Promise<LyricsResult | null> =>
    ipcRenderer.invoke('lyrics:getForTrack', track, provider),

  // Settings
  getSettings: (): Promise<Settings> => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings: Partial<Settings>): Promise<Settings> =>
    ipcRenderer.invoke('settings:save', settings),

  // Discord RPC
  updateDiscordPresence: (track: Track | null, isPlaying: boolean, currentTime: number): Promise<void> =>
    ipcRenderer.invoke('discord:updatePresence', track, isPlaying, currentTime),

  // System Controls
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  maximizeWindow: () => ipcRenderer.send('window:maximize'),
  closeWindow: () => ipcRenderer.send('window:close'),
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

export type ElectronAPI = typeof electronAPI;

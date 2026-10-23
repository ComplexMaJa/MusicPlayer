import { create } from 'zustand';
import {
  Track,
  Album,
  Artist,
  Playlist,
  LibraryStats,
  ScanProgress,
  ViewMode,
} from '../../shared/types';
import { usePlayerStore } from './usePlayerStore';

interface LibraryStoreState {
  tracks: Track[];
  albums: Album[];
  artists: Artist[];
  playlists: Playlist[];
  favorites: Track[];
  recentlyPlayed: Track[];
  recentlyAdded: Track[];
  stats: LibraryStats;
  scanProgress: ScanProgress;
  activeView: ViewMode;
  searchQuery: string;
  selectedAlbumId: string | null;
  selectedArtistId: string | null;
  selectedPlaylistId: string | null;

  // Actions
  setActiveView: (view: ViewMode) => void;
  setSearchQuery: (query: string) => void;
  setSelectedAlbumId: (id: string | null) => void;
  setSelectedArtistId: (id: string | null) => void;
  setSelectedPlaylistId: (id: string | null) => void;
  fetchLibraryData: () => Promise<void>;
  scanFolders: (folders: string[]) => Promise<void>;
  toggleFavorite: (trackId: string) => Promise<void>;
  createPlaylist: (name: string, description?: string) => Promise<Playlist | null>;
  deletePlaylist: (id: string) => Promise<void>;
  addTrackToPlaylist: (playlistId: string, trackId: string) => Promise<void>;
  removeTrackFromPlaylist: (playlistId: string, trackId: string) => Promise<void>;
}

export const useLibraryStore = create<LibraryStoreState>((set, get) => ({
  tracks: [],
  albums: [],
  artists: [],
  playlists: [],
  favorites: [],
  recentlyPlayed: [],
  recentlyAdded: [],
  stats: { trackCount: 0, albumCount: 0, artistCount: 0, playlistCount: 0, totalDuration: 0 },
  scanProgress: { isScanning: false, totalFiles: 0, processedFiles: 0 },
  activeView: 'home',
  searchQuery: '',
  selectedAlbumId: null,
  selectedArtistId: null,
  selectedPlaylistId: null,

  setActiveView: (view: ViewMode) => set({ activeView: view }),
  setSearchQuery: (query: string) => set({ searchQuery: query }),
  setSelectedAlbumId: (id: string | null) => set({ selectedAlbumId: id }),
  setSelectedArtistId: (id: string | null) => set({ selectedArtistId: id }),
  setSelectedPlaylistId: (id: string | null) => set({ selectedPlaylistId: id }),

  fetchLibraryData: async () => {
    if (!window.electronAPI) return;
    try {
      const [tracks, albums, artists, playlists, favorites, recentlyPlayed, recentlyAdded, stats] =
        await Promise.all([
          window.electronAPI.getTracks(),
          window.electronAPI.getAlbums(),
          window.electronAPI.getArtists(),
          window.electronAPI.getPlaylists(),
          window.electronAPI.getFavorites(),
          window.electronAPI.getRecentlyPlayed(),
          window.electronAPI.getRecentlyAdded(),
          window.electronAPI.getLibraryStats(),
        ]);

      set({
        tracks,
        albums,
        artists,
        playlists,
        favorites,
        recentlyPlayed,
        recentlyAdded,
        stats,
      });
    } catch (err) {
      console.error('Error fetching library data:', err);
    }
  },

  scanFolders: async (folders: string[]) => {
    if (!window.electronAPI) return;

    const unsubscribe = window.electronAPI.onScanProgress((progress) => {
      set({ scanProgress: progress });
    });

    try {
      await window.electronAPI.scanLibrary(folders);
      await get().fetchLibraryData();
    } catch (err) {
      console.error('Error scanning folders:', err);
    } finally {
      unsubscribe();
    }
  },

  toggleFavorite: async (trackId: string) => {
    if (!window.electronAPI) return;
    const isFav = await window.electronAPI.toggleFavorite(trackId);
    const currentPlaying = usePlayerStore.getState().currentTrack;
    const existing = get().tracks.find((track) => track.id === trackId);
    const foundTrack =
      existing ??
      get().favorites.find((track) => track.id === trackId) ??
      get().recentlyPlayed.find((track) => track.id === trackId) ??
      get().recentlyAdded.find((track) => track.id === trackId) ??
      (currentPlaying?.id === trackId ? currentPlaying : undefined);

    set((state) => {
      const updateTrack = (track: Track): Track =>
        track.id === trackId ? { ...track, isFavorite: isFav } : track;

      const favorites = isFav
        ? state.favorites.some((track) => track.id === trackId)
          ? state.favorites.map(updateTrack)
          : foundTrack
            ? [...state.favorites, { ...foundTrack, isFavorite: true }]
            : state.favorites
        : state.favorites.filter((track) => track.id !== trackId);

      return {
        tracks: state.tracks.map(updateTrack),
        favorites,
        recentlyPlayed: state.recentlyPlayed.map(updateTrack),
        recentlyAdded: state.recentlyAdded.map(updateTrack),
      };
    });

    usePlayerStore.getState().setCurrentTrackFavorite(trackId, isFav);

    // Normally every playable track is in `tracks`; refresh only in the rare
    // case where it is not so the Favorites view cannot drift.
    if (!foundTrack) {
      await get().fetchLibraryData();
    }
  },

  createPlaylist: async (name: string, description?: string) => {
    if (!window.electronAPI) return null;
    const pl = await window.electronAPI.createPlaylist(name, description);
    await get().fetchLibraryData();
    return pl;
  },

  deletePlaylist: async (id: string) => {
    if (!window.electronAPI) return;
    await window.electronAPI.deletePlaylist(id);
    await get().fetchLibraryData();
  },

  addTrackToPlaylist: async (playlistId: string, trackId: string) => {
    if (!window.electronAPI) return;
    await window.electronAPI.addTrackToPlaylist(playlistId, trackId);
    await get().fetchLibraryData();
  },

  removeTrackFromPlaylist: async (playlistId: string, trackId: string) => {
    if (!window.electronAPI) return;
    await window.electronAPI.removeTrackFromPlaylist(playlistId, trackId);
    await get().fetchLibraryData();
  },
}));

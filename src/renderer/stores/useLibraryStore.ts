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
  favoriteIdMap: Record<string, true>;
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
  fetchPlaylists: () => Promise<void>;
  scanFolders: (folders: string[]) => Promise<void>;
  toggleFavorite: (trackId: string) => Promise<void>;
  createPlaylist: (name: string, description?: string) => Promise<Playlist | null>;
  deletePlaylist: (id: string) => Promise<void>;
  addTrackToPlaylist: (playlistId: string, trackId: string) => Promise<void>;
  addTracksToPlaylist: (playlistId: string, trackIds: string[]) => Promise<void>;
  removeTrackFromPlaylist: (playlistId: string, trackId: string) => Promise<void>;
}

function buildFavoriteIdMap(favorites: Track[]): Record<string, true> {
  const map: Record<string, true> = {};
  for (const track of favorites) {
    map[track.id] = true;
  }
  return map;
}

export const useLibraryStore = create<LibraryStoreState>((set, get) => ({
  tracks: [],
  albums: [],
  artists: [],
  playlists: [],
  favorites: [],
  favoriteIdMap: {},
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
    const api = window.electronAPI;
    if (!api) return;
    try {
      const [tracks, albums, artists, playlists, favorites, recentlyPlayed, recentlyAdded, stats] =
        await Promise.all([
          api.getTracks(),
          api.getAlbums(),
          api.getArtists(),
          api.getPlaylists(),
          api.getFavorites(),
          api.getRecentlyPlayed(),
          api.getRecentlyAdded(),
          api.getLibraryStats(),
        ]);

      set({
        tracks,
        albums,
        artists,
        playlists,
        favorites,
        favoriteIdMap: buildFavoriteIdMap(favorites),
        recentlyPlayed,
        recentlyAdded,
        stats,
      });
    } catch (err) {
      console.error('Error fetching library data:', err);
    }
  },

  fetchPlaylists: async () => {
    const api = window.electronAPI;
    if (!api) return;
    try {
      const playlists = await api.getPlaylists();
      set((state) => ({
        playlists,
        stats: { ...state.stats, playlistCount: playlists.length },
      }));
    } catch (err) {
      console.error('Error fetching playlists:', err);
    }
  },

  scanFolders: async (folders: string[]) => {
    const api = window.electronAPI;
    if (!api) return;

    const unsubscribe = api.onScanProgress((progress) => {
      set({ scanProgress: progress });
    });

    try {
      await api.scanLibrary(folders);
      await get().fetchLibraryData();
    } catch (err) {
      console.error('Error scanning folders:', err);
      set((state) => ({
        scanProgress: {
          ...state.scanProgress,
          isScanning: false,
          error: err instanceof Error ? err.message : 'Folder scan failed',
        },
      }));
    } finally {
      unsubscribe();
      set((state) =>
        state.scanProgress.isScanning
          ? { scanProgress: { ...state.scanProgress, isScanning: false } }
          : {}
      );
    }
  },

  toggleFavorite: async (trackId: string) => {
    const api = window.electronAPI;
    if (!api) return;
    try {
      const isFav = await api.toggleFavorite(trackId);
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

        const nextFavoriteIdMap = { ...state.favoriteIdMap };
        if (isFav) {
          nextFavoriteIdMap[trackId] = true;
        } else {
          delete nextFavoriteIdMap[trackId];
        }

        return {
          tracks: state.tracks.map(updateTrack),
          favorites,
          favoriteIdMap: nextFavoriteIdMap,
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
    } catch (err) {
      console.error('Error toggling favorite:', err);
    }
  },

  createPlaylist: async (name: string, description?: string) => {
    const api = window.electronAPI;
    if (!api) return null;
    try {
      const pl = await api.createPlaylist(name, description);
      await get().fetchPlaylists();
      return pl;
    } catch (err) {
      console.error('Error creating playlist:', err);
      return null;
    }
  },

  deletePlaylist: async (id: string) => {
    const api = window.electronAPI;
    if (!api) return;
    try {
      await api.deletePlaylist(id);
      if (get().selectedPlaylistId === id) {
        set((state) => ({
          selectedPlaylistId: null,
          activeView: state.activeView === 'playlist-detail' ? 'playlists' : state.activeView,
        }));
      }
      await get().fetchPlaylists();
    } catch (err) {
      console.error('Error deleting playlist:', err);
    }
  },

  addTrackToPlaylist: async (playlistId: string, trackId: string) => {
    const api = window.electronAPI;
    if (!api) return;
    try {
      await api.addTrackToPlaylist(playlistId, trackId);
      await get().fetchPlaylists();
    } catch (err) {
      console.error('Error adding track to playlist:', err);
    }
  },

  addTracksToPlaylist: async (playlistId: string, trackIds: string[]) => {
    const api = window.electronAPI;
    if (!api || !trackIds.length) return;
    try {
      await api.addTracksToPlaylist(playlistId, trackIds);
      await get().fetchPlaylists();
    } catch (err) {
      console.error('Error adding tracks to playlist:', err);
    }
  },

  removeTrackFromPlaylist: async (playlistId: string, trackId: string) => {
    const api = window.electronAPI;
    if (!api) return;
    try {
      await api.removeTrackFromPlaylist(playlistId, trackId);
      await get().fetchPlaylists();
    } catch (err) {
      console.error('Error removing track from playlist:', err);
    }
  },
}));

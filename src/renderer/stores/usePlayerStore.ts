import { create } from 'zustand';
import { Track, AudioFormatInfo, LyricsResult, LyricProviderOption } from '../../shared/types';

interface PlayerStoreState {
  currentTrack: Track | null;
  isPlaying: boolean;
  volume: number;
  isMuted: boolean;
  currentTime: number;
  duration: number;
  queue: Track[];
  queueIndex: number;
  history: Track[];
  repeatMode: 'off' | 'all' | 'one';
  isShuffle: boolean;
  audioFormat: AudioFormatInfo | null;
  isNowPlayingDrawerOpen: boolean;
  isCinemaModeOpen: boolean;
  lyrics: LyricsResult | null;
  isLoadingLyrics: boolean;
  activeLyricIndex: number;
  activeLyricProvider: LyricProviderOption;

  // Actions
  playTrack: (track: Track, newQueue?: Track[]) => void;
  togglePlay: () => void;
  pause: () => void;
  resume: () => void;
  seek: (seconds: number) => void;
  setVolume: (val: number) => void;
  toggleMute: () => void;
  nextTrack: () => void;
  previousTrack: () => void;
  setQueue: (tracks: Track[], startIndex?: number) => void;
  addToQueue: (track: Track) => void;
  removeFromQueue: (index: number) => void;
  clearQueue: () => void;
  reorderQueue: (startIndex: number, endIndex: number) => void;
  toggleRepeatMode: () => void;
  toggleShuffle: () => void;
  toggleNowPlayingDrawer: () => void;
  setNowPlayingDrawerOpen: (open: boolean) => void;
  toggleCinemaMode: () => void;
  setCinemaModeOpen: (open: boolean) => void;
  setLyricProvider: (provider: LyricProviderOption) => Promise<void>;
  initFromSettings: (volume: number, isMuted?: boolean, lyricsProvider?: LyricProviderOption) => void;
}

const audio = new Audio();
audio.preload = 'auto';

export const getAudioElement = (): HTMLAudioElement => audio;

let volumePersistTimer: NodeJS.Timeout | null = null;
const persistVolumeState = (volume: number, isMuted: boolean) => {
  if (volumePersistTimer) clearTimeout(volumePersistTimer);
  volumePersistTimer = setTimeout(() => {
    if (window.electronAPI) {
      window.electronAPI.saveSettings({ volume, isMuted });
    }
  }, 300);
};

export const usePlayerStore = create<PlayerStoreState>((set, get) => {
  audio.ontimeupdate = () => {
    const time = audio.currentTime;
    const { lyrics, activeLyricIndex: prevIndex } = get();
    let newIndex = -1;

    if (lyrics?.syncedLyrics && lyrics.syncedLyrics.length > 0) {
      for (let i = lyrics.syncedLyrics.length - 1; i >= 0; i--) {
        if (time >= lyrics.syncedLyrics[i].time - 0.25) {
          newIndex = i;
          break;
        }
      }
    }

    if (newIndex !== prevIndex) {
      set({ currentTime: time, activeLyricIndex: newIndex });
    } else {
      set({ currentTime: time });
    }
  };

  audio.onloadedmetadata = () => {
    set({ duration: audio.duration || get().currentTrack?.duration || 0 });
  };

  audio.onended = () => {
    const { repeatMode, currentTrack } = get();
    if (repeatMode === 'one' && currentTrack) {
      audio.currentTime = 0;
      audio.play();
    } else {
      get().nextTrack();
    }
  };

  audio.onerror = (e) => {
    console.error('Audio element playback error:', e, audio.error);
    set({ isPlaying: false });
  };

  return {
    currentTrack: null,
    isPlaying: false,
    volume: 0.8,
    isMuted: false,
    currentTime: 0,
    duration: 0,
    queue: [],
    queueIndex: 0,
    history: [],
    repeatMode: 'off',
    isShuffle: false,
    audioFormat: null,
    isNowPlayingDrawerOpen: false,
    isCinemaModeOpen: false,
    lyrics: null,
    isLoadingLyrics: false,
    activeLyricIndex: -1,
    activeLyricProvider: 'auto',

    playTrack: async (track: Track, newQueue?: Track[]) => {
      const { queue, isMuted, volume, activeLyricProvider } = get();
      let updatedQueue = newQueue || (queue.length > 0 ? queue : [track]);
      let newIndex = updatedQueue.findIndex((t) => t.id === track.id);
      if (newIndex === -1) {
        updatedQueue = [track, ...updatedQueue];
        newIndex = 0;
      }

      const streamUrl = window.electronAPI
        ? window.electronAPI.readAudioStreamUrl(track.path)
        : track.path;

      // Update state immediately so UI reflects selected track
      set({
        currentTrack: track,
        queue: updatedQueue,
        queueIndex: newIndex,
        currentTime: 0,
        duration: track.duration,
        lyrics: null,
        isLoadingLyrics: true,
        activeLyricIndex: -1,
      });

      audio.src = streamUrl;
      audio.volume = isMuted ? 0 : volume;

      try {
        await audio.play();
        set({ isPlaying: true });

        if (window.electronAPI) {
          window.electronAPI.recordPlay(track.id);
          window.electronAPI.getAudioFormat(track.path).then((format) => {
            set({ audioFormat: format });
          });
          window.electronAPI.updateDiscordPresence(track, true, 0);

          // Fetch lyrics asynchronously using active provider
          window.electronAPI.getLyrics(track, activeLyricProvider).then((lyricsResult) => {
            if (get().currentTrack?.id === track.id) {
              set({ lyrics: lyricsResult, isLoadingLyrics: false });
            }
          }).catch((err) => {
            console.warn('Failed to load lyrics:', err);
            if (get().currentTrack?.id === track.id) {
              set({ isLoadingLyrics: false });
            }
          });
        }
      } catch (err) {
        console.error('Audio play() failed:', err);
      }
    },

    togglePlay: () => {
      const { isPlaying, currentTrack } = get();
      if (!currentTrack) return;

      if (isPlaying) {
        audio.pause();
        set({ isPlaying: false });
        if (window.electronAPI) {
          window.electronAPI.updateDiscordPresence(currentTrack, false, audio.currentTime);
        }
      } else {
        audio.play().then(() => {
          set({ isPlaying: true });
          if (window.electronAPI) {
            window.electronAPI.updateDiscordPresence(currentTrack, true, audio.currentTime);
          }
        }).catch((err) => console.error('Resume play error:', err));
      }
    },

    pause: () => {
      audio.pause();
      set({ isPlaying: false });
      const { currentTrack } = get();
      if (currentTrack && window.electronAPI) {
        window.electronAPI.updateDiscordPresence(currentTrack, false, audio.currentTime);
      }
    },

    resume: () => {
      audio.play().then(() => {
        set({ isPlaying: true });
        const { currentTrack } = get();
        if (currentTrack && window.electronAPI) {
          window.electronAPI.updateDiscordPresence(currentTrack, true, audio.currentTime);
        }
      }).catch((err) => console.error('Resume error:', err));
    },

    seek: (seconds: number) => {
      const targetDuration = audio.duration || get().duration || 0;
      if (!targetDuration || isNaN(seconds)) return;
      // Clamp target seconds to prevent seeking beyond duration or triggering onended prematurely
      const safeSeconds = Math.max(0, Math.min(seconds, targetDuration - 0.3));
      try {
        audio.currentTime = safeSeconds;
        const { currentTrack, isPlaying, lyrics } = get();
        let newIndex = -1;
        if (lyrics?.syncedLyrics && lyrics.syncedLyrics.length > 0) {
          for (let i = lyrics.syncedLyrics.length - 1; i >= 0; i--) {
            if (safeSeconds >= lyrics.syncedLyrics[i].time - 0.25) {
              newIndex = i;
              break;
            }
          }
        }
        set({ currentTime: safeSeconds, activeLyricIndex: newIndex });
        if (currentTrack && isPlaying && window.electronAPI) {
          window.electronAPI.updateDiscordPresence(currentTrack, true, safeSeconds);
        }
      } catch (err) {
        console.error('Seek error:', err);
      }
    },

    setVolume: (val: number) => {
      const isMuted = val === 0;
      audio.volume = isMuted ? 0 : val;
      set({ volume: val, isMuted });
      persistVolumeState(val, isMuted);
    },

    toggleMute: () => {
      const { isMuted, volume } = get();
      const nextMuted = !isMuted;
      audio.volume = nextMuted ? 0 : (volume || 0.8);
      set({ isMuted: nextMuted });
      persistVolumeState(volume || 0.8, nextMuted);
    },

    nextTrack: () => {
      const { queue, queueIndex, repeatMode, isShuffle, currentTrack, history } = get();
      if (!queue.length) return;

      let nextIndex = queueIndex + 1;
      if (isShuffle) {
        nextIndex = Math.floor(Math.random() * queue.length);
      } else if (nextIndex >= queue.length) {
        if (repeatMode === 'all') {
          nextIndex = 0;
        } else {
          set({ isPlaying: false });
          return;
        }
      }

      const nextTrackObj = queue[nextIndex];
      if (nextTrackObj) {
        const newHistory = currentTrack ? [currentTrack, ...history] : history;
        set({ history: newHistory });
        get().playTrack(nextTrackObj, queue);
      }
    },

    previousTrack: () => {
      const { queue, queueIndex, currentTime } = get();
      if (currentTime > 3) {
        audio.currentTime = 0;
        set({ currentTime: 0 });
        return;
      }

      let prevIndex = queueIndex - 1;
      if (prevIndex < 0) {
        prevIndex = queue.length - 1;
      }

      const prevTrackObj = queue[prevIndex];
      if (prevTrackObj) {
        get().playTrack(prevTrackObj, queue);
      }
    },

    setQueue: (tracks: Track[], startIndex = 0) => {
      set({ queue: tracks, queueIndex: startIndex });
      if (tracks[startIndex]) {
        get().playTrack(tracks[startIndex], tracks);
      }
    },

    addToQueue: (track: Track) => {
      set((state) => ({ queue: [...state.queue, track] }));
    },

    removeFromQueue: (index: number) => {
      set((state) => {
        const updated = [...state.queue];
        updated.splice(index, 1);
        return { queue: updated };
      });
    },

    clearQueue: () => {
      set({ queue: [], queueIndex: 0 });
    },

    reorderQueue: (startIndex: number, endIndex: number) => {
      set((state) => {
        const result = Array.from(state.queue);
        const [removed] = result.splice(startIndex, 1);
        result.splice(endIndex, 0, removed);
        return { queue: result };
      });
    },

    toggleRepeatMode: () => {
      set((state) => {
        const modes: ('off' | 'all' | 'one')[] = ['off', 'all', 'one'];
        const nextIdx = (modes.indexOf(state.repeatMode) + 1) % modes.length;
        return { repeatMode: modes[nextIdx] };
      });
    },

    toggleShuffle: () => {
      set((state) => ({ isShuffle: !state.isShuffle }));
    },

    toggleNowPlayingDrawer: () => {
      set((state) => ({ isNowPlayingDrawerOpen: !state.isNowPlayingDrawerOpen }));
    },

    setNowPlayingDrawerOpen: (open: boolean) => {
      set({ isNowPlayingDrawerOpen: open });
    },

    toggleCinemaMode: () => {
      set((state) => ({ isCinemaModeOpen: !state.isCinemaModeOpen }));
    },

    setCinemaModeOpen: (open: boolean) => {
      set({ isCinemaModeOpen: open });
    },

    setLyricProvider: async (provider: LyricProviderOption) => {
      set({ activeLyricProvider: provider, isLoadingLyrics: true });
      const { currentTrack } = get();
      if (currentTrack && window.electronAPI) {
        try {
          const lyricsResult = await window.electronAPI.getLyrics(currentTrack, provider);
          if (get().currentTrack?.id === currentTrack.id) {
            set({ lyrics: lyricsResult, isLoadingLyrics: false });
          }
        } catch (err) {
          console.warn('Failed to switch lyric provider:', err);
          if (get().currentTrack?.id === currentTrack.id) {
            set({ isLoadingLyrics: false });
          }
        }
      } else {
        set({ isLoadingLyrics: false });
      }
    },

    initFromSettings: (volume: number, isMuted?: boolean, lyricsProvider?: LyricProviderOption) => {
      const safeVol = typeof volume === 'number' && !isNaN(volume) ? Math.max(0, Math.min(1, volume)) : 0.8;
      const muted = Boolean(isMuted);
      audio.volume = muted ? 0 : safeVol;
      set({
        volume: safeVol,
        isMuted: muted,
        activeLyricProvider: lyricsProvider || 'auto',
      });
    },
  };
});

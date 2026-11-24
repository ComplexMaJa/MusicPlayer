import { create } from 'zustand';
import { Track, AudioFormatInfo, LyricsResult, LyricProviderOption } from '../../shared/types';
import { useSettingsStore } from './useSettingsStore';
import { findActiveLineIndex } from '../utils/karaokeEngine';

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
  playbackError: string | null;

  // Actions
  playTrack: (track: Track, newQueue?: Track[]) => Promise<void>;
  playQueueIndex: (index: number) => Promise<void>;
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
  setCurrentTrackFavorite: (trackId: string, isFavorite: boolean) => void;
  clearPlaybackError: () => void;
  initFromSettings: (volume: number, isMuted?: boolean, lyricsProvider?: LyricProviderOption) => void;
}

const MAX_HISTORY_ITEMS = 200;

const audio = new Audio();
audio.preload = 'auto';

export const getAudioElement = (): HTMLAudioElement => audio;

let volumePersistTimer: ReturnType<typeof setTimeout> | null = null;
let lastNonZeroVolume = 0.8;
let playRequestId = 0;
let lyricRequestId = 0;
const visitedQueueIndices = new Set<number>();

const clampVolume = (val: number, fallback = 0.8): number =>
  typeof val === 'number' && Number.isFinite(val) ? Math.max(0, Math.min(1, val)) : fallback;

const persistVolumeState = (volume: number, isMuted: boolean) => {
  if (volumePersistTimer) clearTimeout(volumePersistTimer);
  volumePersistTimer = setTimeout(() => {
    const api = window.electronAPI;
    if (api) {
      api
        .saveSettings({ volume, isMuted })
        .catch((err) => console.warn('Failed to persist volume state:', err));
    }
  }, 300);
};

const syncDiscordPresenceSafe = (track: Track | null, isPlaying: boolean, currentTime: number) => {
  const api = window.electronAPI;
  if (!api) return;
  api
    .updateDiscordPresence(track, isPlaying, Number.isFinite(currentTime) ? currentTime : 0)
    .catch((err) => console.warn('Failed to update Discord presence:', err));
};

export const usePlayerStore = create<PlayerStoreState>((set, get) => {
  const startPlayback = async (
    track: Track,
    updatedQueue: Track[],
    newIndex: number,
    options?: { recordHistory?: boolean; nextHistory?: Track[] }
  ): Promise<void> => {
    const requestId = ++playRequestId;
    const { isMuted, volume, activeLyricProvider, currentTrack, history } = get();
    const api = window.electronAPI;

    let nextHistory = options?.nextHistory ?? history;
    if (options?.recordHistory && currentTrack) {
      nextHistory = [currentTrack, ...history].slice(0, MAX_HISTORY_ITEMS);
    }

    visitedQueueIndices.add(newIndex);

    const safeDuration = Number.isFinite(track.duration) && track.duration > 0 ? track.duration : 0;

    set({
      currentTrack: track,
      queue: updatedQueue,
      queueIndex: newIndex,
      history: nextHistory,
      currentTime: 0,
      duration: safeDuration,
      audioFormat: null,
      lyrics: null,
      isLoadingLyrics: Boolean(api),
      activeLyricIndex: -1,
      playbackError: null,
    });

    if (!api) {
      audio.pause();
      audio.removeAttribute('src');
      set({ isPlaying: false, isLoadingLyrics: false });
      return;
    }

    const streamUrl = api.readAudioStreamUrl(track.path);
    audio.src = streamUrl;
    audio.volume = isMuted ? 0 : clampVolume(volume);

    try {
      await audio.play();
      if (requestId !== playRequestId || get().currentTrack?.id !== track.id) {
        return;
      }

      set({ isPlaying: true, playbackError: null });

      api
        .recordPlay(track.id)
        .catch((err) => console.warn('Failed to record play:', err));

      syncDiscordPresenceSafe(track, true, 0);

      api
        .getAudioFormat(track.path)
        .then((format) => {
          if (requestId === playRequestId && get().currentTrack?.id === track.id) {
            set({ audioFormat: format });
          }
        })
        .catch((err) => {
          console.warn('Failed to load audio format:', err);
        });

      const currentLyricReqId = ++lyricRequestId;
      api
        .getLyrics(track, activeLyricProvider)
        .then((lyricsResult) => {
          if (
            requestId === playRequestId &&
            currentLyricReqId === lyricRequestId &&
            get().currentTrack?.id === track.id &&
            get().activeLyricProvider === activeLyricProvider
          ) {
            const nextLyricIndex = findActiveLineIndex(
              lyricsResult?.syncedLyrics ?? [],
              audio.currentTime
            );
            set({
              lyrics: lyricsResult,
              isLoadingLyrics: false,
              activeLyricIndex: nextLyricIndex,
            });
          }
        })
        .catch((err) => {
          console.warn('Failed to load lyrics:', err);
          if (
            requestId === playRequestId &&
            currentLyricReqId === lyricRequestId &&
            get().currentTrack?.id === track.id
          ) {
            set({ isLoadingLyrics: false });
          }
        });
    } catch (err) {
      // A newer playTrack call interrupted this audio.play() promise.
      if (requestId !== playRequestId) {
        return;
      }
      const errorName = (err as { name?: string } | null)?.name;
      if (errorName === 'AbortError') {
        set({ isPlaying: !audio.paused, isLoadingLyrics: false });
        return;
      }
      console.error('Audio play() failed:', err);
      set({
        isPlaying: false,
        isLoadingLyrics: false,
        playbackError: err instanceof Error ? err.message : 'Unable to play track',
      });
    }
  };

  audio.ontimeupdate = () => {
    const time = audio.currentTime;
    const { lyrics, activeLyricIndex: prevIndex } = get();
    const newIndex =
      lyrics?.syncedLyrics && lyrics.syncedLyrics.length > 0
        ? findActiveLineIndex(lyrics.syncedLyrics, time)
        : -1;

    if (newIndex !== prevIndex) {
      set({ currentTime: time, activeLyricIndex: newIndex });
    } else {
      set({ currentTime: time });
    }
  };

  audio.onloadedmetadata = () => {
    const fallbackDuration = get().currentTrack?.duration || 0;
    const nextDuration =
      Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : fallbackDuration;
    set({ duration: nextDuration });
  };

  audio.onended = () => {
    const { repeatMode, currentTrack } = get();
    if (repeatMode === 'one' && currentTrack) {
      audio.currentTime = 0;
      set({ currentTime: 0, activeLyricIndex: -1, playbackError: null });
      audio
        .play()
        .then(() => {
          syncDiscordPresenceSafe(currentTrack, true, 0);
        })
        .catch((err) => {
          console.error('Repeat-one playback error:', err);
          set({
            isPlaying: false,
            playbackError: err instanceof Error ? err.message : 'Unable to replay track',
          });
        });
    } else {
      get().nextTrack();
    }
  };

  audio.onerror = (e) => {
    console.error('Audio element playback error:', e, audio.error);
    set({
      isPlaying: false,
      isLoadingLyrics: false,
      playbackError: audio.error?.message || 'Audio playback error',
    });
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
    playbackError: null,

    playTrack: async (track: Track, newQueue?: Track[]) => {
      const { queue } = get();
      let updatedQueue = newQueue ? [...newQueue] : queue.length > 0 ? [...queue] : [track];
      if (updatedQueue.length === 0) {
        updatedQueue = [track];
      }
      let newIndex = updatedQueue.findIndex((t) => t.id === track.id);
      if (newIndex === -1) {
        updatedQueue = [track, ...updatedQueue];
        newIndex = 0;
      }
      if (newQueue) {
        visitedQueueIndices.clear();
      }
      await startPlayback(track, updatedQueue, newIndex);
    },

    playQueueIndex: async (index: number) => {
      const { queue } = get();
      if (!Number.isInteger(index) || index < 0 || index >= queue.length) return;
      await startPlayback(queue[index], queue, index);
    },

    togglePlay: () => {
      const { isPlaying, currentTrack } = get();
      if (!currentTrack) return;

      if (isPlaying) {
        audio.pause();
        set({ isPlaying: false });
        syncDiscordPresenceSafe(currentTrack, false, audio.currentTime);
      } else {
        if (!window.electronAPI || !audio.src) {
          void get().playTrack(currentTrack);
          return;
        }
        audio
          .play()
          .then(() => {
            set({ isPlaying: true, playbackError: null });
            syncDiscordPresenceSafe(currentTrack, true, audio.currentTime);
          })
          .catch((err) => {
            console.error('Resume play error:', err);
            set({
              isPlaying: false,
              playbackError: err instanceof Error ? err.message : 'Unable to resume playback',
            });
          });
      }
    },

    pause: () => {
      audio.pause();
      set({ isPlaying: false });
      const { currentTrack } = get();
      if (currentTrack) {
        syncDiscordPresenceSafe(currentTrack, false, audio.currentTime);
      }
    },

    resume: () => {
      const { currentTrack } = get();
      if (!currentTrack) return;
      if (!window.electronAPI || !audio.src) {
        void get().playTrack(currentTrack);
        return;
      }
      audio
        .play()
        .then(() => {
          set({ isPlaying: true, playbackError: null });
          syncDiscordPresenceSafe(currentTrack, true, audio.currentTime);
        })
        .catch((err) => {
          console.error('Resume error:', err);
          set({
            isPlaying: false,
            playbackError: err instanceof Error ? err.message : 'Unable to resume playback',
          });
        });
    },

    seek: (seconds: number) => {
      const targetDuration =
        Number.isFinite(audio.duration) && audio.duration > 0
          ? audio.duration
          : get().duration || 0;
      if (!targetDuration || !Number.isFinite(seconds)) return;
      const maxSeek =
        targetDuration > 0.3 ? targetDuration - 0.3 : Math.max(0, targetDuration - 0.05);
      const safeSeconds = Math.max(0, Math.min(seconds, maxSeek));
      try {
        audio.currentTime = safeSeconds;
        const { currentTrack, isPlaying, lyrics } = get();
        const newIndex =
          lyrics?.syncedLyrics && lyrics.syncedLyrics.length > 0
            ? findActiveLineIndex(lyrics.syncedLyrics, safeSeconds)
            : -1;
        set({ currentTime: safeSeconds, activeLyricIndex: newIndex });
        if (currentTrack && isPlaying) {
          syncDiscordPresenceSafe(currentTrack, true, safeSeconds);
        }
      } catch (err) {
        console.error('Seek error:', err);
      }
    },

    setVolume: (val: number) => {
      const safeVal = clampVolume(val, get().volume);
      const isMuted = safeVal === 0;
      if (safeVal > 0) {
        lastNonZeroVolume = safeVal;
      }
      audio.volume = isMuted ? 0 : safeVal;
      set({ volume: safeVal, isMuted });
      persistVolumeState(safeVal, isMuted);
    },

    toggleMute: () => {
      const { isMuted, volume } = get();
      const nextMuted = !isMuted;

      if (nextMuted) {
        audio.volume = 0;
        set({ isMuted: true });
        persistVolumeState(volume, true);
        return;
      }

      const restoredVolume = clampVolume(volume > 0 ? volume : lastNonZeroVolume, 0.8);
      audio.volume = restoredVolume;
      set({ volume: restoredVolume, isMuted: false });
      persistVolumeState(restoredVolume, false);
    },

    nextTrack: () => {
      const { queue, queueIndex, repeatMode, isShuffle, currentTrack } = get();
      if (!queue.length) return;

      let nextIndex = queueIndex + 1;

      if (isShuffle) {
        let candidates: number[] = [];
        for (let i = 0; i < queue.length; i++) {
          if (i === queueIndex) continue;
          if (repeatMode === 'off' && visitedQueueIndices.has(i)) continue;
          candidates.push(i);
        }

        if (candidates.length === 0) {
          if (repeatMode === 'off') {
            audio.pause();
            set({ isPlaying: false });
            if (currentTrack) {
              syncDiscordPresenceSafe(currentTrack, false, audio.currentTime);
            }
            return;
          }
          visitedQueueIndices.clear();
          if (queueIndex >= 0 && queueIndex < queue.length) {
            visitedQueueIndices.add(queueIndex);
          }
          candidates =
            queue.length === 1
              ? [0]
              : Array.from({ length: queue.length }, (_, i) => i).filter((i) => i !== queueIndex);
        }

        nextIndex = candidates[Math.floor(Math.random() * candidates.length)];
      } else if (nextIndex >= queue.length) {
        if (repeatMode === 'all') {
          nextIndex = 0;
        } else {
          audio.pause();
          set({ isPlaying: false });
          if (currentTrack) {
            syncDiscordPresenceSafe(currentTrack, false, audio.currentTime);
          }
          return;
        }
      }

      const nextTrackObj = queue[nextIndex];
      if (nextTrackObj) {
        void startPlayback(nextTrackObj, queue, nextIndex, { recordHistory: true });
      }
    },

    previousTrack: () => {
      const { queue, queueIndex, currentTime, isShuffle, history, currentTrack, isPlaying, lyrics } = get();
      if (audio.currentTime > 3 || currentTime > 3) {
        audio.currentTime = 0;
        const nextIndex =
          lyrics?.syncedLyrics && lyrics.syncedLyrics.length > 0
            ? findActiveLineIndex(lyrics.syncedLyrics, 0)
            : -1;
        set({ currentTime: 0, activeLyricIndex: nextIndex });
        if (currentTrack && isPlaying) {
          syncDiscordPresenceSafe(currentTrack, true, 0);
        }
        return;
      }

      if (isShuffle && history.length > 0) {
        const [prevTrackObj, ...restHistory] = history;
        if (prevTrackObj) {
          const existingIdx = queue.findIndex((t) => t.id === prevTrackObj.id);
          if (existingIdx !== -1) {
            void startPlayback(prevTrackObj, queue, existingIdx, { nextHistory: restHistory });
          } else {
            const nextQueue = [prevTrackObj, ...queue];
            visitedQueueIndices.clear();
            void startPlayback(prevTrackObj, nextQueue, 0, { nextHistory: restHistory });
          }
          return;
        }
      }

      if (!queue.length) return;
      let prevIndex = queueIndex - 1;
      if (prevIndex < 0) {
        prevIndex = queue.length - 1;
      }

      const prevTrackObj = queue[prevIndex];
      if (prevTrackObj) {
        void startPlayback(prevTrackObj, queue, prevIndex);
      }
    },

    setQueue: (tracks: Track[], startIndex = 0) => {
      visitedQueueIndices.clear();
      if (!tracks.length) {
        set({ queue: [], queueIndex: 0 });
        return;
      }
      const safeStartIndex =
        Number.isInteger(startIndex) && startIndex >= 0 && startIndex < tracks.length
          ? startIndex
          : 0;
      set({ queue: tracks, queueIndex: safeStartIndex });
      if (tracks[safeStartIndex]) {
        void startPlayback(tracks[safeStartIndex], tracks, safeStartIndex);
      }
    },

    addToQueue: (track: Track) => {
      set((state) => ({ queue: [...state.queue, track] }));
    },

    removeFromQueue: (index: number) => {
      set((state) => {
        if (!Number.isInteger(index) || index < 0 || index >= state.queue.length) {
          return state;
        }
        const updated = [...state.queue];
        updated.splice(index, 1);

        const nextVisited = new Set<number>();
        visitedQueueIndices.forEach((vIdx) => {
          if (vIdx < index) nextVisited.add(vIdx);
          else if (vIdx > index) nextVisited.add(vIdx - 1);
        });
        visitedQueueIndices.clear();
        nextVisited.forEach((vIdx) => visitedQueueIndices.add(vIdx));

        let nextQueueIndex = state.queueIndex;
        if (updated.length === 0) {
          nextQueueIndex = 0;
        } else if (index < state.queueIndex) {
          nextQueueIndex = state.queueIndex - 1;
        } else if (index === state.queueIndex) {
          nextQueueIndex = Math.min(state.queueIndex, updated.length - 1);
        }

        return { queue: updated, queueIndex: nextQueueIndex };
      });
    },

    clearQueue: () => {
      visitedQueueIndices.clear();
      set({ queue: [], queueIndex: 0 });
    },

    reorderQueue: (startIndex: number, endIndex: number) => {
      set((state) => {
        if (
          !Number.isInteger(startIndex) ||
          !Number.isInteger(endIndex) ||
          startIndex < 0 ||
          startIndex >= state.queue.length ||
          endIndex < 0 ||
          endIndex >= state.queue.length ||
          startIndex === endIndex
        ) {
          return state;
        }

        const result = Array.from(state.queue);
        const [removed] = result.splice(startIndex, 1);
        if (!removed) return state;
        result.splice(endIndex, 0, removed);

        let nextQueueIndex = state.queueIndex;
        if (state.queueIndex === startIndex) {
          nextQueueIndex = endIndex;
        } else if (startIndex < state.queueIndex && endIndex >= state.queueIndex) {
          nextQueueIndex = state.queueIndex - 1;
        } else if (startIndex > state.queueIndex && endIndex <= state.queueIndex) {
          nextQueueIndex = state.queueIndex + 1;
        }

        visitedQueueIndices.clear();
        if (nextQueueIndex >= 0 && nextQueueIndex < result.length) {
          visitedQueueIndices.add(nextQueueIndex);
        }

        return { queue: result, queueIndex: nextQueueIndex };
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
      set((state) => {
        const nextShuffle = !state.isShuffle;
        visitedQueueIndices.clear();
        if (nextShuffle && state.currentTrack && state.queueIndex >= 0 && state.queueIndex < state.queue.length) {
          visitedQueueIndices.add(state.queueIndex);
        }
        return { isShuffle: nextShuffle };
      });
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
      const currentLyricReqId = ++lyricRequestId;
      set({ activeLyricProvider: provider, isLoadingLyrics: true });

      const api = window.electronAPI;
      if (api) {
        try {
          const updated = await api.saveSettings({ lyricsProvider: provider });
          if (updated) {
            useSettingsStore.setState({ settings: updated });
          }
        } catch (err) {
          console.warn('Failed to persist lyric provider:', err);
        }
      }

      const { currentTrack } = get();
      if (currentTrack && api) {
        try {
          const lyricsResult = await api.getLyrics(currentTrack, provider);
          if (
            currentLyricReqId === lyricRequestId &&
            get().currentTrack?.id === currentTrack.id &&
            get().activeLyricProvider === provider
          ) {
            const nextIndex = findActiveLineIndex(
              lyricsResult?.syncedLyrics ?? [],
              audio.currentTime
            );
            set({
              lyrics: lyricsResult,
              isLoadingLyrics: false,
              activeLyricIndex: nextIndex,
            });
          }
        } catch (err) {
          console.warn('Failed to switch lyric provider:', err);
          if (
            currentLyricReqId === lyricRequestId &&
            get().currentTrack?.id === currentTrack.id &&
            get().activeLyricProvider === provider
          ) {
            set({ isLoadingLyrics: false });
          }
        }
      } else {
        set({ isLoadingLyrics: false });
      }
    },

    setCurrentTrackFavorite: (trackId: string, isFavorite: boolean) => {
      set((state) => {
        if (state.currentTrack?.id !== trackId) return {};
        return { currentTrack: { ...state.currentTrack, isFavorite } };
      });
    },

    clearPlaybackError: () => {
      set({ playbackError: null });
    },

    initFromSettings: (volume: number, isMuted?: boolean, lyricsProvider?: LyricProviderOption) => {
      const safeVol = clampVolume(volume, 0.8);
      const muted = Boolean(isMuted);
      if (safeVol > 0) {
        lastNonZeroVolume = safeVol;
      }
      audio.volume = muted ? 0 : safeVol;
      set({
        volume: safeVol,
        isMuted: muted,
        activeLyricProvider: lyricsProvider || 'auto',
      });
    },
  };
});

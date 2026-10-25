import React, { memo } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Heart,
  List,
  Maximize2,
  Disc,
  Mic2,
} from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { usePlayerStore } from '../stores/usePlayerStore';
import { useLibraryStore } from '../stores/useLibraryStore';
import { FormatBadge } from './FormatBadge';
import { ProgressBar } from './ProgressBar';
import { VolumeSlider } from './VolumeSlider';

const MiniPlayerProgressBar: React.FC<{ onSeek: (seconds: number) => void }> = memo(({ onSeek }) => {
  const currentTime = usePlayerStore((state) => state.currentTime);
  const duration = usePlayerStore((state) => state.duration);
  return <ProgressBar currentTime={currentTime} duration={duration} onSeek={onSeek} />;
});
MiniPlayerProgressBar.displayName = 'MiniPlayerProgressBar';

export const MiniPlayer: React.FC = () => {
  const {
    currentTrack,
    isPlaying,
    volume,
    isMuted,
    isShuffle,
    repeatMode,
    audioFormat,
    togglePlay,
    seek,
    setVolume,
    toggleMute,
    nextTrack,
    previousTrack,
    toggleShuffle,
    toggleRepeatMode,
    toggleNowPlayingDrawer,
    toggleCinemaMode,
  } = usePlayerStore(
    useShallow((state) => ({
      currentTrack: state.currentTrack,
      isPlaying: state.isPlaying,
      volume: state.volume,
      isMuted: state.isMuted,
      isShuffle: state.isShuffle,
      repeatMode: state.repeatMode,
      audioFormat: state.audioFormat,
      togglePlay: state.togglePlay,
      seek: state.seek,
      setVolume: state.setVolume,
      toggleMute: state.toggleMute,
      nextTrack: state.nextTrack,
      previousTrack: state.previousTrack,
      toggleShuffle: state.toggleShuffle,
      toggleRepeatMode: state.toggleRepeatMode,
      toggleNowPlayingDrawer: state.toggleNowPlayingDrawer,
      toggleCinemaMode: state.toggleCinemaMode,
    }))
  );

  const toggleFavorite = useLibraryStore((state) => state.toggleFavorite);
  const setActiveView = useLibraryStore((state) => state.setActiveView);

  if (!currentTrack) {
    return (
      <div className="mini-player-bar h-20 bg-[#050505] border-t border-[#1A1A1A] px-6 flex items-center justify-between text-xs text-[#666666] select-none shrink-0 transition-colors duration-300">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded bg-[#0A0A0A] border border-[#1A1A1A] flex items-center justify-center">
            <Disc className="w-5 h-5 text-[#333333]" />
          </div>
          <div>
            <p className="text-[#A3A3A3] font-medium">No track selected</p>
            <p className="text-[10px]">Select a track to start playback</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mini-player-bar h-20 bg-[#050505] border-t border-[#1A1A1A] px-6 flex items-center justify-between select-none shrink-0 relative z-20 transition-colors duration-300">
      {/* Left Track Info */}
      <div className="flex items-center gap-3 flex-1 min-w-[220px] max-w-sm">
        <div className="relative w-12 h-12 rounded overflow-hidden bg-[#0A0A0A] border border-[#1A1A1A] shrink-0 group">
          {currentTrack.artworkPath ? (
            <img
              src={currentTrack.artworkPath}
              alt={currentTrack.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#101010] to-[#050505]">
              <Disc className="w-5 h-5 text-accent" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1 flex flex-col justify-center">
          <div className="flex items-center gap-2 min-w-0">
            <p className="text-xs font-medium text-white truncate">{currentTrack.title}</p>
            <FormatBadge
              format={audioFormat}
              codec={currentTrack.codec}
              sampleRate={currentTrack.sampleRate}
              bitDepth={currentTrack.bitDepth}
            />
          </div>
          <p className="text-[11px] text-[#A3A3A3] truncate">{currentTrack.artist}</p>
        </div>
        <button
          onClick={() => toggleFavorite(currentTrack.id)}
          className="text-[#666666] hover:text-accent transition-all p-1.5 rounded-full hover:bg-[#151515] active:scale-125 group/fav shrink-0"
          title="Favorite"
          aria-label={currentTrack.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        >
          <Heart
            className={`w-4 h-4 transition-all duration-200 ${
              currentTrack.isFavorite ? 'scale-105' : 'group-hover/fav:scale-110'
            }`}
            style={
              currentTrack.isFavorite
                ? { fill: 'var(--accent-color, #FF2E55)', color: 'var(--accent-color, #FF2E55)' }
                : undefined
            }
          />
        </button>
      </div>

      {/* Center Controls & Progress */}
      <div className="flex flex-col items-center gap-1.5 w-full max-w-lg px-4 shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={toggleShuffle}
            className="p-1.5 rounded-full transition-all duration-200 hover:scale-110 active:scale-90 cursor-pointer"
            style={
              isShuffle
                ? {
                    color: 'var(--accent-color, #FF2E55)',
                    backgroundColor: 'var(--accent-glow, rgba(255, 46, 85, 0.15))',
                  }
                : { color: '#666666' }
            }
            title="Shuffle"
            aria-label={isShuffle ? 'Disable shuffle' : 'Enable shuffle'}
          >
            <Shuffle className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={previousTrack}
            className="text-[#EDEDED] hover:text-white p-1.5 rounded-full hover:bg-[#151515] transition-all duration-150 hover:scale-110 active:scale-90"
            title="Previous"
            aria-label="Previous track"
          >
            <SkipBack className="w-4 h-4" />
          </button>
          <button
            onClick={togglePlay}
            className="w-8 h-8 rounded-full flex items-center justify-center text-white transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer shadow-lg"
            style={{
              backgroundColor: 'var(--accent-color, #FF2E55)',
              boxShadow: '0 0 16px var(--accent-glow, rgba(255, 46, 85, 0.45))',
            }}
            title={isPlaying ? 'Pause' : 'Play'}
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <Pause className="w-4 h-4 fill-white" />
            ) : (
              <Play className="w-4 h-4 fill-white translate-x-0.5" />
            )}
          </button>
          <button
            onClick={nextTrack}
            className="text-[#EDEDED] hover:text-white p-1.5 rounded-full hover:bg-[#151515] transition-all duration-150 hover:scale-110 active:scale-90"
            title="Next"
            aria-label="Next track"
          >
            <SkipForward className="w-4 h-4" />
          </button>
          <button
            onClick={toggleRepeatMode}
            className="p-1.5 rounded-full transition-all duration-200 hover:scale-110 active:scale-90 cursor-pointer"
            style={
              repeatMode !== 'off'
                ? {
                    color: 'var(--accent-color, #FF2E55)',
                    backgroundColor: 'var(--accent-glow, rgba(255, 46, 85, 0.15))',
                  }
                : { color: '#666666' }
            }
            title={`Repeat: ${repeatMode}`}
            aria-label={`Repeat mode: ${repeatMode}`}
          >
            <Repeat className="w-3.5 h-3.5" />
          </button>
        </div>

        <MiniPlayerProgressBar onSeek={seek} />
      </div>

      {/* Right Controls */}
      <div className="flex items-center justify-end gap-3.5 flex-1 min-w-[200px] shrink-0">
        <VolumeSlider
          volume={volume}
          isMuted={isMuted}
          onVolumeChange={setVolume}
          onToggleMute={toggleMute}
        />
        <button
          onClick={toggleNowPlayingDrawer}
          className="text-[#666666] hover:text-white p-1.5 rounded-full hover:bg-[#151515] transition-all duration-150 hover:scale-110 active:scale-90 cursor-pointer"
          title="Side Panel (Artwork & Lyrics)"
          aria-label="Toggle artwork and lyrics panel"
        >
          <Mic2 className="w-4 h-4" />
        </button>
        <button
          onClick={() => setActiveView('queue')}
          className="text-[#666666] hover:text-white p-1.5 rounded-full hover:bg-[#151515] transition-all duration-150 hover:scale-110 active:scale-90 cursor-pointer"
          title="Queue"
          aria-label="Open queue"
        >
          <List className="w-4 h-4" />
        </button>
        <button
          onClick={toggleCinemaMode}
          className="text-[#666666] hover:text-white p-1.5 rounded-full hover:bg-[#151515] transition-all duration-150 hover:scale-110 active:scale-90 cursor-pointer"
          title="Fullscreen Ambient Cinema Mode"
          aria-label="Open cinema mode"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

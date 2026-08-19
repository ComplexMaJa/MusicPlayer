import React from 'react';
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
} from 'lucide-react';
import { usePlayerStore } from '../stores/usePlayerStore';
import { useLibraryStore } from '../stores/useLibraryStore';
import { FormatBadge } from './FormatBadge';
import { ProgressBar } from './ProgressBar';
import { VolumeSlider } from './VolumeSlider';

export const MiniPlayer: React.FC = () => {
  const {
    currentTrack,
    isPlaying,
    currentTime,
    duration,
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
  } = usePlayerStore();

  const { toggleFavorite, setActiveView } = useLibraryStore();

  if (!currentTrack) {
    return (
      <div className="h-20 bg-[#050505] border-t border-[#1A1A1A] px-6 flex items-center justify-between text-xs text-[#666666] select-none shrink-0">
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
    <div className="h-20 bg-[#050505] border-t border-[#1A1A1A] px-6 flex items-center justify-between select-none shrink-0 relative z-20">
      {/* Left Track Info */}
      <div className="flex items-center gap-3 w-1/4 min-w-[200px]">
        <div className="relative w-12 h-12 rounded overflow-hidden bg-[#0A0A0A] border border-[#1A1A1A] shrink-0 group">
          {currentTrack.artworkPath ? (
            <img
              src={currentTrack.artworkPath}
              alt={currentTrack.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#101010] to-[#050505]">
              <Disc className="w-5 h-5 text-[#FF2E55]" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-white truncate">{currentTrack.title}</p>
          <p className="text-[11px] text-[#A3A3A3] truncate">{currentTrack.artist}</p>
        </div>
        <button
          onClick={() => toggleFavorite(currentTrack.id)}
          className="text-[#666666] hover:text-accent transition-all p-1.5 rounded-full hover:bg-[#151515] active:scale-125 group/fav"
          title="Favorite"
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
      <div className="flex flex-col items-center gap-1.5 w-2/4 max-w-xl px-4">
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
          >
            <Shuffle className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={previousTrack}
            className="text-[#EDEDED] hover:text-white p-1.5 rounded-full hover:bg-[#151515] transition-all duration-150 hover:scale-110 active:scale-90"
            title="Previous"
          >
            <SkipBack className="w-4 h-4" />
          </button>
          <button
            onClick={togglePlay}
            className="w-8 h-8 rounded-full flex items-center justify-center text-white transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer"
            style={{
              backgroundColor: 'var(--accent-color, #FF2E55)',
              boxShadow: '0 0 16px var(--accent-glow, rgba(255, 46, 85, 0.45))',
            }}
            title={isPlaying ? 'Pause' : 'Play'}
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
          >
            <Repeat className="w-3.5 h-3.5" />
          </button>
        </div>

        <ProgressBar currentTime={currentTime} duration={duration} onSeek={seek} />
      </div>

      {/* Right Controls */}
      <div className="flex items-center justify-end gap-4 w-1/4 min-w-[200px]">
        <FormatBadge format={audioFormat} codec={currentTrack.codec} />
        <VolumeSlider
          volume={volume}
          isMuted={isMuted}
          onVolumeChange={setVolume}
          onToggleMute={toggleMute}
        />
        <button
          onClick={() => setActiveView('queue')}
          className="text-[#666666] hover:text-white p-1.5 rounded-full hover:bg-[#151515] transition-all duration-150 hover:scale-110 active:scale-90"
          title="Queue"
        >
          <List className="w-4 h-4" />
        </button>
        <button
          onClick={toggleNowPlayingDrawer}
          className="text-[#666666] hover:text-white p-1.5 rounded-full hover:bg-[#151515] transition-all duration-150 hover:scale-110 active:scale-90"
          title="Toggle Now Playing Panel"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

import React from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Heart,
  X,
  Disc,
} from 'lucide-react';
import { usePlayerStore } from '../stores/usePlayerStore';
import { useLibraryStore } from '../stores/useLibraryStore';
import { FormatBadge } from './FormatBadge';
import { ProgressBar } from './ProgressBar';
import { VolumeSlider } from './VolumeSlider';

export const NowPlayingDrawer: React.FC = () => {
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
    isNowPlayingDrawerOpen,
    togglePlay,
    seek,
    setVolume,
    toggleMute,
    nextTrack,
    previousTrack,
    toggleShuffle,
    toggleRepeatMode,
    setNowPlayingDrawerOpen,
  } = usePlayerStore();

  const { toggleFavorite } = useLibraryStore();

  if (!isNowPlayingDrawerOpen || !currentTrack) return null;

  return (
    <aside className="w-80 bg-[#050505] border-l border-[#1A1A1A] flex flex-col justify-between p-6 select-none shrink-0 relative z-10 animate-fadeIn">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[10px] font-semibold tracking-widest text-[#666666] uppercase font-mono">
          NOW PLAYING
        </h2>
        <button
          onClick={() => setNowPlayingDrawerOpen(false)}
          className="text-[#666666] hover:text-white p-1.5 rounded-full hover:bg-[#151515] transition-all duration-150 hover:scale-110 active:scale-90"
          title="Close panel"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Large Artwork */}
      <div className="my-auto flex flex-col items-center gap-6">
        <div className="w-64 h-64 rounded-2xl overflow-hidden bg-[#0A0A0A] border border-[#1A1A1A] shadow-2xl relative group hover:border-[#2E2E2E] transition-all duration-300">
          {currentTrack.artworkPath ? (
            <img
              src={currentTrack.artworkPath}
              alt={currentTrack.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-[#101010] to-[#050505]">
              <Disc className="w-16 h-16 text-[#FF2E55] opacity-80" />
            </div>
          )}
        </div>

        {/* Track Title & Artist */}
        <div className="w-full flex items-center justify-between">
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold text-white truncate">{currentTrack.title}</h3>
            <p className="text-xs text-[#A3A3A3] truncate">{currentTrack.artist}</p>
            <p className="text-[11px] text-[#666666] truncate mt-0.5">{currentTrack.album}</p>
          </div>
          <button
            onClick={() => toggleFavorite(currentTrack.id)}
            className="text-[#666666] hover:text-[#FF2E55] p-2 rounded-full hover:bg-[#151515] transition-all duration-200 active:scale-125 shrink-0 group/fav"
            title="Favorite"
          >
            <Heart
              className={`w-5 h-5 transition-all duration-200 ${
                currentTrack.isFavorite ? 'fill-[#FF2E55] text-[#FF2E55] scale-105' : 'group-hover/fav:scale-110'
              }`}
            />
          </button>
        </div>

        {/* Seekbar */}
        <ProgressBar currentTime={currentTime} duration={duration} onSeek={seek} />

        {/* Format Info Badge */}
        <div className="flex justify-center">
          <FormatBadge format={audioFormat} codec={currentTrack.codec} />
        </div>

        {/* Controls */}
        <div className="flex items-center gap-6 my-2">
          <button
            onClick={toggleShuffle}
            className={`p-2 rounded-full transition-all duration-200 hover:scale-110 active:scale-90 ${
              isShuffle ? 'text-[#FF2E55] bg-[#FF2E55]/10' : 'text-[#666666] hover:text-white hover:bg-[#151515]'
            }`}
            title="Shuffle"
          >
            <Shuffle className="w-4 h-4" />
          </button>
          <button
            onClick={previousTrack}
            className="text-[#EDEDED] hover:text-white p-2 rounded-full hover:bg-[#151515] transition-all duration-150 hover:scale-110 active:scale-90"
            title="Previous"
          >
            <SkipBack className="w-5 h-5" />
          </button>
          <button
            onClick={togglePlay}
            className="w-12 h-12 rounded-full bg-[#FF2E55] hover:bg-[#FF4568] flex items-center justify-center text-white transition-all duration-200 shadow-lg shadow-[#FF2E55]/30 hover:shadow-xl hover:shadow-[#FF2E55]/50 hover:scale-105 active:scale-95 cursor-pointer"
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <Pause className="w-5 h-5 fill-white" />
            ) : (
              <Play className="w-5 h-5 fill-white translate-x-0.5" />
            )}
          </button>
          <button
            onClick={nextTrack}
            className="text-[#EDEDED] hover:text-white p-2 rounded-full hover:bg-[#151515] transition-all duration-150 hover:scale-110 active:scale-90"
            title="Next"
          >
            <SkipForward className="w-5 h-5" />
          </button>
          <button
            onClick={toggleRepeatMode}
            className={`p-2 rounded-full transition-all duration-200 hover:scale-110 active:scale-90 ${
              repeatMode !== 'off' ? 'text-[#FF2E55] bg-[#FF2E55]/10' : 'text-[#666666] hover:text-white hover:bg-[#151515]'
            }`}
            title={`Repeat: ${repeatMode}`}
          >
            <Repeat className="w-4 h-4" />
          </button>
        </div>

        {/* Volume */}
        <div className="w-full px-4">
          <VolumeSlider
            volume={volume}
            isMuted={isMuted}
            onVolumeChange={setVolume}
            onToggleMute={toggleMute}
            className="w-full justify-center"
          />
        </div>
      </div>
    </aside>
  );
};

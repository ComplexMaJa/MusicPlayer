import React, { useState, useEffect, useRef, memo } from 'react';
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
  Mic2,
  Image as ImageIcon,
  Maximize2,
  Sparkles,
  ChevronDown,
  Check,
} from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { usePlayerStore } from '../stores/usePlayerStore';
import { useLibraryStore } from '../stores/useLibraryStore';
import { FormatBadge } from './FormatBadge';
import { ProgressBar } from './ProgressBar';
import { VolumeSlider } from './VolumeSlider';

const DrawerProgressBar: React.FC<{ onSeek: (seconds: number) => void }> = memo(({ onSeek }) => {
  const currentTime = usePlayerStore((state) => state.currentTime);
  const duration = usePlayerStore((state) => state.duration);
  return <ProgressBar currentTime={currentTime} duration={duration} onSeek={onSeek} />;
});
DrawerProgressBar.displayName = 'DrawerProgressBar';

const NowPlayingDrawerContent: React.FC = () => {
  const {
    currentTrack,
    isPlaying,
    volume,
    isMuted,
    isShuffle,
    repeatMode,
    audioFormat,
    isNowPlayingDrawerOpen,
    lyrics,
    isLoadingLyrics,
    activeLyricIndex,
    activeLyricProvider,
    togglePlay,
    seek,
    setVolume,
    toggleMute,
    nextTrack,
    previousTrack,
    toggleShuffle,
    toggleRepeatMode,
    setNowPlayingDrawerOpen,
    toggleCinemaMode,
    setLyricProvider,
  } = usePlayerStore(
    useShallow((state) => ({
      currentTrack: state.currentTrack,
      isPlaying: state.isPlaying,
      volume: state.volume,
      isMuted: state.isMuted,
      isShuffle: state.isShuffle,
      repeatMode: state.repeatMode,
      audioFormat: state.audioFormat,
      isNowPlayingDrawerOpen: state.isNowPlayingDrawerOpen,
      lyrics: state.lyrics,
      isLoadingLyrics: state.isLoadingLyrics,
      activeLyricIndex: state.activeLyricIndex,
      activeLyricProvider: state.activeLyricProvider,
      togglePlay: state.togglePlay,
      seek: state.seek,
      setVolume: state.setVolume,
      toggleMute: state.toggleMute,
      nextTrack: state.nextTrack,
      previousTrack: state.previousTrack,
      toggleShuffle: state.toggleShuffle,
      toggleRepeatMode: state.toggleRepeatMode,
      setNowPlayingDrawerOpen: state.setNowPlayingDrawerOpen,
      toggleCinemaMode: state.toggleCinemaMode,
      setLyricProvider: state.setLyricProvider,
    }))
  );

  const toggleFavorite = useLibraryStore((state) => state.toggleFavorite);
  const [activeTab, setActiveTab] = useState<'artwork' | 'lyrics'>('artwork');
  const [isProviderMenuOpen, setIsProviderMenuOpen] = useState(false);
  const activeLyricRef = useRef<HTMLDivElement | null>(null);
  const lyricsContainerRef = useRef<HTMLDivElement | null>(null);
  const providerMenuRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll active lyric into center view smoothly
  useEffect(() => {
    if (activeTab === 'lyrics' && activeLyricRef.current && lyricsContainerRef.current) {
      activeLyricRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [activeLyricIndex, activeTab]);

  if (!isNowPlayingDrawerOpen || !currentTrack) return null;

  const hasSyncedLyrics = Boolean(lyrics?.syncedLyrics && lyrics.syncedLyrics.length > 0);

  return (
    <aside className="w-80 bg-[#050505] border-l border-[#1A1A1A] flex flex-col justify-between p-5 select-none shrink-0 relative z-10 animate-fadeIn">
      {/* Header with Cinema Mode Launcher & View Switcher */}
      <div className="flex items-center justify-between pb-3 border-b border-[#141414]">
        <div className="flex items-center gap-1 bg-[#101010] p-0.5 rounded-lg border border-[#1E1E1E]">
          <button
            onClick={() => setActiveTab('artwork')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
              activeTab === 'artwork'
                ? 'bg-[#202020] text-white shadow-sm'
                : 'text-[#666666] hover:text-white'
            }`}
            title="Artwork View"
          >
            <ImageIcon className="w-3 h-3" />
            <span>Artwork</span>
          </button>
          <button
            onClick={() => setActiveTab('lyrics')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer relative ${
              activeTab === 'lyrics'
                ? 'bg-[#202020] text-white shadow-sm'
                : 'text-[#666666] hover:text-white'
            }`}
            title="Live Synced Lyrics"
          >
            <Mic2 className="w-3 h-3" style={{ color: 'var(--accent-color, #FF2E55)' }} />
            <span>Lyrics</span>
            {hasSyncedLyrics && (
              <span
                className="w-1.5 h-1.5 rounded-full animate-pulse"
                style={{ backgroundColor: 'var(--accent-color, #FF2E55)' }}
              />
            )}
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={toggleCinemaMode}
            className="text-[#666666] hover:text-white p-1.5 rounded-full hover:bg-[#151515] transition-all duration-150 hover:scale-110 active:scale-90"
            title="Expand to Fullscreen Cinema Mode"
            aria-label="Open cinema mode"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setNowPlayingDrawerOpen(false)}
            className="text-[#666666] hover:text-white p-1.5 rounded-full hover:bg-[#151515] transition-all duration-150 hover:scale-110 active:scale-90"
            title="Close panel"
            aria-label="Close now playing panel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Content Area: Artwork View vs Lyrics View */}
      <div className="my-auto flex flex-col items-center gap-5 w-full overflow-hidden">
        {activeTab === 'artwork' ? (
          /* Artwork View */
          <div className="w-64 h-64 rounded-2xl overflow-hidden bg-[#0A0A0A] border border-[#1A1A1A] shadow-2xl relative group hover:border-[#2E2E2E] transition-all duration-300">
            {currentTrack.artworkPath ? (
              <img
                src={currentTrack.artworkPath}
                alt={currentTrack.title}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-[#101010] to-[#050505]">
                <Disc
                  className="w-16 h-16 opacity-80"
                  style={{ color: 'var(--accent-color, #FF2E55)' }}
                />
              </div>
            )}
          </div>
        ) : (
          /* Live Synced Lyrics View */
          <div className="w-full flex flex-col h-64">
            {/* Provider Selector Mini Bar */}
            <div className="flex items-center justify-between px-2 pb-2 mb-1 border-b border-[#1A1A1A] relative" ref={providerMenuRef}>
              <div className="flex items-center gap-1.5 text-[10px] font-mono text-[#888888]">
                <span
                  className="w-1.5 h-1.5 rounded-full animate-pulse"
                  style={{ backgroundColor: 'var(--accent-color, #FF2E55)' }}
                />
                <span>SYNCHRONIZED</span>
              </div>
              <button
                onClick={() => setIsProviderMenuOpen(!isProviderMenuOpen)}
                className="text-[9px] font-mono tracking-wider text-[#8A8A95] hover:text-white bg-[#141418] hover:bg-[#202028] px-2 py-0.5 rounded-md border border-[#252530] uppercase flex items-center gap-1 transition-all cursor-pointer"
                title="Select Lyric Provider"
                aria-label="Select lyrics provider"
              >
                <span>
                  {activeLyricProvider !== 'auto'
                    ? activeLyricProvider.toUpperCase()
                    : lyrics?.source
                    ? lyrics.source.toUpperCase()
                    : 'AUTO'}
                </span>
                <ChevronDown className="w-2.5 h-2.5 text-[#666675]" />
              </button>

              {isProviderMenuOpen && (
                <div className="absolute right-0 top-7 w-44 bg-[#101014] border border-[#262632] rounded-xl shadow-2xl py-1 z-50 animate-fadeIn backdrop-blur-xl">
                  {(['auto', 'online', 'embedded', 'local'] as const).map((prov) => (
                    <button
                      key={prov}
                      onClick={() => {
                        setLyricProvider(prov);
                        setIsProviderMenuOpen(false);
                      }}
                      className={`w-full px-2.5 py-1.5 text-left text-[11px] flex items-center justify-between transition-colors cursor-pointer ${
                        activeLyricProvider === prov
                          ? 'text-white font-bold bg-[#1E1E28]'
                          : 'text-[#9595A5] hover:text-white hover:bg-[#161620]'
                      }`}
                    >
                      <span className="capitalize">
                        {prov === 'auto'
                          ? '⚡ Auto'
                          : prov === 'online'
                          ? '🌐 LRCLIB'
                          : prov === 'embedded'
                          ? '🏷️ Embedded'
                          : '📁 Local'}
                      </span>
                      {activeLyricProvider === prov && (
                        <Check className="w-3 h-3" style={{ color: 'var(--accent-color, #FF2E55)' }} />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div
              ref={lyricsContainerRef}
              className="flex-1 overflow-y-auto px-2 py-2 flex flex-col gap-3 text-center no-scrollbar mask-gradient"
            >
              {isLoadingLyrics ? (
                <div className="h-full flex flex-col items-center justify-center gap-2 text-xs text-[#666666] animate-pulse">
                  <Sparkles
                    className="w-5 h-5 animate-spin-slow"
                    style={{ color: 'var(--accent-color, #FF2E55)' }}
                  />
                  <span>Finding synchronized lyrics...</span>
                </div>
              ) : hasSyncedLyrics ? (
                lyrics!.syncedLyrics.map((line, idx) => {
                  const isActive = idx === activeLyricIndex;
                  const isPast = activeLyricIndex !== -1 && idx < activeLyricIndex;
                  return (
                    <div
                      key={idx}
                      ref={isActive ? activeLyricRef : null}
                      onClick={() => seek(line.time)}
                      className={`py-1.5 px-3 rounded-xl transition-all duration-300 cursor-pointer font-medium select-none ${
                        isActive
                          ? 'text-white text-sm font-bold scale-105 shadow-md shadow-black/40'
                          : isPast
                          ? 'text-[#444444] text-xs hover:text-[#777777]'
                          : 'text-[#666666] text-xs hover:text-white hover:scale-102'
                      }`}
                      style={
                        isActive
                          ? {
                              color: 'var(--accent-color, #FF2E55)',
                              textShadow: '0 0 12px var(--accent-glow, rgba(255, 46, 85, 0.5))',
                              backgroundColor: 'rgba(255, 255, 255, 0.04)',
                            }
                          : undefined
                      }
                    >
                      {line.text || '♪'}
                    </div>
                  );
                })
              ) : (
                <div className="h-full flex flex-col items-center justify-center gap-2 text-xs text-[#666666] px-4">
                  <Mic2 className="w-6 h-6 opacity-40 text-[#A3A3A3]" />
                  <p className="font-medium text-center text-[#888888] leading-relaxed">
                    {lyrics?.plainLyrics || 'No synchronized lyrics found.'}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Track Title & Artist */}
        <div className="w-full flex items-center justify-between">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold text-white truncate">{currentTrack.title}</h3>
            <p className="text-xs text-[#A3A3A3] truncate">{currentTrack.artist}</p>
            <p className="text-[10px] text-[#666666] truncate mt-0.5">{currentTrack.album}</p>
          </div>
          <button
            onClick={() => toggleFavorite(currentTrack.id)}
            className="text-[#666666] hover:text-accent p-2 rounded-full hover:bg-[#151515] transition-all duration-200 active:scale-125 shrink-0 group/fav cursor-pointer"
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

        {/* Seekbar */}
        <DrawerProgressBar onSeek={seek} />

        {/* Format Info Badge */}
        <div className="flex justify-center">
          <FormatBadge
            format={audioFormat}
            codec={currentTrack.codec}
            sampleRate={currentTrack.sampleRate}
            bitDepth={currentTrack.bitDepth}
          />
        </div>

        {/* Playback Controls */}
        <div className="flex items-center gap-5 my-1">
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
            <Shuffle className="w-4 h-4" />
          </button>
          <button
            onClick={previousTrack}
            className="text-[#EDEDED] hover:text-white p-1.5 rounded-full hover:bg-[#151515] transition-all duration-150 hover:scale-110 active:scale-90 cursor-pointer"
            title="Previous"
            aria-label="Previous track"
          >
            <SkipBack className="w-4 h-4" />
          </button>
          <button
            onClick={togglePlay}
            className="w-11 h-11 rounded-full flex items-center justify-center text-white transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer shadow-lg"
            style={{
              backgroundColor: 'var(--accent-color, #FF2E55)',
              boxShadow: '0 0 16px var(--accent-glow, rgba(255, 46, 85, 0.45))',
            }}
            title={isPlaying ? 'Pause' : 'Play'}
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <Pause className="w-5 h-5 fill-white" />
            ) : (
              <Play className="w-5 h-5 fill-white translate-x-0.5" />
            )}
          </button>
          <button
            onClick={nextTrack}
            className="text-[#EDEDED] hover:text-white p-1.5 rounded-full hover:bg-[#151515] transition-all duration-150 hover:scale-110 active:scale-90 cursor-pointer"
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
            <Repeat className="w-4 h-4" />
          </button>
        </div>

        {/* Volume */}
        <div className="w-full px-2">
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

export const NowPlayingDrawer: React.FC = () => {
  const isOpen = usePlayerStore((state) => state.isNowPlayingDrawerOpen);
  const currentTrack = usePlayerStore((state) => state.currentTrack);

  if (!isOpen || !currentTrack) return null;

  return <NowPlayingDrawerContent />;
};


import React, { useState, useEffect, useRef, useMemo, memo } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Heart,
  Disc,
  Mic2,
  Volume2,
  VolumeX,
  Sparkles,
  ChevronDown,
  ArrowUpRight,
  Check,
} from 'lucide-react';
import { usePlayerStore, getAudioElement } from '../stores/usePlayerStore';
import { useLibraryStore } from '../stores/useLibraryStore';
import { useSettingsStore } from '../stores/useSettingsStore';
import { FormatBadge } from './FormatBadge';
import { ProgressBar } from './ProgressBar';
import { LyricProviderOption } from '../../shared/types';
import { extractPaletteFromImage, getFallbackPalette, ExtractedPalette } from '../utils/colorExtractor';
import { processLyricsForKaraoke, getWordProgress, ProcessedKaraokeLine } from '../utils/karaokeEngine';
import { getAudioEnergy } from '../utils/audioReactivity';

/**
 * Isolated, high-performance Active Karaoke Line component
 * Runs local RAF loop ONLY for the currently singing line so parent CinemaMode never lags
 */
interface ActiveKaraokeLineProps {
  line: ProcessedKaraokeLine;
  accentColor: string;
  accentGlow: string;
  isPlaying: boolean;
}

const ActiveKaraokeLine: React.FC<ActiveKaraokeLineProps> = memo(
  ({ line, accentColor, accentGlow, isPlaying }) => {
    const [wordProgresses, setWordProgresses] = useState<number[]>(() =>
      line.words.map(() => 0)
    );
    const rafRef = useRef<number | null>(null);

    useEffect(() => {
      const audioEl = getAudioElement();
      if (!audioEl) return;

      const updateProgress = () => {
        const time = audioEl.currentTime;
        const newProgresses = line.words.map((w) => getWordProgress(w, time));
        setWordProgresses(newProgresses);

        if (isPlaying) {
          rafRef.current = requestAnimationFrame(updateProgress);
        }
      };

      rafRef.current = requestAnimationFrame(updateProgress);

      return () => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
      };
    }, [line, isPlaying]);

    return (
      <div className="flex flex-wrap items-baseline gap-y-1.5 py-1">
        {line.words.map((word, wIdx) => {
          if (word.isSpace) {
            return <span key={wIdx} className="inline-block whitespace-pre"> </span>;
          }

          const progress = wordProgresses[wIdx] ?? 0;
          const isFullySung = progress >= 1;
          const isCurrentlySinging = progress > 0 && progress < 1;

          return (
            <span
              key={wIdx}
              className="inline-block font-extrabold transition-transform duration-75 will-change-transform"
              style={{
                backgroundImage: `linear-gradient(90deg, ${accentColor} 0%, ${accentColor} ${
                  progress * 100
                }%, rgba(255, 255, 255, 0.28) ${
                  progress * 100
                }%, rgba(255, 255, 255, 0.28) 100%)`,
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                filter: isCurrentlySinging
                  ? `drop-shadow(0 0 14px ${accentGlow})`
                  : isFullySung
                  ? `drop-shadow(0 0 5px ${accentGlow})`
                  : 'none',
                transform: isCurrentlySinging ? 'scale(1.02)' : 'scale(1)',
              }}
            >
              {word.text}
            </span>
          );
        })}
      </div>
    );
  }
);

ActiveKaraokeLine.displayName = 'ActiveKaraokeLine';

export const CinemaMode: React.FC = () => {
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
    isCinemaModeOpen,
    lyrics,
    isLoadingLyrics,
    activeLyricProvider,
    togglePlay,
    seek,
    setVolume,
    toggleMute,
    nextTrack,
    previousTrack,
    toggleShuffle,
    toggleRepeatMode,
    setCinemaModeOpen,
    setLyricProvider,
  } = usePlayerStore();

  const { toggleFavorite } = useLibraryStore();
  const { settings } = useSettingsStore();

  const [isIdle, setIsIdle] = useState(false);
  const [isProviderMenuOpen, setIsProviderMenuOpen] = useState(false);

  // Dynamic Album-Art Color Palette State (with dual-buffer cross-fading for smooth transitions)
  const [currentPalette, setCurrentPalette] = useState<ExtractedPalette>(() =>
    getFallbackPalette(settings.accentColor)
  );
  const [targetPalette, setTargetPalette] = useState<ExtractedPalette>(() =>
    getFallbackPalette(settings.accentColor)
  );
  const [paletteTransitionProgress, setPaletteTransitionProgress] = useState(1);

  // Active line index in lyrics
  const [activeLineIndex, setActiveLineIndex] = useState(-1);

  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const activeLyricRef = useRef<HTMLDivElement | null>(null);
  const lyricsContainerRef = useRef<HTMLDivElement | null>(null);
  const providerMenuRef = useRef<HTMLDivElement | null>(null);

  // Pre-process synced lyrics into detailed syllable & word timing lines
  const processedLyrics: ProcessedKaraokeLine[] = useMemo(() => {
    return processLyricsForKaraoke(lyrics?.syncedLyrics || []);
  }, [lyrics?.syncedLyrics]);

  // 1. Dynamic Album-Art Color Palette Extraction
  useEffect(() => {
    let isCancelled = false;

    if (currentTrack?.artworkPath) {
      extractPaletteFromImage(currentTrack.artworkPath, settings.accentColor).then((palette) => {
        if (!isCancelled) {
          setTargetPalette(palette);
          setPaletteTransitionProgress(0);
        }
      });
    } else {
      const fallback = getFallbackPalette(settings.accentColor);
      setTargetPalette(fallback);
      setPaletteTransitionProgress(0);
    }

    return () => {
      isCancelled = true;
    };
  }, [currentTrack?.artworkPath, currentTrack?.id, settings.accentColor]);

  // 2. Smooth Color Palette Transition Animation (~900ms cross-fade)
  useEffect(() => {
    if (paletteTransitionProgress >= 1) return;

    let startTime: number | null = null;
    const duration = 900;

    const animatePalette = (now: number) => {
      if (!startTime) startTime = now;
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);

      setPaletteTransitionProgress(progress);

      if (progress >= 1) {
        setCurrentPalette(targetPalette);
      } else {
        requestAnimationFrame(animatePalette);
      }
    };

    const handle = requestAnimationFrame(animatePalette);
    return () => cancelAnimationFrame(handle);
  }, [paletteTransitionProgress, targetPalette]);

  // 3. Lightweight Active Line Tracker (Triggered on playback time update)
  useEffect(() => {
    if (!processedLyrics.length) {
      setActiveLineIndex(-1);
      return;
    }

    let newActiveIndex = -1;
    for (let i = processedLyrics.length - 1; i >= 0; i--) {
      if (currentTime >= processedLyrics[i].time - 0.25) {
        newActiveIndex = i;
        break;
      }
    }
    setActiveLineIndex(newActiveIndex);
  }, [currentTime, processedLyrics]);

  // Auto-scroll active lyric into center smoothly
  useEffect(() => {
    if (activeLyricRef.current && lyricsContainerRef.current) {
      activeLyricRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [activeLineIndex]);

  // Handle outside click for provider menu
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (providerMenuRef.current && !providerMenuRef.current.contains(e.target as Node)) {
        setIsProviderMenuOpen(false);
      }
    };
    if (isProviderMenuOpen) {
      window.addEventListener('mousedown', handleClickOutside);
    }
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [isProviderMenuOpen]);

  // Handle idle mouse fading
  const resetIdleTimer = () => {
    setIsIdle(false);
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      if (!isProviderMenuOpen) {
        setIsIdle(true);
      }
    }, 3500);
  };

  useEffect(() => {
    if (!isCinemaModeOpen) return;

    window.addEventListener('mousemove', resetIdleTimer);
    window.addEventListener('keydown', resetIdleTimer);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'F11') {
        if (isProviderMenuOpen) {
          setIsProviderMenuOpen(false);
        } else {
          setCinemaModeOpen(false);
        }
      } else if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    resetIdleTimer();

    return () => {
      window.removeEventListener('mousemove', resetIdleTimer);
      window.removeEventListener('keydown', resetIdleTimer);
      window.removeEventListener('keydown', handleKeyDown);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [isCinemaModeOpen, isProviderMenuOpen, togglePlay, setCinemaModeOpen]);

  if (!isCinemaModeOpen || !currentTrack) return null;

  const hasSyncedLyrics = Boolean(processedLyrics.length > 0);

  const providerOptions: { id: LyricProviderOption; label: string; icon: string }[] = [
    { id: 'auto', label: 'Auto (Smart Priority)', icon: '⚡' },
    { id: 'online', label: 'LRCLIB (Online Synced)', icon: '🌐' },
    { id: 'embedded', label: 'Embedded Audio Tag', icon: '🏷️' },
    { id: 'local', label: 'Local File (.lrc)', icon: '📁' },
  ];

  const activePalette = targetPalette;
  const accentColor = activePalette.accent;
  const accentGlow = activePalette.accentGlow;
  const { energy: ambientEnergy, frequencyBins } = getAudioEnergy(isPlaying, currentTime);

  return (
    <div
      style={{
        '--cinema-accent': accentColor,
        '--cinema-accent-glow': accentGlow,
        '--cinema-secondary': activePalette.secondary,
      } as React.CSSProperties}
      className="fixed inset-0 z-50 bg-[#050505] text-[#EDEDED] flex flex-col justify-between p-8 sm:p-10 select-none overflow-hidden animate-fadeIn"
    >
      {/* 1. Dynamic Multi-Point Ambient Atmosphere (Smoothly Cross-Faded, Zero Audio Interference) */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
        {/* Previous Palette (Cross-Fading Out) */}
        <div
          className="absolute inset-0 transition-opacity duration-1000 ease-out will-change-transform"
          style={{ opacity: 1 - paletteTransitionProgress }}
        >
          <div
            className="absolute -top-1/4 -left-1/4 w-[75vw] h-[75vw] rounded-full filter blur-[120px] transition-transform duration-700"
            style={{
              backgroundColor: currentPalette.dominant,
              opacity: 0.32 + ambientEnergy * 0.08,
              transform: `scale(${1 + ambientEnergy * 0.04})`,
            }}
          />
          <div
            className="absolute -bottom-1/4 -right-1/4 w-[55vw] h-[55vw] rounded-full filter blur-[140px] transition-transform duration-700"
            style={{
              backgroundColor: currentPalette.secondary,
              opacity: 0.26 + ambientEnergy * 0.08,
              transform: `scale(${1 + ambientEnergy * 0.05})`,
            }}
          />
        </div>

        {/* Target Palette (Cross-Fading In) */}
        <div
          className="absolute inset-0 transition-opacity duration-1000 ease-out will-change-transform"
          style={{ opacity: paletteTransitionProgress }}
        >
          <div
            className="absolute -top-1/4 -left-1/4 w-[75vw] h-[75vw] rounded-full filter blur-[120px] transition-transform duration-700"
            style={{
              backgroundColor: targetPalette.dominant,
              opacity: 0.36 + ambientEnergy * 0.08,
              transform: `scale(${1 + ambientEnergy * 0.04})`,
            }}
          />
          <div
            className="absolute -bottom-1/4 -right-1/4 w-[55vw] h-[55vw] rounded-full filter blur-[140px] transition-transform duration-700"
            style={{
              backgroundColor: targetPalette.secondary,
              opacity: 0.28 + ambientEnergy * 0.08,
              transform: `scale(${1 + ambientEnergy * 0.05})`,
            }}
          />
          <div
            className="absolute top-1/2 left-1/3 -translate-x-1/2 -translate-y-1/2 w-[45vw] h-[45vw] rounded-full filter blur-[150px] opacity-15"
            style={{ backgroundColor: targetPalette.accent }}
          />
        </div>

        {/* Deep Contrast Scrim for Maximum Text Readability */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#050505]/75 via-[#050505]/35 to-[#050505]/85" />
      </div>

      {/* 2. Top Navigation Bar */}
      <header
        className={`relative z-20 flex items-center justify-between transition-opacity duration-500 ${
          isIdle ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white shadow-md font-black text-xs transition-colors duration-700"
            style={{
              backgroundColor: accentColor,
              boxShadow: `0 0 16px ${accentGlow}`,
            }}
          >
            M
          </div>
          <div>
            <h1 className="text-xs font-bold text-white tracking-wider font-mono uppercase">
              CINEMA NOW PLAYING
            </h1>
            <p className="text-[10px] text-[#A3A3A3]">Press ESC or click icon to exit</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <FormatBadge format={audioFormat} codec={currentTrack.codec} />
          <button
            onClick={() => setCinemaModeOpen(false)}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-[#141416]/80 hover:bg-[#202025] border border-[#282830] text-xs text-white font-medium transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer backdrop-blur-md"
            title="Exit Cinema Mode (Esc)"
          >
            <ArrowUpRight className="w-4 h-4 text-[#A3A3A3]" />
            <span>Exit Cinema</span>
            <kbd className="text-[9px] font-mono bg-[#222228] px-1.5 py-0.5 rounded text-[#888888]">ESC</kbd>
          </button>
        </div>
      </header>

      {/* 3. Main Center: Artwork & Controls (Left) + Living Karaoke Lyrics (Right) */}
      <main className="relative z-10 flex-1 grid grid-cols-1 md:grid-cols-12 gap-12 lg:gap-16 items-center max-w-7xl mx-auto w-full my-auto px-4 overflow-hidden">
        {/* Left Column: Artwork, Metadata, Controls */}
        <section className="md:col-span-5 flex flex-col items-center md:items-start gap-6 max-w-md mx-auto w-full">
          <div className="relative group">
            <div
              className="w-72 h-72 sm:w-80 sm:h-80 rounded-3xl overflow-hidden bg-[#0A0A0A] border border-[#262626] relative transition-all duration-500 group-hover:scale-102"
              style={{
                boxShadow: `0 25px 50px -12px rgba(0, 0, 0, 0.9), 0 0 35px ${accentGlow}`,
              }}
            >
              {currentTrack.artworkPath ? (
                <img
                  src={currentTrack.artworkPath}
                  alt={currentTrack.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-[#151515] to-[#0A0A0A]">
                  <Disc
                    className="w-24 h-24 opacity-80 animate-spin-slow transition-colors duration-700"
                    style={{ color: accentColor }}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Track Meta & Favorite */}
          <div className="w-full flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight truncate">
                {currentTrack.title}
              </h2>
              <p className="text-base text-[#C0C0C0] font-medium truncate mt-0.5">
                {currentTrack.artist}
              </p>
              <p className="text-xs text-[#777777] truncate mt-0.5 font-mono">
                {currentTrack.album}
              </p>
            </div>
            <button
              onClick={() => toggleFavorite(currentTrack.id)}
              className="p-3 rounded-2xl bg-[#141416]/80 hover:bg-[#1E1E22] border border-[#262626] transition-all duration-200 active:scale-125 cursor-pointer group"
              title="Favorite"
            >
              <Heart
                className={`w-6 h-6 transition-all duration-200 ${
                  currentTrack.isFavorite ? 'scale-110' : 'group-hover:scale-110 text-[#666666]'
                }`}
                style={
                  currentTrack.isFavorite
                    ? { fill: accentColor, color: accentColor }
                    : undefined
                }
              />
            </button>
          </div>

          {/* Seekbar */}
          <div className="w-full">
            <ProgressBar currentTime={currentTime} duration={duration} onSeek={seek} />
          </div>

          {/* Controls */}
          <div className="w-full flex flex-col gap-4">
            <div className="flex items-center justify-between w-full">
              <button
                onClick={toggleShuffle}
                className="p-2.5 rounded-full transition-all duration-200 hover:scale-110 active:scale-90 cursor-pointer"
                style={
                  isShuffle
                    ? {
                        color: accentColor,
                        backgroundColor: `${accentColor}22`,
                      }
                    : { color: '#666666' }
                }
                title="Shuffle"
              >
                <Shuffle className="w-5 h-5" />
              </button>

              <button
                onClick={previousTrack}
                className="text-[#EDEDED] hover:text-white p-2.5 rounded-full hover:bg-[#151515] transition-all duration-150 hover:scale-110 active:scale-90 cursor-pointer"
                title="Previous"
              >
                <SkipBack className="w-6 h-6" />
              </button>

              <button
                onClick={togglePlay}
                className="w-14 h-14 rounded-full flex items-center justify-center text-white transition-all duration-200 hover:scale-108 active:scale-95 cursor-pointer shadow-2xl"
                style={{
                  backgroundColor: accentColor,
                  boxShadow: `0 0 24px ${accentGlow}`,
                }}
                title={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? (
                  <Pause className="w-6 h-6 fill-white" />
                ) : (
                  <Play className="w-6 h-6 fill-white translate-x-0.5" />
                )}
              </button>

              <button
                onClick={nextTrack}
                className="text-[#EDEDED] hover:text-white p-2.5 rounded-full hover:bg-[#151515] transition-all duration-150 hover:scale-110 active:scale-90 cursor-pointer"
                title="Next"
              >
                <SkipForward className="w-6 h-6" />
              </button>

              <button
                onClick={toggleRepeatMode}
                className="p-2.5 rounded-full transition-all duration-200 hover:scale-110 active:scale-90 cursor-pointer"
                style={
                  repeatMode !== 'off'
                    ? {
                        color: accentColor,
                        backgroundColor: `${accentColor}22`,
                      }
                    : { color: '#666666' }
                }
                title={`Repeat: ${repeatMode}`}
              >
                <Repeat className="w-5 h-5" />
              </button>
            </div>

            {/* Volume Slider */}
            <div className="flex items-center gap-3 w-full bg-[#121214]/60 border border-[#202022] rounded-xl px-4 py-2 backdrop-blur-md">
              <button
                onClick={toggleMute}
                className="text-[#A3A3A3] hover:text-white transition-colors cursor-pointer"
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="w-4 h-4" style={{ color: accentColor }} />
                ) : (
                  <Volume2 className="w-4 h-4" />
                )}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={isMuted ? 0 : volume}
                onChange={(e) => setVolume(parseFloat(e.target.value))}
                style={{ accentColor }}
                className="flex-1 h-1.5 bg-[#252528] rounded-lg appearance-none cursor-pointer"
              />
              <span className="text-[10px] font-mono text-[#888888] w-8 text-right">
                {isMuted ? '0%' : `${Math.round(volume * 100)}%`}
              </span>
            </div>
          </div>
        </section>

        {/* Right Column: Seamless Unboxed Progressive Karaoke Typography */}
        <section className="md:col-span-7 h-[500px] sm:h-[560px] flex flex-col relative overflow-visible select-none">
          {/* Top Info & Provider Pill */}
          <div className="flex items-center justify-between pb-4 mb-2 relative z-20">
            <div className="flex items-center gap-2.5">
              <span
                className="w-2 h-2 rounded-full animate-pulse"
                style={{
                  backgroundColor: accentColor,
                  boxShadow: `0 0 10px ${accentGlow}`,
                }}
              />
              <span className="text-[11px] font-bold font-mono uppercase tracking-[0.2em] text-[#9A9AA5]">
                LIVE SYNCHRONIZED LYRICS
              </span>
            </div>

            {/* Interactive Lyric Provider Selector Pill */}
            <div className="relative" ref={providerMenuRef}>
              <button
                onClick={() => setIsProviderMenuOpen(!isProviderMenuOpen)}
                className="text-[10px] font-mono tracking-wider text-[#9A9AA5] hover:text-white bg-[#141418]/80 hover:bg-[#202026] px-3 py-1 rounded-full border border-[#262630] uppercase flex items-center gap-1.5 transition-all duration-150 cursor-pointer backdrop-blur-md shadow-sm active:scale-95"
                title="Change Lyrics Provider"
              >
                <span>
                  SOURCE:{' '}
                  {activeLyricProvider !== 'auto'
                    ? activeLyricProvider.toUpperCase()
                    : lyrics?.source
                    ? lyrics.source.toUpperCase()
                    : 'AUTO'}
                </span>
                <ChevronDown
                  className={`w-3 h-3 text-[#666675] transition-transform duration-200 ${
                    isProviderMenuOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {/* Dropdown Menu */}
              {isProviderMenuOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-[#101014]/95 border border-[#262632] rounded-2xl shadow-2xl py-2 z-50 animate-fadeIn backdrop-blur-2xl">
                  <div className="px-3.5 py-1 text-[9px] font-mono font-semibold text-[#666675] uppercase tracking-wider border-b border-[#1E1E28] mb-1.5">
                    Select Lyric Source
                  </div>
                  {providerOptions.map((prov) => {
                    const isSelected = activeLyricProvider === prov.id;
                    const isDetected =
                      prov.id === 'auto' ||
                      lyrics?.source === prov.id ||
                      lyrics?.availableSources?.includes(prov.id as any);

                    return (
                      <button
                        key={prov.id}
                        onClick={() => {
                          setLyricProvider(prov.id);
                          setIsProviderMenuOpen(false);
                        }}
                        className={`w-full px-3.5 py-2 text-left text-xs flex items-center justify-between transition-colors cursor-pointer ${
                          isSelected
                            ? 'text-white font-bold bg-[#1E1E28]'
                            : 'text-[#9595A5] hover:text-white hover:bg-[#161620]'
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <span>{prov.icon}</span>
                          <span className="truncate">{prov.label}</span>
                        </div>
                        {isSelected ? (
                          <Check className="w-3.5 h-3.5 shrink-0" style={{ color: accentColor }} />
                        ) : isDetected ? (
                          <span className="w-1.5 h-1.5 rounded-full bg-[#5FE39A] shrink-0" title="Detected for this song" />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* True Progressive Karaoke Typography List */}
          <div
            ref={lyricsContainerRef}
            className="flex-1 overflow-y-auto pr-4 flex flex-col gap-7 text-left no-scrollbar mask-gradient relative z-10 py-6"
          >
            {isLoadingLyrics ? (
              <div className="h-full flex flex-col items-center justify-center gap-3 text-sm text-[#777785] animate-pulse">
                <Sparkles className="w-6 h-6 animate-spin-slow" style={{ color: accentColor }} />
                <span>Loading synchronized lyrics...</span>
              </div>
            ) : hasSyncedLyrics ? (
              processedLyrics.map((line, idx) => {
                const isActive = idx === activeLineIndex;
                const isPast = activeLineIndex !== -1 && idx < activeLineIndex;

                return (
                  <div
                    key={line.id}
                    ref={isActive ? activeLyricRef : null}
                    onClick={() => seek(line.time)}
                    className={`transition-all duration-300 cursor-pointer select-none text-left leading-snug ${
                      isActive
                        ? 'text-3xl sm:text-4xl py-2 scale-[1.01]'
                        : isPast
                        ? 'text-xl sm:text-2xl font-bold text-[#353540] hover:text-[#555562] py-1'
                        : 'text-xl sm:text-2xl font-bold text-[#686875] hover:text-[#EDEDED] hover:scale-[1.01] py-1'
                    }`}
                  >
                    {isActive ? (
                      /* Active Karaoke Line (Isolated Local High-Frequency Animation) */
                      <ActiveKaraokeLine
                        line={line}
                        accentColor={accentColor}
                        accentGlow={accentGlow}
                        isPlaying={isPlaying}
                      />
                    ) : (
                      /* Inactive Lines */
                      <span>{line.text || '♪'}</span>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="h-full flex flex-col items-center justify-center gap-4 text-sm text-[#777785] px-6 text-center">
                <Mic2 className="w-8 h-8 opacity-30 text-[#A3A3A3]" />
                <p className="max-w-md font-medium leading-relaxed whitespace-pre-line text-[#888895]">
                  {lyrics?.plainLyrics || 'No lyrics found for this track.'}
                </p>
              </div>
            )}
          </div>
        </section>
      </main>

      {/* 4. Bottom Bar: Audio Spectrum Waveform + Subtext */}
      <footer
        className={`relative z-10 flex items-center justify-between transition-opacity duration-500 ${
          isIdle ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}
      >
        <div className="flex items-end gap-1 h-5 px-2" title="Audio Spectrum">
          {frequencyBins.map((bin, bIdx) => {
            const minHeight = 4;
            const dynamicHeight = Math.max(minHeight, Math.round(bin * 18 + 4));
            return (
              <span
                key={bIdx}
                className="w-1 rounded-full transition-all duration-75"
                style={{
                  height: `${dynamicHeight}px`,
                  backgroundColor: accentColor,
                  boxShadow: `0 0 8px ${accentGlow}`,
                }}
              />
            );
          })}
        </div>

        <span className="text-[11px] text-[#666670] font-mono text-center flex-1 pr-12">
          MaJa Cinema Engine • Click any lyric line to jump directly
        </span>
      </footer>
    </div>
  );
};

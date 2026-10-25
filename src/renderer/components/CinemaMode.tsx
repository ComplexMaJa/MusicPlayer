import React, { useState, useEffect, useRef, useMemo, memo, useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
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
import { CinemaVisualizer } from './CinemaVisualizer';
import { InstrumentalDots } from './InstrumentalDots';
import { LyricProviderOption } from '../../shared/types';
import { extractPaletteFromImage, getFallbackPalette, ExtractedPalette } from '../utils/colorExtractor';
import {
  processLyricsForKaraoke,
  findActiveLineIndex,
  getWordProgress,
  getInstrumentalSegment,
  isInstrumentalLine,
  InstrumentalSegment,
  ProcessedKaraokeLine,
} from '../utils/karaokeEngine';

/**
 * Isolated High-Performance Seekbar for Cinema Mode
 * Tracks time smoothly without forcing parent CinemaMode re-renders
 */
const CinemaProgressBar: React.FC<{ duration: number; onSeek: (seconds: number) => void }> = memo(
  ({ duration, onSeek }) => {
    const [currentTime, setCurrentTime] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const [dragValue, setDragValue] = useState(0);
    const lastRenderedTime = useRef(0);

    useEffect(() => {
      let rafId: number;
      const tick = () => {
        const audioEl = getAudioElement();
        if (audioEl && !isDragging) {
          const nextTime = audioEl.currentTime;
          // The visual bar only needs a fraction of the display refresh rate.
          if (Math.abs(nextTime - lastRenderedTime.current) >= 0.05) {
            lastRenderedTime.current = nextTime;
            setCurrentTime(nextTime);
          }
        }
        rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(rafId);
    }, [isDragging]);

    const displayTime = isDragging ? dragValue : currentTime;
    const percentage = duration > 0 ? (displayTime / duration) * 100 : 0;

    const formatTime = (secs: number) => {
      if (!secs || isNaN(secs)) return '0:00';
      const m = Math.floor(secs / 60);
      const s = Math.floor(secs % 60);
      return `${m}:${s < 10 ? '0' : ''}${s}`;
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const pct = parseFloat(e.target.value);
      const targetSeconds = (pct / 100) * duration;
      setDragValue(targetSeconds);
      if (!isDragging) {
        onSeek(targetSeconds);
      }
    };

    const handleMouseDown = () => setIsDragging(true);

    const handleMouseUp = (e: React.MouseEvent<HTMLInputElement>) => {
      const targetSeconds = (parseFloat(e.currentTarget.value) / 100) * duration;
      onSeek(targetSeconds);
      setIsDragging(false);
    };

    return (
      <div className="flex items-center gap-3 w-full text-xs font-mono text-[#888888]">
        <span className="w-9 text-right shrink-0 select-none">{formatTime(displayTime)}</span>
        <div className="relative flex-1 flex items-center h-4 group cursor-pointer">
          <div className="w-full h-1 group-hover:h-1.5 bg-[#1A1A1E] rounded-full overflow-hidden transition-all duration-150">
            <div
              className="h-full transition-all duration-75 will-change-transform"
              style={{
                width: `${Math.min(100, Math.max(0, percentage))}%`,
                backgroundColor: 'var(--cinema-accent, #FF2E55)',
                boxShadow: '0 0 12px var(--cinema-accent-glow, rgba(255, 46, 85, 0.45))',
              }}
            />
          </div>
          <input
            type="range"
            min="0"
            max="100"
            step="0.01"
            value={percentage || 0}
            aria-label="Seek playback position"
            aria-valuetext={`${formatTime(displayTime)} of ${formatTime(duration)}`}
            onMouseDown={handleMouseDown}
            onTouchStart={handleMouseDown}
            onChange={handleChange}
            onMouseUp={handleMouseUp}
            onTouchEnd={handleMouseUp as any}
            className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
          />
        </div>
        <span className="w-9 shrink-0 select-none">{formatTime(duration)}</span>
      </div>
    );
  }
);
CinemaProgressBar.displayName = 'CinemaProgressBar';

/**
 * Ultra-performance Active Karaoke Line with Direct GPU / Style Synchronizer
 * Zero React render lag, sub-frame progressive gradient filling with minimal paint overhead
 */
interface ActiveKaraokeLineProps {
  line: ProcessedKaraokeLine;
  accentColor: string;
  accentGlow: string;
  isPlaying: boolean;
}

const ActiveKaraokeLine: React.FC<ActiveKaraokeLineProps> = memo(
  ({ line, accentColor, accentGlow, isPlaying }) => {
    const wordRefs = useRef<(HTMLSpanElement | null)[]>([]);
    const lastProgressRef = useRef<number[]>([]);

    const updateWordsDirectly = useCallback(() => {
      const audioEl = getAudioElement();
      if (!audioEl) return;
      const now = audioEl.currentTime;

      line.words.forEach((word, wIdx) => {
        const el = wordRefs.current[wIdx];
        if (!el || word.isSpace) return;

        const progress = getWordProgress(word, now);
        const prevProg = lastProgressRef.current[wIdx] ?? -1;

        // Skip DOM manipulation if percentage difference is negligible (< 0.4%)
        if (Math.abs(progress - prevProg) < 0.004 && progress > 0 && progress < 1) {
          return;
        }
        lastProgressRef.current[wIdx] = progress;

        const percent = Math.round(progress * 1000) / 10; // e.g. 73.4%

        el.style.backgroundImage = `linear-gradient(90deg, ${accentColor} 0%, ${accentColor} ${percent}%, rgba(255, 255, 255, 0.28) ${percent}%, rgba(255, 255, 255, 0.28) 100%)`;

        // GPU-friendly soft glow via text-shadow instead of expensive drop-shadow filters
        if (progress > 0.08 && progress < 0.95) {
          el.style.textShadow = `0 0 14px ${accentGlow}`;
        } else if (progress >= 0.95) {
          el.style.textShadow = `0 0 6px ${accentGlow}`;
        } else {
          el.style.textShadow = 'none';
        }
      });
    }, [line, accentColor, accentGlow]);

    useEffect(() => {
      let rafId: number;

      const loop = () => {
        updateWordsDirectly();
        if (isPlaying) {
          rafId = requestAnimationFrame(loop);
        }
      };

      updateWordsDirectly();
      rafId = requestAnimationFrame(loop);

      return () => {
        if (rafId) cancelAnimationFrame(rafId);
      };
    }, [updateWordsDirectly, isPlaying]);

    return (
      <div className="flex flex-wrap items-baseline gap-y-1.5 py-1 text-left select-none">
        {line.words.map((word, wIdx) => {
          if (word.isSpace) {
            return <span key={wIdx} className="inline-block whitespace-pre"> </span>;
          }

          return (
            <span
              key={wIdx}
              ref={(el) => {
                wordRefs.current[wIdx] = el;
              }}
              className="inline-block font-extrabold will-change-[background-image,text-shadow] transition-all duration-75"
              style={{
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundImage: `linear-gradient(90deg, ${accentColor} 0%, ${accentColor} 0%, rgba(255, 255, 255, 0.28) 0%, rgba(255, 255, 255, 0.28) 100%)`,
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

/**
 * Memoized Individual Karaoke Line Row
 * Uses CSS containment to avoid triggering reflows of the entire lyrics list
 */
interface KaraokeLineItemProps {
  line: ProcessedKaraokeLine;
  isActive: boolean;
  isPast: boolean;
  accentColor: string;
  accentGlow: string;
  isPlaying: boolean;
  onSeek: (time: number) => void;
  activeRef?: React.RefObject<HTMLDivElement | null>;
}

const KaraokeLineItem: React.FC<KaraokeLineItemProps> = memo(
  ({ line, isActive, isPast, accentColor, accentGlow, isPlaying, onSeek, activeRef }) => {
    const instrumental = isInstrumentalLine(line.text);

    return (
      <div
        ref={isActive ? activeRef : null}
        onClick={() => onSeek(line.time)}
        className={`lyric-item-containment cursor-pointer select-none text-left leading-snug origin-left transition-all duration-200 ${
          isActive
            ? 'text-3xl sm:text-4xl py-2 font-extrabold'
            : isPast
            ? 'text-xl sm:text-2xl font-bold text-[#353540] hover:text-[#555565] py-1'
            : 'text-xl sm:text-2xl font-bold text-[#686878] hover:text-[#EDEDED] py-1'
        }`}
      >
        {instrumental ? (
          <InstrumentalDots
            active={isActive}
            isPlaying={isPlaying}
            accentColor={accentColor}
          />
        ) : isActive ? (
          <ActiveKaraokeLine
            line={line}
            accentColor={accentColor}
            accentGlow={accentGlow}
            isPlaying={isPlaying}
          />
        ) : (
          <span>{line.text}</span>
        )}
      </div>
    );
  }
);
KaraokeLineItem.displayName = 'KaraokeLineItem';

export const CinemaMode: React.FC = () => {
  const {
    currentTrack,
    isPlaying,
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
  } = usePlayerStore(
    useShallow((state) => ({
      currentTrack: state.currentTrack,
      isPlaying: state.isPlaying,
      duration: state.duration,
      volume: state.volume,
      isMuted: state.isMuted,
      isShuffle: state.isShuffle,
      repeatMode: state.repeatMode,
      audioFormat: state.audioFormat,
      isCinemaModeOpen: state.isCinemaModeOpen,
      lyrics: state.lyrics,
      isLoadingLyrics: state.isLoadingLyrics,
      activeLyricProvider: state.activeLyricProvider,
      togglePlay: state.togglePlay,
      seek: state.seek,
      setVolume: state.setVolume,
      toggleMute: state.toggleMute,
      nextTrack: state.nextTrack,
      previousTrack: state.previousTrack,
      toggleShuffle: state.toggleShuffle,
      toggleRepeatMode: state.toggleRepeatMode,
      setCinemaModeOpen: state.setCinemaModeOpen,
      setLyricProvider: state.setLyricProvider,
    }))
  );

  const toggleFavorite = useLibraryStore((state) => state.toggleFavorite);
  const settings = useSettingsStore((state) => state.settings);

  const [isIdle, setIsIdle] = useState(false);
  const [isProviderMenuOpen, setIsProviderMenuOpen] = useState(false);

  // Dynamic Album-Art Color Palette
  const [palette, setPalette] = useState<ExtractedPalette>(() =>
    getFallbackPalette(settings.accentColor)
  );

  // High-precision active lyric line derived directly from audio clock
  const [activeLineIndex, setActiveLineIndex] = useState(-1);
  const activeLineIndexRef = useRef(-1);
  const [instrumentalBreak, setInstrumentalBreak] = useState<InstrumentalSegment | null>(null);
  const instrumentalBreakRef = useRef<string | null>(null);

  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const activeLyricRef = useRef<HTMLDivElement | null>(null);
  const lyricsContainerRef = useRef<HTMLDivElement | null>(null);
  const providerMenuRef = useRef<HTMLDivElement | null>(null);
  const isUserScrollingRef = useRef(false);
  const userScrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Pre-process synced lyrics into detailed syllable & word timing lines
  const processedLyrics: ProcessedKaraokeLine[] = useMemo(() => {
    return processLyricsForKaraoke(lyrics?.syncedLyrics || []);
  }, [lyrics?.syncedLyrics]);

  // 1. Dynamic Album-Art Color Palette Extraction
  useEffect(() => {
    if (!isCinemaModeOpen) return;

    let isCancelled = false;

    if (currentTrack?.artworkPath) {
      extractPaletteFromImage(currentTrack.artworkPath, settings.accentColor).then((newPalette) => {
        if (!isCancelled) {
          setPalette(newPalette);
        }
      });
    } else {
      setPalette(getFallbackPalette(settings.accentColor));
    }

    return () => {
      isCancelled = true;
    };
  }, [isCinemaModeOpen, currentTrack?.artworkPath, currentTrack?.id, settings.accentColor]);

  // 2. High-Frequency Audio Clock Check for Instant, Zero-Lag Line Transitions
  useEffect(() => {
    if (!isCinemaModeOpen || processedLyrics.length === 0) {
      setActiveLineIndex(-1);
      activeLineIndexRef.current = -1;
      setInstrumentalBreak(null);
      instrumentalBreakRef.current = null;
      return;
    }

    const audioEl = getAudioElement();
    if (!audioEl) return;

    let rafId: number;

    const checkAudioTime = () => {
      const time = audioEl.currentTime;
      const idx = findActiveLineIndex(processedLyrics, time);

      if (idx !== activeLineIndexRef.current) {
        activeLineIndexRef.current = idx;
        setActiveLineIndex(idx);
      }

      const totalDuration =
        Number.isFinite(audioEl.duration) && audioEl.duration > 0 ? audioEl.duration : duration;
      const segment = getInstrumentalSegment(processedLyrics, time, totalDuration);
      const segmentKey = segment ? `${segment.start}:${segment.end}` : null;

      if (segmentKey !== instrumentalBreakRef.current) {
        instrumentalBreakRef.current = segmentKey;
        setInstrumentalBreak(segment);
      }

      if (isPlaying) {
        rafId = requestAnimationFrame(checkAudioTime);
      }
    };

    checkAudioTime();

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [duration, isCinemaModeOpen, isPlaying, processedLyrics]);

  // 3. Ultra-smooth Auto-scrolling (with Manual Scroll Detection & Suppression)
  useEffect(() => {
    if (isUserScrollingRef.current) return;

    const container = lyricsContainerRef.current;
    const activeEl = activeLyricRef.current;

    if (activeEl && container) {
      const containerHeight = container.clientHeight;
      const activeOffsetTop = activeEl.offsetTop;
      const activeHeight = activeEl.clientHeight;

      const targetScroll = activeOffsetTop - containerHeight / 2 + activeHeight / 2;

      container.scrollTo({
        top: Math.max(0, targetScroll),
        behavior: 'smooth',
      });
    }
  }, [activeLineIndex]);

  // Listen to manual scrolling to temporarily pause auto-scroll
  const handleLyricsScroll = useCallback(() => {
    isUserScrollingRef.current = true;
    if (userScrollTimeoutRef.current) clearTimeout(userScrollTimeoutRef.current);
    userScrollTimeoutRef.current = setTimeout(() => {
      isUserScrollingRef.current = false;
    }, 2800);
  }, []);

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
  const resetIdleTimer = useCallback(() => {
    setIsIdle(false);
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      if (!isProviderMenuOpen) {
        setIsIdle(true);
      }
    }, 3500);
  }, [isProviderMenuOpen]);

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
        return;
      }

      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, button, [contenteditable="true"]')) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'ArrowRight') {
        const audioEl = getAudioElement();
        if (audioEl) seek(audioEl.currentTime + 5);
      } else if (e.key === 'ArrowLeft') {
        const audioEl = getAudioElement();
        if (audioEl) seek(audioEl.currentTime - 5);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setVolume(Math.min(1, volume + 0.05));
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setVolume(Math.max(0, volume - 0.05));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    resetIdleTimer();

    return () => {
      window.removeEventListener('mousemove', resetIdleTimer);
      window.removeEventListener('keydown', resetIdleTimer);
      window.removeEventListener('keydown', handleKeyDown);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      if (userScrollTimeoutRef.current) clearTimeout(userScrollTimeoutRef.current);
    };
  }, [isCinemaModeOpen, isProviderMenuOpen, togglePlay, seek, setVolume, volume, setCinemaModeOpen, resetIdleTimer]);

  if (!isCinemaModeOpen || !currentTrack) return null;

  const hasSyncedLyrics = Boolean(processedLyrics.length > 0);
  const activeLine = activeLineIndex >= 0 ? processedLyrics[activeLineIndex] : null;
  const showGapDots = Boolean(
    instrumentalBreak && (!activeLine || !isInstrumentalLine(activeLine.text))
  );

  const providerOptions: { id: LyricProviderOption; label: string; icon: string }[] = [
    { id: 'auto', label: 'Auto (Smart Priority)', icon: '⚡' },
    { id: 'online', label: 'LRCLIB (Online Synced)', icon: '🌐' },
    { id: 'embedded', label: 'Embedded Audio Tag', icon: '🏷️' },
    { id: 'local', label: 'Local File (.lrc)', icon: '📁' },
  ];

  const accentColor = palette.accent;
  const accentGlow = palette.accentGlow;

  return (
    <div
      style={{
        '--cinema-accent': accentColor,
        '--cinema-accent-glow': accentGlow,
        '--cinema-secondary': palette.secondary,
      } as React.CSSProperties}
      className="cinema-overlay fixed inset-0 z-50 bg-[#050505] text-[#EDEDED] flex flex-col justify-between p-8 sm:p-10 select-none overflow-hidden animate-fadeIn"
    >
      {/* 1. Dynamic GPU Hardware-Accelerated Ambient Atmosphere */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0 contain-render">
        <div
          className="absolute -top-1/4 -left-1/4 w-[75vw] h-[75vw] rounded-full blur-[100px] gpu-layer animate-cinema-breath-1 transition-colors duration-1000"
          style={{
            backgroundColor: palette.dominant,
          }}
        />
        <div
          className="absolute -bottom-1/4 -right-1/4 w-[60vw] h-[60vw] rounded-full blur-[120px] gpu-layer animate-cinema-breath-2 transition-colors duration-1000"
          style={{
            backgroundColor: palette.secondary,
          }}
        />
        <div
          className="absolute top-1/2 left-1/3 -translate-x-1/2 -translate-y-1/2 w-[45vw] h-[45vw] rounded-full blur-[140px] opacity-15 gpu-layer transition-colors duration-1000"
          style={{ backgroundColor: palette.accent }}
        />
        {/* Deep Contrast Scrim for Maximum Text Readability */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#050505]/75 via-[#050505]/35 to-[#050505]/85" />
      </div>

      {/* 2. Top Navigation Bar */}
      <header
        className={`relative z-20 flex items-center justify-between transition-opacity duration-300 ${
          isIdle ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white shadow-md font-black text-xs transition-colors duration-500"
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
          <FormatBadge
            format={audioFormat}
            codec={currentTrack.codec}
            sampleRate={currentTrack.sampleRate}
            bitDepth={currentTrack.bitDepth}
          />
          <button
            onClick={() => setCinemaModeOpen(false)}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-[#141416]/80 hover:bg-[#202025] border border-[#282830] text-xs text-white font-medium transition-all duration-150 hover:scale-105 active:scale-95 cursor-pointer backdrop-blur-md"
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
              className="w-72 h-72 sm:w-80 sm:h-80 rounded-3xl overflow-hidden bg-[#0A0A0A] border border-[#262626] relative transition-all duration-300 group-hover:scale-102 gpu-layer"
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
                    className="w-24 h-24 opacity-80 animate-spin-slow transition-colors duration-500"
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
              className="p-3 rounded-2xl bg-[#141416]/80 hover:bg-[#1E1E22] border border-[#262626] transition-all duration-150 active:scale-125 cursor-pointer group"
              title="Favorite"
              aria-label={currentTrack.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
            >
              <Heart
                className={`w-6 h-6 transition-all duration-150 ${
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

          {/* Isolated High-Performance Seekbar */}
          <div className="w-full">
            <CinemaProgressBar duration={duration} onSeek={seek} />
          </div>

          {/* Controls */}
          <div className="w-full flex flex-col gap-4">
            <div className="flex items-center justify-between w-full">
              <button
                onClick={toggleShuffle}
                className="p-2.5 rounded-full transition-all duration-150 hover:scale-110 active:scale-90 cursor-pointer"
                style={
                  isShuffle
                    ? {
                        color: accentColor,
                        backgroundColor: `${accentColor}22`,
                      }
                    : { color: '#666666' }
                }
                title="Shuffle"
                aria-label={isShuffle ? 'Disable shuffle' : 'Enable shuffle'}
              >
                <Shuffle className="w-5 h-5" />
              </button>

              <button
                onClick={previousTrack}
                className="text-[#EDEDED] hover:text-white p-2.5 rounded-full hover:bg-[#151515] transition-all duration-150 hover:scale-110 active:scale-90 cursor-pointer"
                title="Previous (Left Arrow)"
                aria-label="Previous track"
              >
                <SkipBack className="w-6 h-6" />
              </button>

              <button
                onClick={togglePlay}
                className="w-14 h-14 rounded-full flex items-center justify-center text-white transition-all duration-150 hover:scale-108 active:scale-95 cursor-pointer shadow-2xl"
                style={{
                  backgroundColor: accentColor,
                  boxShadow: `0 0 24px ${accentGlow}`,
                }}
                title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
                aria-label={isPlaying ? 'Pause' : 'Play'}
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
                title="Next (Right Arrow)"
                aria-label="Next track"
              >
                <SkipForward className="w-6 h-6" />
              </button>

              <button
                onClick={toggleRepeatMode}
                className="p-2.5 rounded-full transition-all duration-150 hover:scale-110 active:scale-90 cursor-pointer"
                style={
                  repeatMode !== 'off'
                    ? {
                        color: accentColor,
                        backgroundColor: `${accentColor}22`,
                      }
                    : { color: '#666666' }
                }
                title={`Repeat: ${repeatMode}`}
                aria-label={`Repeat mode: ${repeatMode}`}
              >
                <Repeat className="w-5 h-5" />
              </button>
            </div>

            {/* Volume Slider */}
            <div className="flex items-center gap-3 w-full bg-[#121214]/60 border border-[#202022] rounded-xl px-4 py-2 backdrop-blur-md">
              <button
                onClick={toggleMute}
                className="text-[#A3A3A3] hover:text-white transition-colors cursor-pointer"
                aria-label={isMuted ? 'Unmute' : 'Mute'}
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
          <div className="flex items-center justify-between pb-4 mb-2 relative z-20 px-6 sm:px-8">
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
            onScroll={handleLyricsScroll}
            className="flex-1 overflow-y-auto px-6 sm:px-8 flex flex-col gap-7 text-left no-scrollbar mask-gradient relative z-10 py-6 will-change-scroll gpu-layer"
          >
            {isLoadingLyrics ? (
              <div className="h-full flex flex-col items-center justify-center gap-3 text-sm text-[#777785] animate-pulse">
                <Sparkles className="w-6 h-6 animate-spin-slow" style={{ color: accentColor }} />
                <span>Loading synchronized lyrics...</span>
              </div>
            ) : hasSyncedLyrics ? (
              <>
                {showGapDots && activeLineIndex === -1 && (
                  <div className="py-1">
                    <InstrumentalDots
                      active
                      isPlaying={isPlaying}
                      accentColor={accentColor}
                    />
                  </div>
                )}

                {processedLyrics.map((line, idx) => {
                  const isActive = idx === activeLineIndex;
                  const isPast = activeLineIndex !== -1 && idx < activeLineIndex;

                  return (
                    <React.Fragment key={line.id}>
                      <KaraokeLineItem
                        line={line}
                        isActive={isActive}
                        isPast={isPast}
                        accentColor={accentColor}
                        accentGlow={accentGlow}
                        isPlaying={isPlaying}
                        onSeek={seek}
                        activeRef={activeLyricRef}
                      />

                      {showGapDots && activeLineIndex === idx && (
                        <div className="py-1">
                          <InstrumentalDots
                            active
                            isPlaying={isPlaying}
                            accentColor={accentColor}
                          />
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}
              </>
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

      {/* 4. Bottom Bar: Ambient Visualizer + Subtext */}
      <footer
        className={`relative z-10 flex items-center justify-between transition-opacity duration-300 ${
          isIdle ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}
      >
        <div className="px-2" title="Ambient visualizer">
          <CinemaVisualizer
            isPlaying={isPlaying}
            accentColor={accentColor}
            accentGlow={accentGlow}
          />
        </div>

        <span className="text-[11px] text-[#666670] font-mono text-center flex-1 pr-12">
          MaJa Cinema Engine • Click any lyric line to jump directly
        </span>
      </footer>
    </div>
  );
};

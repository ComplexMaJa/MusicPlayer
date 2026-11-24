import React, { useState, useEffect, useRef, useCallback } from 'react';
import { RotateCcw, AlertTriangle, Minus, Square, X } from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { MiniPlayer } from './components/MiniPlayer';
import { NowPlayingDrawer } from './components/NowPlayingDrawer';
import { CinemaMode } from './components/CinemaMode';

import { Home } from './pages/Home';
import { Library } from './pages/Library';
import { Albums } from './pages/Albums';
import { AlbumDetail } from './pages/AlbumDetail';
import { Artists } from './pages/Artists';
import { ArtistDetail } from './pages/ArtistDetail';
import { Tracks } from './pages/Tracks';
import { Playlists } from './pages/Playlists';
import { Favorites } from './pages/Favorites';
import { Queue } from './pages/Queue';
import { Search } from './pages/Search';
import { SettingsPage } from './pages/Settings';

import { useLibraryStore } from './stores/useLibraryStore';
import { useSettingsStore } from './stores/useSettingsStore';
import { usePlayerStore } from './stores/usePlayerStore';
import { normalizeHexColor, getHoverAccentHex } from './utils/colorExtractor';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  variant?: 'root' | 'section';
  title?: string;
  onReset?: () => void;
  resetKey?: string | number | boolean;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    errorMessage: '',
  };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error?.message || 'An unexpected rendering error occurred.',
    };
  }

  public componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error(`Renderer ErrorBoundary (${this.props.title ?? this.props.variant ?? 'root'}):`, error, info);
  }

  public componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, errorMessage: '' });
    }
  }

  private handleReset = (): void => {
    this.setState({ hasError: false, errorMessage: '' });
    this.props.onReset?.();
  };

  public render(): React.ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const { variant = 'section', title = 'Something went wrong' } = this.props;
    const api = typeof window !== 'undefined' ? window.electronAPI : undefined;

    if (variant === 'root') {
      return (
        <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#050505] text-[#EDEDED] font-sans antialiased select-none">
          <div className="h-10 border-b border-[#1A1A1A] px-4 flex items-center justify-between app-drag-region shrink-0">
            <span className="text-xs font-mono uppercase tracking-wider text-[#A3A3A3]">
              MaJa Player — Recovery
            </span>
            {api && (
              <div className="flex items-center gap-1 app-no-drag">
                <button
                  type="button"
                  onClick={() => api.minimizeWindow?.()}
                  className="p-1.5 rounded-lg text-[#A3A3A3] hover:text-white hover:bg-[#151515] transition-colors cursor-pointer"
                  aria-label="Minimize window"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => api.maximizeWindow?.()}
                  className="p-1.5 rounded-lg text-[#A3A3A3] hover:text-white hover:bg-[#151515] transition-colors cursor-pointer"
                  aria-label="Maximize window"
                >
                  <Square className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => api.closeWindow?.()}
                  className="p-1.5 rounded-lg text-[#A3A3A3] hover:text-white hover:bg-[#FF2E55] transition-colors cursor-pointer"
                  aria-label="Close window"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          <div className="flex-1 flex items-center justify-center p-8">
            <div className="max-w-md w-full bg-[#0A0A0A] border border-[#1A1A1A] rounded-2xl p-6 flex flex-col gap-4 shadow-2xl">
              <div className="flex items-center gap-3 text-[#FF4D67]">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <h1 className="text-base font-bold text-white">{title}</h1>
              </div>
              <p className="text-xs text-[#A3A3A3] leading-relaxed break-words">
                {this.state.errorMessage}
              </p>
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#FF2E55] hover:bg-[#FF4568] text-white text-xs font-semibold transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reload App</span>
                </button>
                <button
                  type="button"
                  onClick={this.handleReset}
                  className="px-4 py-2 rounded-xl bg-[#141414] hover:bg-[#1E1E1E] border border-[#242424] text-xs font-medium text-[#EDEDED] transition-colors cursor-pointer"
                >
                  Try Recover
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="flex-1 flex items-center justify-center p-8 bg-[#050505]/95">
        <div className="max-w-md w-full bg-[#0A0A0A] border border-[#1A1A1A] rounded-2xl p-6 flex flex-col gap-3">
          <div className="flex items-center gap-2.5 text-[#FF4D67]">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <h2 className="text-sm font-bold text-white">{title}</h2>
          </div>
          <p className="text-xs text-[#A3A3A3] leading-relaxed break-words">
            {this.state.errorMessage}
          </p>
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={this.handleReset}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#151515] hover:bg-[#202020] border border-[#242424] text-xs font-medium text-white transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Recover View</span>
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export function sanitizeBackgroundUrl(rawUrl?: string): string | null {
  if (typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  if (!trimmed || /[\u0000-\u001F\u007F]/.test(trimmed)) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:') {
      return parsed.href;
    }
    if (
      parsed.protocol === 'maja-artwork:' &&
      (parsed.hostname === 'load' || parsed.hostname === 'stream')
    ) {
      return parsed.href;
    }
    return null;
  } catch {
    return null;
  }
}

interface CustomBackgroundLayerProps {
  url: string;
  fit: 'cover' | 'contain' | 'tile';
  blur: number;
  opacity: number;
  onError: () => void;
}

const CustomBackgroundLayer: React.FC<CustomBackgroundLayerProps> = ({
  url,
  fit,
  blur,
  opacity,
  onError,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const drawTiledPattern = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img || !img.complete || img.naturalWidth === 0) return;

    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const pattern = ctx.createPattern(img, 'repeat');
    if (pattern) {
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, width, height);
    }
  }, []);

  useEffect(() => {
    if (fit !== 'tile') return;
    drawTiledPattern();
    window.addEventListener('resize', drawTiledPattern);
    return () => {
      window.removeEventListener('resize', drawTiledPattern);
    };
  }, [fit, url, drawTiledPattern]);

  const safeBlur = Number.isFinite(blur) ? Math.max(0, Math.min(40, blur)) : 10;
  const safeOpacity = Number.isFinite(opacity) ? Math.max(0, Math.min(1, opacity)) : 0.35;

  const mediaStyle: React.CSSProperties = {
    filter: `blur(${safeBlur}px)`,
    opacity: safeOpacity,
    transform: 'scale(1.05)',
  };

  return (
    <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden" aria-hidden="true">
      {fit === 'tile' ? (
        <>
          <img
            ref={imgRef}
            src={url}
            alt=""
            draggable={false}
            onLoad={drawTiledPattern}
            onError={onError}
            className="hidden"
          />
          <canvas
            ref={canvasRef}
            className="absolute -inset-10 w-[calc(100%+5rem)] h-[calc(100%+5rem)] transition-opacity duration-500 ease-out"
            style={mediaStyle}
          />
        </>
      ) : (
        <img
          src={url}
          alt=""
          draggable={false}
          onError={onError}
          className={`absolute -inset-10 w-[calc(100%+5rem)] h-[calc(100%+5rem)] transition-all duration-500 ease-out ${
            fit === 'contain' ? 'object-contain' : 'object-cover'
          }`}
          style={mediaStyle}
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-[#050505]/40 via-transparent to-[#050505]/60" />
    </div>
  );
};

export const App: React.FC = () => {
  const activeView = useLibraryStore((state) => state.activeView);
  const setActiveView = useLibraryStore((state) => state.setActiveView);
  const fetchLibraryData = useLibraryStore((state) => state.fetchLibraryData);
  const settings = useSettingsStore((state) => state.settings);
  const loadSettings = useSettingsStore((state) => state.loadSettings);
  const initFromSettings = usePlayerStore((state) => state.initFromSettings);
  const setCinemaModeOpen = usePlayerStore((state) => state.setCinemaModeOpen);
  const isCinemaModeOpen = usePlayerStore((state) => state.isCinemaModeOpen);

  const [bgLoadError, setBgLoadError] = useState(false);

  const safeBgUrl = settings.customBackgroundEnabled
    ? sanitizeBackgroundUrl(settings.customBackgroundUrl)
    : null;

  useEffect(() => {
    setBgLoadError(false);
  }, [safeBgUrl]);

  useEffect(() => {
    let cancelled = false;

    void fetchLibraryData();
    void loadSettings().then((loadedSettings) => {
      if (cancelled || !loadedSettings) return;
      initFromSettings(
        loadedSettings.volume,
        loadedSettings.isMuted,
        loadedSettings.lyricsProvider
      );
    });

    const api = window.electronAPI;
    const unsubscribe = api?.onLibraryChanged?.(() => {
      void fetchLibraryData();
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [fetchLibraryData, initFromSettings, loadSettings]);

  const renderActiveView = () => {
    switch (activeView) {
      case 'home':
        return <Home />;
      case 'library':
        return <Library />;
      case 'albums':
        return <Albums />;
      case 'album-detail':
        return <AlbumDetail />;
      case 'artists':
        return <Artists />;
      case 'artist-detail':
        return <ArtistDetail />;
      case 'tracks':
        return <Tracks />;
      case 'playlists':
        return <Playlists />;
      case 'playlist-detail':
        return <Playlists />;
      case 'favorites':
        return <Favorites />;
      case 'queue':
      case 'now-playing':
        return <Queue />;
      case 'search':
        return <Search />;
      case 'settings':
        return <SettingsPage />;
      default:
        return <Home />;
    }
  };

  const accentHex = normalizeHexColor(settings.accentColor, '#FF2E55');
  const accentHoverHex = getHoverAccentHex(accentHex);
  const hasCustomBg = Boolean(safeBgUrl && !bgLoadError);

  return (
    <div
      style={{
        '--accent-color': accentHex,
        '--accent-glow': `${accentHex}55`,
        '--accent-hover': accentHoverHex,
      } as React.CSSProperties}
      className={`flex flex-col h-screen w-screen overflow-hidden bg-[#050505] text-[#EDEDED] font-sans antialiased select-none relative transition-colors duration-300 ${
        settings.reducedMotion ? 'reduced-motion' : ''
      } ${hasCustomBg ? 'has-custom-wallpaper' : ''}`}
    >
      {/* Dynamic Custom Background Wallpaper Layer */}
      {hasCustomBg && safeBgUrl && (
        <CustomBackgroundLayer
          url={safeBgUrl}
          fit={settings.customBackgroundFit ?? 'cover'}
          blur={settings.customBackgroundBlur ?? 10}
          opacity={settings.customBackgroundOpacity ?? 0.35}
          onError={() => setBgLoadError(true)}
        />
      )}

      {/* Upper Area: Sidebar + Main Area + Right Drawer */}
      <div className="flex-1 flex overflow-hidden relative z-10 bg-transparent">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden min-w-0 bg-transparent">
          <Header />
          <ErrorBoundary
            variant="section"
            title="Unable to render this view"
            resetKey={activeView}
            onReset={() => setActiveView('home')}
          >
            <main key={activeView} className="flex-1 flex overflow-hidden animate-pageTransition bg-transparent">
              {renderActiveView()}
            </main>
          </ErrorBoundary>
        </div>
        <NowPlayingDrawer />
      </div>

      {/* Bottom Global Mini Player */}
      <div className="relative z-20">
        <MiniPlayer />
      </div>

      {/* Fullscreen Ambient Cinema Mode Overlay */}
      <ErrorBoundary
        variant="section"
        title="Cinema Mode encountered an error"
        resetKey={isCinemaModeOpen}
        onReset={() => setCinemaModeOpen(false)}
      >
        <CinemaMode />
      </ErrorBoundary>
    </div>
  );
};

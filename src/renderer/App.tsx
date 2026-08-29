import React, { useEffect } from 'react';
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

export const App: React.FC = () => {
  const { activeView, fetchLibraryData } = useLibraryStore();
  const { settings, loadSettings } = useSettingsStore();
  const { initFromSettings } = usePlayerStore();

  useEffect(() => {
    fetchLibraryData();
    loadSettings().then((loadedSettings) => {
      if (loadedSettings) {
        initFromSettings(loadedSettings.volume, loadedSettings.isMuted);
      }
    });
  }, []);

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
        return <Queue />;
      case 'search':
        return <Search />;
      case 'settings':
        return <SettingsPage />;
      default:
        return <Home />;
    }
  };

  const accentHex = settings.accentColor || '#FF2E55';
  const hasCustomBg = Boolean(settings.customBackgroundEnabled && settings.customBackgroundUrl);

  return (
    <div
      style={{
        '--accent-color': accentHex,
        '--accent-glow': `${accentHex}55`,
        '--accent-hover': accentHex,
      } as React.CSSProperties}
      className={`flex flex-col h-screen w-screen overflow-hidden bg-[#050505] text-[#EDEDED] font-sans antialiased select-none relative transition-colors duration-300 ${
        settings.reducedMotion ? 'reduced-motion' : ''
      } ${hasCustomBg ? 'has-custom-wallpaper' : ''}`}
    >
      {/* Dynamic Custom Background Wallpaper Layer */}
      {hasCustomBg && (
        <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
          <div
            className="absolute -inset-10 transition-all duration-500 ease-out bg-no-repeat bg-center"
            style={{
              backgroundImage: `url("${settings.customBackgroundUrl}")`,
              backgroundSize: settings.customBackgroundFit === 'tile' ? 'auto' : settings.customBackgroundFit === 'contain' ? 'contain' : 'cover',
              backgroundRepeat: settings.customBackgroundFit === 'tile' ? 'repeat' : 'no-repeat',
              filter: `blur(${settings.customBackgroundBlur ?? 10}px)`,
              opacity: settings.customBackgroundOpacity ?? 0.35,
              transform: 'scale(1.05)',
            }}
          />
          {/* Subtle Dark Vignette Scrim for perfect text contrast and readability */}
          <div className="absolute inset-0 bg-gradient-to-b from-[#050505]/40 via-transparent to-[#050505]/60" />
        </div>
      )}

      {/* Upper Area: Sidebar + Main Area + Right Drawer */}
      <div className="flex-1 flex overflow-hidden relative z-10 bg-transparent">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden min-w-0 bg-transparent">
          <Header />
          <main key={activeView} className="flex-1 flex overflow-hidden animate-pageTransition bg-transparent">
            {renderActiveView()}
          </main>
        </div>
        <NowPlayingDrawer />
      </div>

      {/* Bottom Global Mini Player */}
      <div className="relative z-20">
        <MiniPlayer />
      </div>

      {/* Fullscreen Ambient Cinema Mode Overlay */}
      <CinemaMode />
    </div>
  );
};

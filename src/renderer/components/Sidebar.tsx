import React from 'react';
import {
  Disc,
  Library,
  Album as AlbumIcon,
  Users,
  Music,
  ListMusic,
  Heart,
  Settings as SettingsIcon,
  Sparkles,
} from 'lucide-react';
import { useLibraryStore } from '../stores/useLibraryStore';
import { ViewMode } from '../../shared/types';

export const Sidebar: React.FC = () => {
  const {
    activeView,
    setActiveView,
    playlists,
    selectedPlaylistId,
    setSelectedPlaylistId,
  } = useLibraryStore();

  const navItems: { id: ViewMode; label: string; icon: React.ReactNode }[] = [
    { id: 'home', label: 'Now Playing', icon: <Disc className="w-4 h-4" /> },
    { id: 'library', label: 'Library', icon: <Library className="w-4 h-4" /> },
    { id: 'albums', label: 'Albums', icon: <AlbumIcon className="w-4 h-4" /> },
    { id: 'artists', label: 'Artists', icon: <Users className="w-4 h-4" /> },
    { id: 'tracks', label: 'Tracks', icon: <Music className="w-4 h-4" /> },
    { id: 'playlists', label: 'Playlists', icon: <ListMusic className="w-4 h-4" /> },
    { id: 'favorites', label: 'Favorites', icon: <Heart className="w-4 h-4" /> },
  ];

  return (
    <aside className="w-56 bg-[#050505] border-r border-[#1A1A1A] flex flex-col justify-between h-full select-none shrink-0">
      <div className="p-5 flex flex-col gap-6">
        {/* Brand Header */}
        <div className="flex items-center gap-3 app-drag-region cursor-default">
          <div className="w-7 h-7 rounded-full bg-[#FF2E55] flex items-center justify-center text-white shadow-lg shadow-[#FF2E55]/30">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-xs font-bold tracking-widest text-white uppercase">MAJA PLAYER</h1>
            <p className="text-[9px] tracking-wider text-[#666666] uppercase font-mono">DESIGN SYSTEM</p>
          </div>
        </div>

        {/* Main Navigation Links */}
        <nav className="flex flex-col gap-1">
          {navItems.map((item) => {
            const isActive = activeView === item.id && activeView !== 'playlist-detail';
            return (
              <button
                key={item.id}
                onClick={() => setActiveView(item.id)}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 group relative ${
                  isActive
                    ? 'text-white bg-[#101010] shadow-sm'
                    : 'text-[#A3A3A3] hover:text-white hover:bg-[#0A0A0A]'
                }`}
              >
                {isActive && (
                  <div
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-4 rounded-r-full animate-fadeIn"
                    style={{
                      backgroundColor: 'var(--accent-color, #FF2E55)',
                      boxShadow: '0 0 10px var(--accent-glow, rgba(255, 46, 85, 0.5))',
                    }}
                  />
                )}
                <span
                  className="transition-transform duration-200 group-hover:scale-110"
                  style={isActive ? { color: 'var(--accent-color, #FF2E55)' } : { color: '#666666' }}
                >
                  {item.icon}
                </span>
                <span className="transition-transform duration-200 group-hover:translate-x-0.5">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Playlists Section */}
        <div className="flex flex-col gap-2 pt-4 border-t border-[#1A1A1A]">
          <h2 className="text-[10px] font-semibold text-[#666666] uppercase tracking-widest px-3 font-mono">
            PLAYLISTS
          </h2>
          <div className="flex flex-col gap-1 max-h-48 overflow-y-auto pr-1">
            {playlists.map((pl) => {
              const isSelected = activeView === 'playlist-detail' && selectedPlaylistId === pl.id;
              return (
                <button
                  key={pl.id}
                  onClick={() => {
                    setSelectedPlaylistId(pl.id);
                    setActiveView('playlist-detail');
                  }}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs transition-all duration-150 text-left truncate group ${
                    isSelected
                      ? 'font-semibold bg-[#101010]'
                      : 'text-[#A3A3A3] hover:text-white hover:bg-[#0A0A0A] hover:translate-x-0.5'
                  }`}
                  style={isSelected ? { color: 'var(--accent-color, #FF2E55)' } : undefined}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full transition-colors"
                    style={
                      isSelected
                        ? {
                            backgroundColor: 'var(--accent-color, #FF2E55)',
                            boxShadow: '0 0 6px var(--accent-glow, rgba(255, 46, 85, 0.6))',
                          }
                        : { backgroundColor: '#666666' }
                    }
                  />
                  <span className="truncate">{pl.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bottom Settings Link */}
      <div className="p-4 border-t border-[#1A1A1A]">
        <button
          onClick={() => setActiveView('settings')}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 group ${
            activeView === 'settings'
              ? 'text-white bg-[#101010]'
              : 'text-[#A3A3A3] hover:text-white hover:bg-[#0A0A0A]'
          }`}
        >
          <SettingsIcon className="w-4 h-4 text-[#666666] group-hover:text-white group-hover:rotate-45 transition-all duration-300" />
          <span className="transition-transform duration-200 group-hover:translate-x-0.5">Settings</span>
        </button>
      </div>
    </aside>
  );
};

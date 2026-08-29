import React from 'react';
import { Search, Minus, Square, X, User } from 'lucide-react';
import { useLibraryStore } from '../stores/useLibraryStore';

export const Header: React.FC = () => {
  const { searchQuery, setSearchQuery, setActiveView } = useLibraryStore();

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    if (e.target.value.trim().length > 0) {
      setActiveView('search');
    }
  };

  const handleMinimize = () => window.electronAPI?.minimizeWindow();
  const handleMaximize = () => window.electronAPI?.maximizeWindow();
  const handleClose = () => window.electronAPI?.closeWindow();

  return (
    <header className="h-14 bg-[#050505] border-b border-[#1A1A1A] px-6 flex items-center justify-between select-none app-drag-region shrink-0">
      {/* Search Input Box */}
      <div className="relative w-80 app-no-drag group">
        <Search
          className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#666666] transition-colors duration-200"
          style={{ color: searchQuery ? 'var(--accent-color, #FF2E55)' : undefined }}
        />
        <input
          type="text"
          value={searchQuery}
          onChange={handleSearchChange}
          placeholder="Search for songs, artists, albums..."
          style={{
            borderColor: searchQuery ? 'var(--accent-color, #FF2E55)' : undefined,
          }}
          className="w-full bg-[#0A0A0A] border border-[#1A1A1A] rounded-full py-1.5 pl-10 pr-4 text-xs text-[#EDEDED] placeholder-[#666666] outline-none transition-all duration-200"
        />
      </div>

      {/* User Info & Window Controls */}
      <div className="flex items-center gap-4 app-no-drag">
        {/* User Pill */}
        <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-[#0A0A0A] border border-[#1A1A1A] hover:border-[#2E2E2E] transition-colors cursor-default">
          <div
            className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shadow-sm transition-colors duration-300"
            style={{
              backgroundColor: 'var(--accent-color, #FF2E55)',
              boxShadow: '0 0 10px var(--accent-glow, rgba(255, 46, 85, 0.5))',
            }}
          >
            M
          </div>
          <span className="text-xs font-medium text-[#EDEDED]">MaJa</span>
        </div>

        {/* Window Controls */}
        <div className="flex items-center gap-1 ml-2 text-[#A3A3A3]">
          <button
            onClick={handleMinimize}
            className="p-1.5 hover:bg-[#151515] hover:text-white rounded-lg transition-all duration-150 hover:scale-105 active:scale-95"
            title="Minimize"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleMaximize}
            className="p-1.5 hover:bg-[#151515] hover:text-white rounded-lg transition-all duration-150 hover:scale-105 active:scale-95"
            title="Maximize"
          >
            <Square className="w-3 h-3" />
          </button>
          <button
            onClick={handleClose}
            className="p-1.5 hover:bg-[#FF2E55] hover:text-white rounded-lg transition-all duration-150 hover:scale-105 active:scale-95"
            title="Close"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </header>
  );
};

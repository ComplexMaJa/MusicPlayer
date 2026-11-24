import React, { useDeferredValue, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { useLibraryStore } from '../stores/useLibraryStore';
import { VirtualTrackList } from '../components/VirtualTrackList';

export const Tracks: React.FC = () => {
  const tracks = useLibraryStore((state) => state.tracks);
  const [filterText, setFilterText] = useState('');
  const deferredFilterText = useDeferredValue(filterText);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const trimmedQuery = deferredFilterText.trim().toLowerCase();

  const filteredTracks = useMemo(() => {
    if (!trimmedQuery) return tracks;
    return tracks.filter(
      (t) =>
        t.title.toLowerCase().includes(trimmedQuery) ||
        t.artist.toLowerCase().includes(trimmedQuery) ||
        t.album.toLowerCase().includes(trimmedQuery)
    );
  }, [tracks, trimmedQuery]);

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto p-8 flex flex-col gap-6 max-w-6xl mx-auto w-full select-none will-change-scroll"
    >
      {/* Header & Local Filter Input */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2
            className="text-[10px] font-semibold uppercase tracking-widest mb-1 font-mono transition-colors"
            style={{ color: 'var(--accent-color, #FF2E55)' }}
          >
            ALL MUSIC
          </h2>
          <h1 className="text-3xl font-bold text-white tracking-tight">TRACKS</h1>
          <p className="text-xs text-[#A3A3A3] mt-1 font-mono">
            {filteredTracks.length} {filteredTracks.length === 1 ? 'TRACK' : 'TRACKS'}
          </p>
        </div>

        <div className="relative w-72 group">
          <Search
            className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#666666] transition-colors duration-200 pointer-events-none"
            style={{ color: filterText ? 'var(--accent-color, #FF2E55)' : undefined }}
          />
          <input
            ref={inputRef}
            type="text"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Filter tracks..."
            aria-label="Filter tracks"
            style={{
              borderColor: filterText ? 'var(--accent-color, #FF2E55)' : undefined,
            }}
            className="w-full bg-[#0A0A0A] border border-[#1A1A1A] rounded-full py-1.5 pl-10 pr-8 text-xs text-[#EDEDED] placeholder-[#666666] outline-none transition-all duration-200"
          />
          {filterText.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setFilterText('');
                inputRef.current?.focus();
              }}
              aria-label="Clear track filter"
              title="Clear filter"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full text-[#666666] hover:text-white hover:bg-[#1A1A1A] transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Tracks Table */}
      <div className="flex flex-col gap-1">
        <div className="grid grid-cols-12 px-4 py-2 text-[10px] font-semibold text-[#666666] uppercase tracking-widest font-mono border-b border-[#1A1A1A]">
          <div className="col-span-1">#</div>
          <div className="col-span-4">TITLE</div>
          <div className="col-span-3">ARTIST</div>
          <div className="col-span-2">ALBUM</div>
          <div className="col-span-2 text-right">TIME / TYPE</div>
        </div>

        {filteredTracks.length > 0 ? (
          <VirtualTrackList
            tracks={filteredTracks}
            queueContext={filteredTracks}
            scrollRef={scrollRef}
          />
        ) : (
          <div className="py-12 text-center bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl text-xs text-[#666666]">
            {tracks.length === 0
              ? 'Your library has no tracks yet. Add a music folder in Library to scan your music.'
              : `No tracks match "${filterText.trim()}".`}
          </div>
        )}
      </div>
    </div>
  );
};

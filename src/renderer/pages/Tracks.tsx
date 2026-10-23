import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { useLibraryStore } from '../stores/useLibraryStore';
import { TrackRow } from '../components/TrackRow';

export const Tracks: React.FC = () => {
  const tracks = useLibraryStore((state) => state.tracks);
  const [filterText, setFilterText] = useState('');

  const filteredTracks = useMemo(() => {
    const query = filterText.toLowerCase();
    return tracks.filter(
      (t) =>
        t.title.toLowerCase().includes(query) ||
        t.artist.toLowerCase().includes(query) ||
        t.album.toLowerCase().includes(query)
    );
  }, [tracks, filterText]);

  return (
    <div className="flex-1 overflow-y-auto p-8 flex flex-col gap-6 max-w-6xl mx-auto w-full select-none">
      {/* Header & Local Filter Input */}
      <div className="flex items-center justify-between">
        <div>
          <h2
            className="text-[10px] font-semibold uppercase tracking-widest mb-1 font-mono transition-colors"
            style={{ color: 'var(--accent-color, #FF2E55)' }}
          >
            ALL MUSIC
          </h2>
          <h1 className="text-3xl font-bold text-white tracking-tight">TRACKS</h1>
          <p className="text-xs text-[#A3A3A3] mt-1 font-mono">{filteredTracks.length} TRACKS</p>
        </div>

        <div className="relative w-72 group">
          <Search
            className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#666666] transition-colors duration-200"
            style={{ color: filterText ? 'var(--accent-color, #FF2E55)' : undefined }}
          />
          <input
            type="text"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Search tracks..."
            style={{
              borderColor: filterText ? 'var(--accent-color, #FF2E55)' : undefined,
            }}
            className="w-full bg-[#0A0A0A] border border-[#1A1A1A] rounded-full py-1.5 pl-10 pr-4 text-xs text-[#EDEDED] placeholder-[#666666] outline-none transition-all duration-200"
          />
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
          filteredTracks.map((track, idx) => (
            <TrackRow key={track.id} track={track} index={idx} queueContext={filteredTracks} />
          ))
        ) : (
          <div className="py-12 text-center bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl text-xs text-[#666666]">
            No matching tracks found.
          </div>
        )}
      </div>
    </div>
  );
};

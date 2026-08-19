import React from 'react';
import { Heart, Play } from 'lucide-react';
import { useLibraryStore } from '../stores/useLibraryStore';
import { usePlayerStore } from '../stores/usePlayerStore';
import { TrackRow } from '../components/TrackRow';

export const Favorites: React.FC = () => {
  const { favorites } = useLibraryStore();
  const { playTrack } = usePlayerStore();

  const handlePlayAll = () => {
    if (favorites.length > 0) {
      playTrack(favorites[0], favorites);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-8 flex flex-col gap-6 max-w-6xl mx-auto w-full select-none">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[10px] font-semibold text-[#FF2E55] uppercase tracking-widest mb-1 font-mono">
            YOUR COLLECTION
          </h2>
          <h1 className="text-3xl font-bold text-white tracking-tight">FAVORITES</h1>
          <p className="text-xs text-[#A3A3A3] mt-1 font-mono">{favorites.length} TRACKS LIKED</p>
        </div>

        {favorites.length > 0 && (
          <button
            onClick={handlePlayAll}
            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-[#FF2E55] hover:bg-[#FF4568] text-white text-xs font-semibold shadow-lg shadow-[#FF2E55]/30 hover:shadow-xl hover:shadow-[#FF2E55]/50 transition-all duration-200 hover:scale-102 active:scale-97 cursor-pointer"
          >
            <Play className="w-4 h-4 fill-white translate-x-0.5" />
            <span>PLAY ALL</span>
          </button>
        )}
      </div>

      {/* Favorites Table */}
      <div className="flex flex-col gap-1">
        <div className="grid grid-cols-12 px-4 py-2 text-[10px] font-semibold text-[#666666] uppercase tracking-widest font-mono border-b border-[#1A1A1A]">
          <div className="col-span-1">#</div>
          <div className="col-span-4">TITLE</div>
          <div className="col-span-3">ARTIST</div>
          <div className="col-span-2">ALBUM</div>
          <div className="col-span-2 text-right">TIME / TYPE</div>
        </div>

        {favorites.length > 0 ? (
          favorites.map((track, idx) => (
            <TrackRow key={track.id} track={track} index={idx} queueContext={favorites} />
          ))
        ) : (
          <div className="py-16 text-center bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl flex flex-col items-center gap-3 text-xs text-[#666666]">
            <Heart className="w-8 h-8 text-[#FF2E55] opacity-50" />
            <p>You haven't added any favorite tracks yet.</p>
            <p className="text-[11px] text-[#A3A3A3]">Click the heart icon on any song to save it to your Favorites.</p>
          </div>
        )}
      </div>
    </div>
  );
};

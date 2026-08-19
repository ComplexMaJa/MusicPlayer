import React from 'react';
import { useLibraryStore } from '../stores/useLibraryStore';
import { AlbumCard } from '../components/AlbumCard';

export const Albums: React.FC = () => {
  const { albums } = useLibraryStore();

  return (
    <div className="flex-1 overflow-y-auto p-8 flex flex-col gap-6 max-w-6xl mx-auto w-full select-none">
      <div>
        <h2 className="text-[10px] font-semibold text-[#FF2E55] uppercase tracking-widest mb-1 font-mono">
          COLLECTION
        </h2>
        <h1 className="text-3xl font-bold text-white tracking-tight">ALBUMS</h1>
        <p className="text-xs text-[#A3A3A3] mt-1 font-mono">{albums.length} ALBUMS AVAILABLE</p>
      </div>

      {albums.length > 0 ? (
        <div className="grid grid-cols-5 gap-4">
          {albums.map((album) => (
            <AlbumCard key={album.id} album={album} />
          ))}
        </div>
      ) : (
        <div className="py-12 text-center bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl text-xs text-[#666666]">
          No albums found in your library. Add a music folder in Library to scan tracks.
        </div>
      )}
    </div>
  );
};

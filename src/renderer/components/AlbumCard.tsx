import React from 'react';
import { Play, Disc } from 'lucide-react';
import { Album } from '../../shared/types';
import { useLibraryStore } from '../stores/useLibraryStore';

interface AlbumCardProps {
  album: Album;
}

export const AlbumCard: React.FC<AlbumCardProps> = ({ album }) => {
  const { setSelectedAlbumId, setActiveView } = useLibraryStore();

  const handleClick = () => {
    setSelectedAlbumId(album.id);
    setActiveView('album-detail');
  };

  return (
    <div
      onClick={handleClick}
      className="bg-[#0A0A0A] border border-[#1A1A1A] hover:border-[#FF2E55]/30 hover:shadow-xl hover:shadow-[#FF2E55]/5 hover:-translate-y-1 p-3 rounded-2xl flex flex-col gap-3 transition-all duration-200 ease-out group cursor-pointer select-none"
    >
      <div className="aspect-square rounded-xl overflow-hidden bg-[#101010] relative shadow-md">
        {album.artworkPath ? (
          <img
            src={album.artworkPath}
            alt={album.title}
            className="w-full h-full object-cover group-hover:scale-108 transition-transform duration-300 ease-out"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#151515] to-[#0A0A0A]">
            <Disc className="w-10 h-10 text-[#FF2E55] opacity-60 group-hover:scale-110 transition-transform duration-300" />
          </div>
        )}
        <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
          <div className="w-10 h-10 rounded-full bg-[#FF2E55] hover:bg-[#FF4568] flex items-center justify-center text-white shadow-xl shadow-[#FF2E55]/50 transform translate-y-3 group-hover:translate-y-0 group-hover:scale-105 active:scale-95 transition-all duration-200 ease-out">
            <Play className="w-5 h-5 fill-white translate-x-0.5" />
          </div>
        </div>
      </div>
      <div className="min-w-0 px-0.5">
        <h4 className="text-xs font-semibold text-white truncate group-hover:text-[#FF2E55] transition-colors duration-150">
          {album.title}
        </h4>
        <p className="text-[11px] text-[#A3A3A3] truncate mt-0.5">{album.artist}</p>
      </div>
    </div>
  );
};

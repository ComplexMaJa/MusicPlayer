import React from 'react';
import { User } from 'lucide-react';
import { Artist } from '../../shared/types';
import { useLibraryStore } from '../stores/useLibraryStore';

interface ArtistCardProps {
  artist: Artist;
}

export const ArtistCard: React.FC<ArtistCardProps> = ({ artist }) => {
  const setSelectedArtistId = useLibraryStore((state) => state.setSelectedArtistId);
  const setActiveView = useLibraryStore((state) => state.setActiveView);

  const handleClick = () => {
    setSelectedArtistId(artist.id);
    setActiveView('artist-detail');
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="w-full bg-[#0A0A0A] border border-[#1A1A1A] hover:border-white/20 p-4 rounded-2xl flex flex-col items-center text-center gap-3 transition-all duration-200 ease-out group cursor-pointer select-none hover:-translate-y-1"
    >
      <div className="w-24 h-24 rounded-full overflow-hidden bg-[#101010] border border-[#1A1A1A] relative shadow-lg transition-all duration-300">
        {artist.artworkPath ? (
          <img
            src={artist.artworkPath}
            alt={artist.name}
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300 ease-out"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#151515] to-[#0A0A0A]">
            <User className="w-10 h-10 text-[#A3A3A3] group-hover:scale-110 transition-transform duration-300" />
          </div>
        )}
      </div>
      <div className="min-w-0 w-full">
        <h4 className="text-xs font-semibold text-white truncate group-hover:text-accent transition-colors duration-150">
          {artist.name}
        </h4>
        <p className="text-[10px] text-[#666666] uppercase tracking-wider font-mono mt-0.5">
          {artist.albumCount} {artist.albumCount === 1 ? 'ALBUM' : 'ALBUMS'} • {artist.trackCount} TRACKS
        </p>
      </div>
    </button>
  );
};

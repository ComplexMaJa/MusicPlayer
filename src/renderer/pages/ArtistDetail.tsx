import React, { useEffect, useState } from 'react';
import { Play, User, ArrowLeft, UserPlus } from 'lucide-react';
import { useLibraryStore } from '../stores/useLibraryStore';
import { usePlayerStore } from '../stores/usePlayerStore';
import { Artist, Album, Track } from '../../shared/types';
import { TrackRow } from '../components/TrackRow';
import { AlbumCard } from '../components/AlbumCard';

export const ArtistDetail: React.FC = () => {
  const selectedArtistId = useLibraryStore((state) => state.selectedArtistId);
  const setActiveView = useLibraryStore((state) => state.setActiveView);
  const playTrack = usePlayerStore((state) => state.playTrack);
  const [data, setData] = useState<{ artist: Artist; albums: Album[]; tracks: Track[] } | null>(null);

  useEffect(() => {
    if (selectedArtistId && window.electronAPI) {
      window.electronAPI.getArtistDetail(selectedArtistId).then((res) => {
        if (res) setData(res);
      });
    }
  }, [selectedArtistId]);

  if (!data) {
    return (
      <div className="flex-1 p-8 text-center text-xs text-[#666666]">
        Loading artist details...
      </div>
    );
  }

  const { artist, albums, tracks } = data;

  const handlePlayAll = () => {
    if (tracks.length > 0) {
      playTrack(tracks[0], tracks);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-8 flex flex-col gap-8 max-w-6xl mx-auto w-full select-none">
      {/* Back Button */}
      <button
        onClick={() => setActiveView('artists')}
        className="flex items-center gap-2 text-xs text-[#A3A3A3] hover:text-white transition-all duration-150 hover:-translate-x-1 w-fit group"
      >
        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
        <span>Back to Artists</span>
      </button>

      {/* Artist Header matching Mockup Screen #4 */}
      <div className="flex items-center gap-6">
        <div className="w-32 h-32 rounded-full overflow-hidden bg-[#0A0A0A] border border-[#1A1A1A] group-hover:border-[#FF2E55]/30 shrink-0 shadow-2xl group transition-all duration-300">
          {artist.artworkPath ? (
            <img
              src={artist.artworkPath}
              alt={artist.name}
              className="w-full h-full object-cover group-hover:scale-108 transition-transform duration-300 ease-out"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#151515] to-[#0A0A0A]">
              <User className="w-12 h-12 text-[#A3A3A3] group-hover:scale-110 transition-transform duration-300" />
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 min-w-0 flex-1">
          <span
            className="text-[10px] font-semibold uppercase tracking-widest font-mono transition-colors"
            style={{ color: 'var(--accent-color, #FF2E55)' }}
          >
            ARTIST
          </span>
          <h1 className="text-3xl font-bold text-white tracking-tight truncate">{artist.name}</h1>
          <p className="text-xs text-[#666666] font-mono">
            {artist.albumCount} {artist.albumCount === 1 ? 'album' : 'albums'} • {artist.trackCount} tracks
          </p>

          <div className="flex items-center gap-3 mt-2">
            <button
              onClick={handlePlayAll}
              className="flex items-center gap-2 px-5 py-2 rounded-xl text-white text-xs font-semibold shadow-lg transition-all duration-200 hover:scale-102 active:scale-97 cursor-pointer"
              style={{
                backgroundColor: 'var(--accent-color, #FF2E55)',
                boxShadow: '0 0 16px var(--accent-glow, rgba(255, 46, 85, 0.35))',
              }}
            >
              <Play className="w-4 h-4 fill-white translate-x-0.5" />
              <span>Play All</span>
            </button>
            <button className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#101010] border border-[#1A1A1A] text-white text-xs font-medium hover:bg-[#151515] hover:border-[#2E2E2E] transition-all duration-200 hover:scale-102 active:scale-97 cursor-pointer">
              <UserPlus className="w-3.5 h-3.5" />
              <span>Follow</span>
            </button>
          </div>
        </div>
      </div>

      {/* Grid Layout: Popular Tracks (left) & Albums (right) */}
      <div className="grid grid-cols-12 gap-8">
        {/* Popular Tracks Section */}
        <div className="col-span-7 flex flex-col gap-4">
          <h3 className="text-[11px] font-semibold text-[#666666] uppercase tracking-widest font-mono">
            POPULAR TRACKS
          </h3>
          <div className="flex flex-col gap-1">
            {tracks.slice(0, 5).map((track, idx) => (
              <TrackRow key={track.id} track={track} index={idx} queueContext={tracks} />
            ))}
          </div>
        </div>

        {/* Albums Section */}
        <div className="col-span-5 flex flex-col gap-4">
          <h3 className="text-[11px] font-semibold text-[#666666] uppercase tracking-widest font-mono">
            ALBUMS ({albums.length})
          </h3>
          <div className="grid grid-cols-2 gap-4">
            {albums.map((alb) => (
              <AlbumCard key={alb.id} album={alb} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

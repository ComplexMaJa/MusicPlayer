import React, { useEffect, useState } from 'react';
import { Play, Disc, ArrowLeft, Heart } from 'lucide-react';
import { useLibraryStore } from '../stores/useLibraryStore';
import { usePlayerStore } from '../stores/usePlayerStore';
import { Album, Track } from '../../shared/types';
import { TrackRow } from '../components/TrackRow';

export const AlbumDetail: React.FC = () => {
  const selectedAlbumId = useLibraryStore((state) => state.selectedAlbumId);
  const setActiveView = useLibraryStore((state) => state.setActiveView);
  const playTrack = usePlayerStore((state) => state.playTrack);
  const [albumData, setAlbumData] = useState<(Album & { tracks: Track[] }) | null>(null);

  useEffect(() => {
    if (selectedAlbumId && window.electronAPI) {
      window.electronAPI.getAlbumDetail(selectedAlbumId).then((data) => {
        if (data) setAlbumData(data as any);
      });
    }
  }, [selectedAlbumId]);

  if (!albumData) {
    return (
      <div className="flex-1 p-8 text-center text-xs text-[#666666]">
        Loading album details...
      </div>
    );
  }

  const formatDuration = (secs: number) => {
    const mins = Math.floor(secs / 60);
    return `${mins} min`;
  };

  const handlePlayAlbum = () => {
    if (albumData.tracks && albumData.tracks.length > 0) {
      playTrack(albumData.tracks[0], albumData.tracks);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-8 flex flex-col gap-8 max-w-6xl mx-auto w-full select-none will-change-scroll">
      {/* Back Button */}
      <button
        onClick={() => setActiveView('albums')}
        className="flex items-center gap-2 text-xs text-[#A3A3A3] hover:text-white transition-all duration-150 hover:-translate-x-1 w-fit group"
      >
        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
        <span>Back to Albums</span>
      </button>

      {/* Album Header matching Mockup Screen #3 */}
      <div className="flex items-end gap-6">
        <div className="w-44 h-44 rounded-2xl overflow-hidden bg-[#0A0A0A] border border-[#1A1A1A] shrink-0 shadow-2xl group">
          {albumData.artworkPath ? (
            <img
              src={albumData.artworkPath}
              alt={albumData.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#151515] to-[#0A0A0A]">
              <Disc className="w-12 h-12 text-[#FF2E55] opacity-80 group-hover:scale-105 transition-transform duration-300" />
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3 min-w-0 flex-1">
          <span
            className="text-[10px] font-semibold uppercase tracking-widest font-mono transition-colors"
            style={{ color: 'var(--accent-color, #FF2E55)' }}
          >
            ALBUM
          </span>
          <h1 className="text-3xl font-bold text-white tracking-tight truncate">{albumData.title}</h1>
          <p className="text-sm font-medium text-[#A3A3A3]">{albumData.artist}</p>
          <p className="text-xs text-[#666666] font-mono">
            {albumData.year || '2023'} • {albumData.trackCount} tracks, {formatDuration(albumData.totalDuration)}
          </p>

          <div className="flex items-center gap-3 mt-2">
            <button
              onClick={handlePlayAlbum}
              className="flex items-center gap-2 px-5 py-2 rounded-xl text-white text-xs font-semibold shadow-lg transition-all duration-200 hover:scale-102 active:scale-97 cursor-pointer"
              style={{
                backgroundColor: 'var(--accent-color, #FF2E55)',
                boxShadow: '0 0 16px var(--accent-glow, rgba(255, 46, 85, 0.35))',
              }}
            >
              <Play className="w-4 h-4 fill-white translate-x-0.5" />
              <span>Play</span>
            </button>
            <button
              className="p-2 rounded-xl bg-[#101010] border border-[#1A1A1A] text-[#A3A3A3] hover:text-white transition-all duration-150 hover:scale-110 active:scale-90 cursor-pointer"
            >
              <Heart className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Track List Table */}
      <section className="flex flex-col gap-2">
        <div className="grid grid-cols-12 px-4 py-2 text-[10px] font-semibold text-[#666666] uppercase tracking-widest font-mono border-b border-[#1A1A1A]">
          <div className="col-span-1">#</div>
          <div className="col-span-4">TITLE</div>
          <div className="col-span-3">ARTIST</div>
          <div className="col-span-2">ALBUM</div>
          <div className="col-span-2 text-right">DURATION</div>
        </div>

        <div className="flex flex-col gap-1">
          {albumData.tracks?.map((track, idx) => (
            <TrackRow key={track.id} track={track} index={idx} queueContext={albumData.tracks} />
          ))}
        </div>
      </section>
    </div>
  );
};

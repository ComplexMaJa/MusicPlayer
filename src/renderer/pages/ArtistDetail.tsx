import React, { useEffect, useRef, useState } from 'react';
import { Play, User, ArrowLeft } from 'lucide-react';
import { useLibraryStore } from '../stores/useLibraryStore';
import { usePlayerStore } from '../stores/usePlayerStore';
import { Artist, Album, Track } from '../../shared/types';
import { VirtualTrackList } from '../components/VirtualTrackList';
import { AlbumCard } from '../components/AlbumCard';

type DetailStatus = 'loading' | 'loaded' | 'not-found' | 'error';

export const ArtistDetail: React.FC = () => {
  const selectedArtistId = useLibraryStore((state) => state.selectedArtistId);
  const setActiveView = useLibraryStore((state) => state.setActiveView);
  const playTrack = usePlayerStore((state) => state.playTrack);
  const [status, setStatus] = useState<DetailStatus>('loading');
  const [data, setData] = useState<{ artist: Artist; albums: Album[]; tracks: Track[] } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setImgError(false);
  }, [data?.artist.artworkPath]);

  useEffect(() => {
    let cancelled = false;

    if (!selectedArtistId) {
      setData(null);
      setErrorMessage(null);
      setStatus('not-found');
      return;
    }

    if (!window.electronAPI) {
      setData(null);
      setErrorMessage('Electron API is unavailable in browser preview mode.');
      setStatus('error');
      return;
    }

    setStatus('loading');
    setData(null);
    setErrorMessage(null);

    window.electronAPI
      .getArtistDetail(selectedArtistId)
      .then((res) => {
        if (cancelled) return;
        if (!res) {
          setStatus('not-found');
          return;
        }
        setData(res);
        setStatus('loaded');
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Failed to load artist detail:', err);
        setErrorMessage(err instanceof Error ? err.message : 'Failed to load artist details.');
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [selectedArtistId]);

  const backButton = (
    <button
      type="button"
      onClick={() => setActiveView('artists')}
      className="flex items-center gap-2 text-xs text-[#A3A3A3] hover:text-white transition-all duration-150 hover:-translate-x-1 w-fit group cursor-pointer"
    >
      <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
      <span>Back to Artists</span>
    </button>
  );

  if (status === 'loading') {
    return (
      <div className="flex-1 overflow-y-auto p-8 flex flex-col gap-8 max-w-6xl mx-auto w-full select-none">
        {backButton}
        <div className="py-12 text-center text-xs text-[#666666]">Loading artist details...</div>
      </div>
    );
  }

  if (status === 'error' || status === 'not-found' || !data) {
    return (
      <div className="flex-1 overflow-y-auto p-8 flex flex-col gap-8 max-w-6xl mx-auto w-full select-none">
        {backButton}
        <div
          role={status === 'error' ? 'alert' : undefined}
          className="py-12 px-6 text-center bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl flex flex-col items-center gap-2 text-xs text-[#A3A3A3]"
        >
          <p className="font-semibold text-white">
            {status === 'error' ? 'Could not load artist' : 'Artist not found'}
          </p>
          <p className="text-[#666666]">
            {errorMessage || 'This artist may have been removed during a library scan.'}
          </p>
        </div>
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
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto p-8 flex flex-col gap-8 max-w-6xl mx-auto w-full select-none will-change-scroll"
    >
      {backButton}

      {/* Artist Header */}
      <div className="flex items-center gap-6">
        <div className="w-32 h-32 rounded-full overflow-hidden bg-[#0A0A0A] border border-[#1A1A1A] hover:border-white/20 shrink-0 shadow-2xl group transition-all duration-300">
          {artist.artworkPath && !imgError ? (
            <img
              src={artist.artworkPath}
              alt={artist.name}
              loading="lazy"
              onError={() => setImgError(true)}
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
            {artist.albumCount} {artist.albumCount === 1 ? 'album' : 'albums'} • {artist.trackCount}{' '}
            {artist.trackCount === 1 ? 'track' : 'tracks'}
          </p>

          <div className="flex items-center gap-3 mt-2">
            <button
              type="button"
              onClick={handlePlayAll}
              disabled={tracks.length === 0}
              className="flex items-center gap-2 px-5 py-2 rounded-xl text-white text-xs font-semibold shadow-lg transition-all duration-200 hover:scale-102 active:scale-97 disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
              style={{
                backgroundColor: 'var(--accent-color, #FF2E55)',
                boxShadow: '0 0 16px var(--accent-glow, rgba(255, 46, 85, 0.35))',
              }}
            >
              <Play className="w-4 h-4 fill-white translate-x-0.5" />
              <span>Play All</span>
            </button>
          </div>
        </div>
      </div>

      {/* Grid Layout: Tracks (left) & Albums (right) */}
      <div className="grid grid-cols-12 gap-8">
        {/* All Tracks Section (virtualized so every track remains reachable) */}
        <div className="col-span-12 lg:col-span-7 flex flex-col gap-4 min-w-0">
          <h3 className="text-[11px] font-semibold text-[#666666] uppercase tracking-widest font-mono">
            TRACKS ({tracks.length})
          </h3>
          {tracks.length > 0 ? (
            <div className="flex flex-col gap-1">
              <VirtualTrackList tracks={tracks} queueContext={tracks} scrollRef={scrollRef} />
            </div>
          ) : (
            <div className="py-10 text-center bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl text-xs text-[#666666]">
              No tracks found for this artist.
            </div>
          )}
        </div>

        {/* Albums Section */}
        <div className="col-span-12 lg:col-span-5 flex flex-col gap-4 min-w-0">
          <h3 className="text-[11px] font-semibold text-[#666666] uppercase tracking-widest font-mono">
            ALBUMS ({albums.length})
          </h3>
          {albums.length > 0 ? (
            <div className="grid grid-cols-2 gap-4">
              {albums.map((alb) => (
                <AlbumCard key={alb.id} album={alb} />
              ))}
            </div>
          ) : (
            <div className="py-10 text-center bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl text-xs text-[#666666]">
              No albums found for this artist.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

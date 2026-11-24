import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Play, Disc, ArrowLeft } from 'lucide-react';
import { useLibraryStore } from '../stores/useLibraryStore';
import { usePlayerStore } from '../stores/usePlayerStore';
import { Album, Track } from '../../shared/types';
import { VirtualTrackList } from '../components/VirtualTrackList';

type DetailStatus = 'loading' | 'loaded' | 'not-found' | 'error';

function formatAlbumDuration(secs: number): string {
  if (!Number.isFinite(secs) || secs <= 0) return '0 min';
  const mins = Math.floor(secs / 60);
  if (mins === 0) return '< 1 min';
  return `${mins} min`;
}

export const AlbumDetail: React.FC = () => {
  const selectedAlbumId = useLibraryStore((state) => state.selectedAlbumId);
  const setActiveView = useLibraryStore((state) => state.setActiveView);
  const playTrack = usePlayerStore((state) => state.playTrack);
  const [status, setStatus] = useState<DetailStatus>('loading');
  const [albumData, setAlbumData] = useState<(Album & { tracks: Track[] }) | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setImgError(false);
  }, [albumData?.artworkPath]);

  useEffect(() => {
    let cancelled = false;

    if (!selectedAlbumId) {
      setAlbumData(null);
      setErrorMessage(null);
      setStatus('not-found');
      return;
    }

    if (!window.electronAPI) {
      setAlbumData(null);
      setErrorMessage('Electron API is unavailable in browser preview mode.');
      setStatus('error');
      return;
    }

    setStatus('loading');
    setAlbumData(null);
    setErrorMessage(null);

    window.electronAPI
      .getAlbumDetail(selectedAlbumId)
      .then((data) => {
        if (cancelled) return;
        if (!data) {
          setStatus('not-found');
          return;
        }
        setAlbumData({ ...data, tracks: data.tracks ?? [] });
        setStatus('loaded');
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Failed to load album detail:', err);
        setErrorMessage(err instanceof Error ? err.message : 'Failed to load album details.');
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [selectedAlbumId]);

  const albumTracks = useMemo(() => albumData?.tracks ?? [], [albumData?.tracks]);

  const backButton = (
    <button
      type="button"
      onClick={() => setActiveView('albums')}
      className="flex items-center gap-2 text-xs text-[#A3A3A3] hover:text-white transition-all duration-150 hover:-translate-x-1 w-fit group cursor-pointer"
    >
      <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
      <span>Back to Albums</span>
    </button>
  );

  if (status === 'loading') {
    return (
      <div className="flex-1 overflow-y-auto p-8 flex flex-col gap-8 max-w-6xl mx-auto w-full select-none">
        {backButton}
        <div className="py-12 text-center text-xs text-[#666666]">Loading album details...</div>
      </div>
    );
  }

  if (status === 'error' || status === 'not-found' || !albumData) {
    return (
      <div className="flex-1 overflow-y-auto p-8 flex flex-col gap-8 max-w-6xl mx-auto w-full select-none">
        {backButton}
        <div
          role={status === 'error' ? 'alert' : undefined}
          className="py-12 px-6 text-center bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl flex flex-col items-center gap-2 text-xs text-[#A3A3A3]"
        >
          <p className="font-semibold text-white">
            {status === 'error' ? 'Could not load album' : 'Album not found'}
          </p>
          <p className="text-[#666666]">
            {errorMessage || 'This album may have been removed or moved during a library scan.'}
          </p>
        </div>
      </div>
    );
  }

  const handlePlayAlbum = () => {
    if (albumTracks.length > 0) {
      playTrack(albumTracks[0], albumTracks);
    }
  };

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto p-8 flex flex-col gap-8 max-w-6xl mx-auto w-full select-none will-change-scroll"
    >
      {backButton}

      {/* Album Header */}
      <div className="flex items-end gap-6">
        <div className="w-44 h-44 rounded-2xl overflow-hidden bg-[#0A0A0A] border border-[#1A1A1A] shrink-0 shadow-2xl group">
          {albumData.artworkPath && !imgError ? (
            <img
              src={albumData.artworkPath}
              alt={albumData.title}
              loading="lazy"
              onError={() => setImgError(true)}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#151515] to-[#0A0A0A]">
              <Disc
                className="w-12 h-12 opacity-80 group-hover:scale-105 transition-transform duration-300"
                style={{ color: 'var(--accent-color, #FF2E55)' }}
              />
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
          <p className="text-sm font-medium text-[#A3A3A3] truncate">{albumData.artist}</p>
          <p className="text-xs text-[#666666] font-mono">
            {albumData.year ? `${albumData.year} • ` : ''}
            {albumData.trackCount} {albumData.trackCount === 1 ? 'track' : 'tracks'},{' '}
            {formatAlbumDuration(albumData.totalDuration)}
          </p>

          <div className="flex items-center gap-3 mt-2">
            <button
              type="button"
              onClick={handlePlayAlbum}
              disabled={albumTracks.length === 0}
              className="flex items-center gap-2 px-5 py-2 rounded-xl text-white text-xs font-semibold shadow-lg transition-all duration-200 hover:scale-102 active:scale-97 disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
              style={{
                backgroundColor: 'var(--accent-color, #FF2E55)',
                boxShadow: '0 0 16px var(--accent-glow, rgba(255, 46, 85, 0.35))',
              }}
            >
              <Play className="w-4 h-4 fill-white translate-x-0.5" />
              <span>Play</span>
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
          <div className="col-span-2 text-right">TIME / TYPE</div>
        </div>

        {albumTracks.length > 0 ? (
          <div className="flex flex-col gap-1">
            <VirtualTrackList
              tracks={albumTracks}
              queueContext={albumTracks}
              scrollRef={scrollRef}
            />
          </div>
        ) : (
          <div className="py-12 text-center bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl text-xs text-[#666666]">
            No tracks found for this album.
          </div>
        )}
      </section>
    </div>
  );
};

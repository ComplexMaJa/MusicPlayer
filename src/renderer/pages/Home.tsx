import React, { memo, useEffect, useMemo, useState } from 'react';
import { Play, Disc, ArrowRight } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useLibraryStore } from '../stores/useLibraryStore';
import { usePlayerStore } from '../stores/usePlayerStore';
import { Track } from '../../shared/types';
import { TrackRow } from '../components/TrackRow';

const EMPTY_TRACKS: Track[] = [];

const HomeTrackCard: React.FC<{
  track: Track;
  onPlay: (track: Track) => void;
}> = memo(({ track, onPlay }) => {
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [track.artworkPath]);

  return (
    <button
      type="button"
      onClick={() => onPlay(track)}
      className="w-full text-left bg-[#0A0A0A] border border-[#1A1A1A] hover:border-white/20 p-3 rounded-2xl flex flex-col gap-3 transition-all duration-200 ease-out group cursor-pointer hover:-translate-y-1"
    >
      <div className="aspect-square rounded-xl overflow-hidden bg-[#101010] relative shadow-md">
        {track.artworkPath && !imgError ? (
          <img
            src={track.artworkPath}
            alt={track.title}
            loading="lazy"
            onError={() => setImgError(true)}
            className="w-full h-full object-cover group-hover:scale-108 transition-transform duration-300 ease-out"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#151515] to-[#0A0A0A]">
            <Disc
              className="w-8 h-8 opacity-60 group-hover:scale-110 transition-transform duration-300"
              style={{ color: 'var(--accent-color, #FF2E55)' }}
            />
          </div>
        )}
        <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-white shadow-xl transform translate-y-3 group-hover:translate-y-0 group-hover:scale-105 active:scale-95 transition-all duration-200 ease-out"
            style={{
              backgroundColor: 'var(--accent-color, #FF2E55)',
              boxShadow: '0 0 16px var(--accent-glow, rgba(255, 46, 85, 0.5))',
            }}
          >
            <Play className="w-4 h-4 fill-white translate-x-0.5" />
          </div>
        </div>
      </div>
      <div className="min-w-0 px-0.5">
        <h4 className="text-xs font-semibold text-white truncate group-hover:text-accent transition-colors duration-150">
          {track.title}
        </h4>
        <p className="text-[11px] text-[#A3A3A3] truncate mt-0.5">{track.artist}</p>
      </div>
    </button>
  );
});
HomeTrackCard.displayName = 'HomeTrackCard';

export const Home: React.FC = () => {
  const { recentlyPlayed, recentlyAdded, fallbackTracks, setActiveView } = useLibraryStore(
    useShallow((state) => ({
      recentlyPlayed: state.recentlyPlayed,
      recentlyAdded: state.recentlyAdded,
      fallbackTracks:
        state.recentlyPlayed.length > 0 && state.recentlyAdded.length > 0
          ? EMPTY_TRACKS
          : state.tracks,
      setActiveView: state.setActiveView,
    }))
  );
  const playTrack = usePlayerStore((state) => state.playTrack);

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? 'Good morning, MaJa.' : hour < 18 ? 'Good afternoon, MaJa.' : 'Good evening, MaJa.';

  const hasRecentlyPlayed = recentlyPlayed.length > 0;
  const displayRecentlyPlayed = useMemo(
    () => (hasRecentlyPlayed ? recentlyPlayed : fallbackTracks.slice(0, 5)),
    [hasRecentlyPlayed, recentlyPlayed, fallbackTracks]
  );

  const displayRecentlyAdded = useMemo(
    () => (recentlyAdded.length > 0 ? recentlyAdded : fallbackTracks.slice(0, 6)),
    [recentlyAdded, fallbackTracks]
  );

  const handlePlayRecentCard = useMemo(
    () => (track: Track) => playTrack(track, displayRecentlyPlayed),
    [playTrack, displayRecentlyPlayed]
  );

  return (
    <div className="flex-1 overflow-y-auto p-8 flex flex-col gap-8 max-w-6xl mx-auto w-full select-none will-change-scroll">
      {/* Greeting Header */}
      <div>
        <h2
          className="text-[10px] font-semibold uppercase tracking-widest mb-1 font-mono transition-colors"
          style={{ color: 'var(--accent-color, #FF2E55)' }}
        >
          NOW PLAYING
        </h2>
        <h1 className="text-3xl font-bold text-white tracking-tight">{greeting}</h1>
        <p className="text-sm text-[#A3A3A3] mt-1 font-light">Your library is ready when you are.</p>
      </div>

      {/* Recently Played Section */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="text-[11px] font-semibold text-[#666666] uppercase tracking-widest font-mono">
            {hasRecentlyPlayed ? 'RECENTLY PLAYED' : 'FROM YOUR LIBRARY'}
          </h3>
          <button
            type="button"
            onClick={() => setActiveView('tracks')}
            className="text-xs text-[#A3A3A3] hover:text-white flex items-center gap-1 transition-all duration-150 hover:translate-x-1 cursor-pointer"
          >
            <span>VIEW ALL</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {displayRecentlyPlayed.length > 0 ? (
            displayRecentlyPlayed.map((track) => (
              <HomeTrackCard key={track.id} track={track} onPlay={handlePlayRecentCard} />
            ))
          ) : (
            <div className="col-span-full py-8 text-center bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl text-xs text-[#666666]">
              No recently played tracks yet. Add a music folder in Library to get started.
            </div>
          )}
        </div>
      </section>

      {/* Recently Added Section */}
      <section className="flex flex-col gap-4">
        <h3 className="text-[11px] font-semibold text-[#666666] uppercase tracking-widest font-mono">
          RECENTLY ADDED
        </h3>

        <div className="flex flex-col gap-1">
          {displayRecentlyAdded.length > 0 ? (
            displayRecentlyAdded.map((track, idx) => (
              <TrackRow
                key={track.id}
                track={track}
                index={idx}
                queueContext={displayRecentlyAdded}
              />
            ))
          ) : (
            <div className="py-8 text-center bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl text-xs text-[#666666]">
              Your library is currently empty.
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

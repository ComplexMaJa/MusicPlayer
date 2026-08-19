import React, { useEffect } from 'react';
import { Play, Disc, ArrowRight } from 'lucide-react';
import { useLibraryStore } from '../stores/useLibraryStore';
import { usePlayerStore } from '../stores/usePlayerStore';
import { TrackRow } from '../components/TrackRow';

export const Home: React.FC = () => {
  const { recentlyPlayed, recentlyAdded, albums, tracks, setActiveView, setSelectedAlbumId } =
    useLibraryStore();
  const { playTrack } = usePlayerStore();

  const displayRecentlyPlayed =
    recentlyPlayed.length > 0
      ? recentlyPlayed
      : tracks.slice(0, 5);

  const displayRecentlyAdded =
    recentlyAdded.length > 0
      ? recentlyAdded
      : tracks.slice(0, 6);

  return (
    <div className="flex-1 overflow-y-auto p-8 flex flex-col gap-8 max-w-6xl mx-auto w-full select-none">
      {/* Greeting Header */}
      <div>
        <h2 className="text-[10px] font-semibold text-[#FF2E55] uppercase tracking-widest mb-1 font-mono">
          NOW PLAYING
        </h2>
        <h1 className="text-3xl font-bold text-white tracking-tight">Good evening, MaJa.</h1>
        <p className="text-sm text-[#A3A3A3] mt-1 font-light">Let's vibe and build.</p>
      </div>

      {/* Recently Played Section */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="text-[11px] font-semibold text-[#666666] uppercase tracking-widest font-mono">
            RECENTLY PLAYED
          </h3>
          <button
            onClick={() => setActiveView('albums')}
            className="text-xs text-[#A3A3A3] hover:text-white flex items-center gap-1 transition-all duration-150 hover:translate-x-1"
          >
            <span>VIEW ALL</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-5 gap-4">
          {displayRecentlyPlayed.length > 0 ? (
            displayRecentlyPlayed.map((track) => (
              <div
                key={track.id}
                onClick={() => playTrack(track, displayRecentlyPlayed)}
                className="bg-[#0A0A0A] border border-[#1A1A1A] hover:border-[#FF2E55]/30 hover:shadow-xl hover:shadow-[#FF2E55]/5 hover:-translate-y-1 p-3 rounded-2xl flex flex-col gap-3 transition-all duration-200 ease-out group cursor-pointer"
              >
                <div className="aspect-square rounded-xl overflow-hidden bg-[#101010] relative shadow-md">
                  {track.artworkPath ? (
                    <img
                      src={track.artworkPath}
                      alt={track.title}
                      className="w-full h-full object-cover group-hover:scale-108 transition-transform duration-300 ease-out"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#151515] to-[#0A0A0A]">
                      <Disc className="w-8 h-8 text-[#FF2E55] opacity-60 group-hover:scale-110 transition-transform duration-300" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
                    <div className="w-9 h-9 rounded-full bg-[#FF2E55] hover:bg-[#FF4568] flex items-center justify-center text-white shadow-xl shadow-[#FF2E55]/50 transform translate-y-3 group-hover:translate-y-0 group-hover:scale-105 active:scale-95 transition-all duration-200 ease-out">
                      <Play className="w-4 h-4 fill-white translate-x-0.5" />
                    </div>
                  </div>
                </div>
                <div className="min-w-0 px-0.5">
                  <h4 className="text-xs font-semibold text-white truncate group-hover:text-[#FF2E55] transition-colors duration-150">
                    {track.title}
                  </h4>
                  <p className="text-[11px] text-[#A3A3A3] truncate mt-0.5">{track.artist}</p>
                </div>
              </div>
            ))
          ) : (
            <div className="col-span-5 py-8 text-center bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl text-xs text-[#666666]">
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

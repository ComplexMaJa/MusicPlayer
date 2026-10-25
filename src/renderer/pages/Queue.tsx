import React, { useState } from 'react';
import { Trash2, Plus, Disc } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { usePlayerStore } from '../stores/usePlayerStore';
import { useLibraryStore } from '../stores/useLibraryStore';

export const Queue: React.FC = () => {
  const { queue, queueIndex, history, currentTrack, removeFromQueue, clearQueue, playTrack } =
    usePlayerStore(
      useShallow((state) => ({
        queue: state.queue,
        queueIndex: state.queueIndex,
        history: state.history,
        currentTrack: state.currentTrack,
        removeFromQueue: state.removeFromQueue,
        clearQueue: state.clearQueue,
        playTrack: state.playTrack,
      }))
    );
  const { createPlaylist, addTracksToPlaylist, setActiveView } = useLibraryStore(
    useShallow((state) => ({
      createPlaylist: state.createPlaylist,
      addTracksToPlaylist: state.addTracksToPlaylist,
      setActiveView: state.setActiveView,
    }))
  );

  const [activeTab, setActiveTab] = useState<'queue' | 'history'>('queue');

  const upNextTracks = queue.slice(queueIndex + 1);

  const handleSaveAsPlaylist = async () => {
    if (!queue.length) return;
    const name = `Queue Playlist — ${new Date().toLocaleDateString()}`;
    const pl = await createPlaylist(name);
    if (pl) {
      await addTracksToPlaylist(pl.id, queue.map((t) => t.id));
      setActiveView('playlists');
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-8 flex flex-col gap-6 max-w-4xl mx-auto w-full select-none will-change-scroll">
      {/* Header & Tabs */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-6">
          <button
            onClick={() => setActiveTab('queue')}
            className={`text-2xl font-bold tracking-tight transition-all duration-200 hover:scale-105 active:scale-95 ${
              activeTab === 'queue' ? 'text-white' : 'text-[#666666] hover:text-[#A3A3A3]'
            }`}
          >
            Queue
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`text-2xl font-bold tracking-tight transition-all duration-200 hover:scale-105 active:scale-95 ${
              activeTab === 'history' ? 'text-white' : 'text-[#666666] hover:text-[#A3A3A3]'
            }`}
          >
            History
          </button>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={clearQueue}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#101010] hover:bg-[#151515] border border-[#1A1A1A] hover:border-[#FF4D67]/30 text-[#FF4D67] text-xs font-medium transition-all duration-200 hover:scale-102 active:scale-97 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear Queue</span>
          </button>
          <button
            onClick={handleSaveAsPlaylist}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-white text-xs font-medium shadow-md transition-all duration-200 hover:scale-102 active:scale-97 cursor-pointer"
            style={{
              backgroundColor: 'var(--accent-color, #FF2E55)',
              boxShadow: '0 0 14px var(--accent-glow, rgba(255, 46, 85, 0.35))',
            }}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Save as Playlist</span>
          </button>
        </div>
      </div>

      {/* Currently Playing Card */}
      {currentTrack && activeTab === 'queue' && (
        <div className="flex flex-col gap-2">
          <h3
            className="text-[10px] font-semibold uppercase tracking-widest font-mono transition-colors"
            style={{ color: 'var(--accent-color, #FF2E55)' }}
          >
            NOW PLAYING
          </h3>
          <div
            className="bg-[#0A0A0A] border p-4 rounded-xl flex items-center justify-between"
            style={{
              borderColor: 'var(--accent-glow, rgba(255, 46, 85, 0.3))',
            }}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded overflow-hidden bg-[#101010] shrink-0 border border-[#1A1A1A]">
                {currentTrack.artworkPath ? (
                  <img
                    src={currentTrack.artworkPath}
                    alt={currentTrack.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Disc className="w-4 h-4" style={{ color: 'var(--accent-color, #FF2E55)' }} />
                  </div>
                )}
              </div>
              <div>
                <p className="text-xs font-bold text-white">{currentTrack.title}</p>
                <p className="text-[11px] text-[#A3A3A3]">{currentTrack.artist}</p>
              </div>
            </div>
            <span
              className="text-xs font-mono font-bold"
              style={{ color: 'var(--accent-color, #FF2E55)' }}
            >
              PLAYING
            </span>
          </div>
        </div>
      )}

      {/* Up Next / History Track List */}
      <div className="flex flex-col gap-2">
        <h3 className="text-[10px] font-semibold text-[#666666] uppercase tracking-widest font-mono">
          {activeTab === 'queue' ? 'UP NEXT' : 'RECENTLY PLAYED HISTORY'}
        </h3>

        <div className="flex flex-col gap-1">
          {activeTab === 'queue' ? (
            upNextTracks.length > 0 ? (
              upNextTracks.map((track, idx) => (
                <div
                  key={`${track.id}-${idx}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => playTrack(track, queue)}
                  onKeyDown={(event) => {
                    if (event.target !== event.currentTarget) return;
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      playTrack(track, queue);
                    }
                  }}
                  className="bg-[#0A0A0A] border border-[#1A1A1A] hover:border-[#2E2E2E] p-3 rounded-xl flex items-center justify-between text-xs transition-all group cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded overflow-hidden bg-[#101010] shrink-0">
                      {track.artworkPath ? (
                        <img
                          src={track.artworkPath}
                          alt={track.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Disc className="w-4 h-4 text-[#666666]" />
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-white group-hover:text-accent transition-colors">
                        {track.title}
                      </p>
                      <p className="text-[11px] text-[#A3A3A3]">{track.artist}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 font-mono text-[#666666]">
                    <span>
                      {Math.floor(track.duration / 60)}:
                      {String(Math.floor(track.duration % 60)).padStart(2, '0')}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFromQueue(queueIndex + 1 + idx);
                      }}
                      className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-[#FF4D67] hover:text-red-400 p-1.5 rounded-full hover:bg-[#151515] transition-all duration-150 hover:scale-110 active:scale-90"
                      aria-label={`Remove ${track.title} from queue`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-8 text-center bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl text-xs text-[#666666]">
                No tracks remaining in queue.
              </div>
            )
          ) : history.length > 0 ? (
            history.map((track, idx) => (
              <div
                key={`${track.id}-${idx}`}
                role="button"
                tabIndex={0}
                onClick={() => playTrack(track)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    playTrack(track);
                  }
                }}
                className="bg-[#0A0A0A] border border-[#1A1A1A] hover:border-white/20 p-3 rounded-xl flex items-center justify-between text-xs transition-all duration-150 group cursor-pointer hover:-translate-y-0.5"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg overflow-hidden bg-[#101010] shrink-0 group-hover:scale-105 transition-transform">
                    {track.artworkPath ? (
                      <img
                        src={track.artworkPath}
                        alt={track.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Disc className="w-4 h-4 text-[#666666]" />
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="font-medium text-white group-hover:text-accent transition-colors">
                      {track.title}
                    </p>
                    <p className="text-[11px] text-[#A3A3A3]">{track.artist}</p>
                  </div>
                </div>
                <span className="font-mono text-[#666666]">
                  {Math.floor(track.duration / 60)}:
                  {String(Math.floor(track.duration % 60)).padStart(2, '0')}
                </span>
              </div>
            ))
          ) : (
            <div className="py-8 text-center bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl text-xs text-[#666666]">
              No play history recorded yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

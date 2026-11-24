import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Trash2, Plus, Disc, AlertCircle } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { usePlayerStore } from '../stores/usePlayerStore';
import { useLibraryStore } from '../stores/useLibraryStore';
import { Track } from '../../shared/types';
import { VirtualTrackList } from '../components/VirtualTrackList';

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
  const [isSavingPlaylist, setIsSavingPlaylist] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [nowPlayingImgError, setNowPlayingImgError] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setNowPlayingImgError(false);
  }, [currentTrack?.artworkPath]);

  const upNextTracks = useMemo(() => queue.slice(queueIndex + 1), [queue, queueIndex]);

  const handleSaveAsPlaylist = async () => {
    if (!queue.length || isSavingPlaylist) return;
    setIsSavingPlaylist(true);
    setSaveError(null);
    try {
      const name = `Queue Playlist — ${new Date().toLocaleDateString()}`;
      const pl = await createPlaylist(name);
      if (pl) {
        await addTracksToPlaylist(
          pl.id,
          queue.map((t) => t.id)
        );
        setActiveView('playlists');
      } else {
        setSaveError('Could not save queue as playlist.');
      }
    } catch (err) {
      console.error('Failed to save queue as playlist:', err);
      setSaveError(err instanceof Error ? err.message : 'Failed to save queue as playlist.');
    } finally {
      setIsSavingPlaylist(false);
    }
  };

  const handlePlayUpNext = (track: Track, upNextIdx: number) => {
    const targetIndex = queueIndex + 1 + upNextIdx;
    const playQueueIndex = (
      usePlayerStore.getState() as ReturnType<typeof usePlayerStore.getState> & {
        playQueueIndex?: (index: number) => void | Promise<void>;
      }
    ).playQueueIndex;

    if (playQueueIndex) {
      void playQueueIndex(targetIndex);
    } else {
      playTrack(track, queue);
    }
  };

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto p-8 flex flex-col gap-6 max-w-4xl mx-auto w-full select-none will-change-scroll"
    >
      {/* Header & Tabs */}
      <div className="flex items-center justify-between gap-4">
        <div role="tablist" aria-label="Queue views" className="flex items-center gap-6">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'queue'}
            onClick={() => setActiveTab('queue')}
            className={`text-2xl font-bold tracking-tight transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer ${
              activeTab === 'queue' ? 'text-white' : 'text-[#666666] hover:text-[#A3A3A3]'
            }`}
          >
            Queue
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'history'}
            onClick={() => setActiveTab('history')}
            className={`text-2xl font-bold tracking-tight transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer ${
              activeTab === 'history' ? 'text-white' : 'text-[#666666] hover:text-[#A3A3A3]'
            }`}
          >
            History
          </button>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={clearQueue}
            disabled={queue.length === 0}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#101010] hover:bg-[#151515] border border-[#1A1A1A] hover:border-[#FF4D67]/30 text-[#FF4D67] text-xs font-medium transition-all duration-200 hover:scale-102 active:scale-97 disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear Queue</span>
          </button>
          <button
            type="button"
            onClick={() => void handleSaveAsPlaylist()}
            disabled={queue.length === 0 || isSavingPlaylist}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-white text-xs font-medium shadow-md transition-all duration-200 hover:scale-102 active:scale-97 disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
            style={{
              backgroundColor: 'var(--accent-color, #FF2E55)',
              boxShadow: '0 0 14px var(--accent-glow, rgba(255, 46, 85, 0.35))',
            }}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{isSavingPlaylist ? 'Saving...' : 'Save as Playlist'}</span>
          </button>
        </div>
      </div>

      {saveError && (
        <div
          role="alert"
          className="bg-[#1F1012] border border-[#FF4D67]/30 px-4 py-3 rounded-xl flex items-center gap-2.5 text-xs text-[#FF4D67]"
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{saveError}</span>
        </div>
      )}

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
            className="bg-[#0A0A0A] border p-4 rounded-xl flex items-center justify-between gap-4"
            style={{
              borderColor: 'var(--accent-glow, rgba(255, 46, 85, 0.3))',
            }}
          >
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="w-10 h-10 rounded overflow-hidden bg-[#101010] shrink-0 border border-[#1A1A1A]">
                {currentTrack.artworkPath && !nowPlayingImgError ? (
                  <img
                    src={currentTrack.artworkPath}
                    alt={currentTrack.title}
                    onError={() => setNowPlayingImgError(true)}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Disc className="w-4 h-4" style={{ color: 'var(--accent-color, #FF2E55)' }} />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-white truncate">{currentTrack.title}</p>
                <p className="text-[11px] text-[#A3A3A3] truncate">{currentTrack.artist}</p>
              </div>
            </div>
            <span
              className="text-xs font-mono font-bold shrink-0"
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
          {activeTab === 'queue'
            ? `UP NEXT (${upNextTracks.length})`
            : `RECENTLY PLAYED HISTORY (${history.length})`}
        </h3>

        <div className="flex flex-col gap-1">
          {activeTab === 'queue' ? (
            upNextTracks.length > 0 ? (
              <>
                <div className="grid grid-cols-12 px-4 py-2 text-[10px] font-semibold text-[#666666] uppercase tracking-widest font-mono border-b border-[#1A1A1A]">
                  <div className="col-span-1">#</div>
                  <div className="col-span-4">TITLE</div>
                  <div className="col-span-3">ARTIST</div>
                  <div className="col-span-2">ALBUM</div>
                  <div className="col-span-2 text-right">TIME / TYPE</div>
                </div>
                <VirtualTrackList
                  tracks={upNextTracks}
                  queueContext={queue}
                  scrollRef={scrollRef}
                  getRowKey={(track, idx) => `queue-${track.id}-${queueIndex + 1 + idx}`}
                  onPlayTrack={handlePlayUpNext}
                  onRemoveTrack={(_track, idx) => removeFromQueue(queueIndex + 1 + idx)}
                  removeLabel="Remove from queue"
                />
              </>
            ) : (
              <div className="py-8 text-center bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl text-xs text-[#666666]">
                No tracks remaining in queue.
              </div>
            )
          ) : history.length > 0 ? (
            <>
              <div className="grid grid-cols-12 px-4 py-2 text-[10px] font-semibold text-[#666666] uppercase tracking-widest font-mono border-b border-[#1A1A1A]">
                <div className="col-span-1">#</div>
                <div className="col-span-4">TITLE</div>
                <div className="col-span-3">ARTIST</div>
                <div className="col-span-2">ALBUM</div>
                <div className="col-span-2 text-right">TIME / TYPE</div>
              </div>
              <VirtualTrackList
                tracks={history}
                scrollRef={scrollRef}
                getRowKey={(track, idx) => `history-${track.id}-${idx}`}
                onPlayTrack={(track) => playTrack(track)}
              />
            </>
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

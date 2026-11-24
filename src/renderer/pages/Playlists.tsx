import React, { useState, useEffect, useRef } from 'react';
import { Plus, Play, Trash2, Disc, ListMusic, X, AlertCircle } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useLibraryStore } from '../stores/useLibraryStore';
import { usePlayerStore } from '../stores/usePlayerStore';
import { Track } from '../../shared/types';
import { VirtualTrackList } from '../components/VirtualTrackList';

export const Playlists: React.FC = () => {
  const {
    playlists,
    createPlaylist,
    deletePlaylist,
    removeTrackFromPlaylist,
    selectedPlaylistId,
    setSelectedPlaylistId,
  } = useLibraryStore(
    useShallow((state) => ({
      playlists: state.playlists,
      createPlaylist: state.createPlaylist,
      deletePlaylist: state.deletePlaylist,
      removeTrackFromPlaylist: state.removeTrackFromPlaylist,
      selectedPlaylistId: state.selectedPlaylistId,
      setSelectedPlaylistId: state.setSelectedPlaylistId,
    }))
  );
  const playTrack = usePlayerStore((state) => state.playTrack);

  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [newPlaylistDesc, setNewPlaylistDesc] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [removingTrackId, setRemovingTrackId] = useState<string | null>(null);

  const [activePlaylistTracks, setActivePlaylistTracks] = useState<Track[]>([]);
  const [isLoadingTracks, setIsLoadingTracks] = useState(false);
  const [tracksError, setTracksError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const createBtnRef = useRef<HTMLButtonElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Default to first playlist if none selected
  const activePlaylist =
    playlists.find((p) => p.id === selectedPlaylistId) || playlists[0] || null;
  const activePlaylistId = activePlaylist?.id ?? null;
  const activePlaylistUpdatedAt = activePlaylist?.updatedAt;
  const activePlaylistTrackCount = activePlaylist?.trackCount;

  useEffect(() => {
    setImgError(false);
    setConfirmDeleteId(null);
  }, [activePlaylistId, activePlaylist?.artworkPath]);

  useEffect(() => {
    let cancelled = false;

    if (!activePlaylistId) {
      setActivePlaylistTracks([]);
      setIsLoadingTracks(false);
      setTracksError(null);
      return;
    }

    if (!window.electronAPI) {
      setActivePlaylistTracks([]);
      setIsLoadingTracks(false);
      setTracksError('Electron API is unavailable in browser preview mode.');
      return;
    }

    setIsLoadingTracks(true);
    setTracksError(null);

    window.electronAPI
      .getPlaylistTracks(activePlaylistId)
      .then((tracks) => {
        if (cancelled) return;
        setActivePlaylistTracks(tracks);
        setIsLoadingTracks(false);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Failed to load playlist tracks:', err);
        setTracksError(err instanceof Error ? err.message : 'Failed to load playlist tracks.');
        setIsLoadingTracks(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activePlaylistId, activePlaylistUpdatedAt, activePlaylistTrackCount]);

  // Modal focus management, focus trap, and Escape handling
  useEffect(() => {
    if (!showCreateModal) return;

    const triggerEl = createBtnRef.current;
    nameInputRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setShowCreateModal(false);
        return;
      }
      if (event.key === 'Tab' && modalRef.current) {
        const focusables = modalRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      triggerEl?.focus();
    };
  }, [showCreateModal]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = newPlaylistName.trim();
    if (!trimmedName || isCreating) return;

    setIsCreating(true);
    setActionError(null);
    try {
      const created = await createPlaylist(trimmedName, newPlaylistDesc.trim());
      if (created) {
        setSelectedPlaylistId(created.id);
        setNewPlaylistName('');
        setNewPlaylistDesc('');
        setShowCreateModal(false);
      } else {
        setActionError('Could not create playlist.');
      }
    } catch (err) {
      console.error('Failed to create playlist:', err);
      setActionError(err instanceof Error ? err.message : 'Failed to create playlist.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleConfirmDelete = async (id: string) => {
    if (isDeleting) return;
    setIsDeleting(true);
    setActionError(null);
    try {
      await deletePlaylist(id);
      const remaining = useLibraryStore.getState().playlists;
      setSelectedPlaylistId(remaining.length > 0 ? remaining[0].id : null);
      setConfirmDeleteId(null);
    } catch (err) {
      console.error('Failed to delete playlist:', err);
      setActionError(err instanceof Error ? err.message : 'Failed to delete playlist.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleRemoveTrackFromActivePlaylist = async (trackId: string) => {
    if (!activePlaylistId || removingTrackId !== null) return;
    setRemovingTrackId(trackId);
    setActionError(null);
    try {
      await removeTrackFromPlaylist(activePlaylistId, trackId);
    } catch (err) {
      console.error('Failed to remove track from playlist:', err);
      setActionError(err instanceof Error ? err.message : 'Failed to remove track from playlist.');
    } finally {
      setRemovingTrackId(null);
    }
  };

  const handlePlayPlaylist = () => {
    if (activePlaylistTracks.length > 0) {
      playTrack(activePlaylistTracks[0], activePlaylistTracks);
    }
  };

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto p-8 flex flex-col gap-8 max-w-6xl mx-auto w-full select-none will-change-scroll"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2
            className="text-[10px] font-semibold uppercase tracking-widest mb-1 font-mono transition-colors"
            style={{ color: 'var(--accent-color, #FF2E55)' }}
          >
            USER PLAYLISTS
          </h2>
          <h1 className="text-3xl font-bold text-white tracking-tight">PLAYLISTS</h1>
          <p className="text-xs text-[#A3A3A3] mt-1 font-mono">
            {playlists.length} {playlists.length === 1 ? 'PLAYLIST' : 'PLAYLISTS'} CREATED
          </p>
        </div>

        <button
          ref={createBtnRef}
          type="button"
          onClick={() => {
            setActionError(null);
            setShowCreateModal(true);
          }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-xs font-semibold shadow-lg transition-all duration-200 hover:scale-102 active:scale-97 cursor-pointer"
          style={{
            backgroundColor: 'var(--accent-color, #FF2E55)',
            boxShadow: '0 0 16px var(--accent-glow, rgba(255, 46, 85, 0.35))',
          }}
        >
          <Plus className="w-4 h-4" />
          <span>NEW PLAYLIST</span>
        </button>
      </div>

      {actionError && !showCreateModal && (
        <div
          role="alert"
          className="bg-[#1F1012] border border-[#FF4D67]/30 px-4 py-3 rounded-xl flex items-center gap-2.5 text-xs text-[#FF4D67]"
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div
          className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn"
          onClick={(event) => {
            if (event.target === event.currentTarget && !isCreating) setShowCreateModal(false);
          }}
        >
          <div
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-playlist-title"
            className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-2xl p-6 w-96 flex flex-col gap-4 shadow-2xl animate-pageTransition"
          >
            <div className="flex items-center justify-between">
              <h3 id="create-playlist-title" className="text-base font-bold text-white">
                Create New Playlist
              </h3>
              <button
                type="button"
                onClick={() => !isCreating && setShowCreateModal(false)}
                className="text-[#666666] hover:text-white p-1 rounded-full hover:bg-[#151515] transition-all hover:scale-110 active:scale-90 cursor-pointer"
                aria-label="Close create playlist dialog"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={(e) => void handleCreate(e)} className="flex flex-col gap-4">
              {actionError && (
                <div
                  role="alert"
                  className="bg-[#1F1012] border border-[#FF4D67]/30 px-3 py-2 rounded-lg text-[11px] text-[#FF4D67]"
                >
                  {actionError}
                </div>
              )}
              <div>
                <label
                  htmlFor="new-playlist-name"
                  className="text-[10px] font-semibold text-[#666666] uppercase font-mono mb-1 block"
                >
                  PLAYLIST NAME
                </label>
                <input
                  id="new-playlist-name"
                  ref={nameInputRef}
                  type="text"
                  maxLength={120}
                  value={newPlaylistName}
                  onChange={(e) => setNewPlaylistName(e.target.value)}
                  placeholder="e.g. Chill Vibes..."
                  className="w-full bg-[#101010] border border-[#242424] rounded-xl px-4 py-2 text-xs text-white outline-none transition-all duration-200"
                />
              </div>
              <div>
                <label
                  htmlFor="new-playlist-desc"
                  className="text-[10px] font-semibold text-[#666666] uppercase font-mono mb-1 block"
                >
                  DESCRIPTION (OPTIONAL)
                </label>
                <input
                  id="new-playlist-desc"
                  type="text"
                  maxLength={300}
                  value={newPlaylistDesc}
                  onChange={(e) => setNewPlaylistDesc(e.target.value)}
                  placeholder="Short description..."
                  className="w-full bg-[#101010] border border-[#242424] rounded-xl px-4 py-2 text-xs text-white outline-none transition-all duration-200"
                />
              </div>
              <div className="flex justify-end gap-2 mt-2">
                <button
                  type="button"
                  disabled={isCreating}
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl text-xs text-[#A3A3A3] hover:text-white hover:bg-[#151515] transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newPlaylistName.trim() || isCreating}
                  className="px-4 py-2 rounded-xl text-white text-xs font-semibold shadow-md hover:scale-102 active:scale-97 disabled:opacity-50 disabled:pointer-events-none transition-all cursor-pointer"
                  style={{
                    backgroundColor: 'var(--accent-color, #FF2E55)',
                    boxShadow: '0 0 14px var(--accent-glow, rgba(255, 46, 85, 0.35))',
                  }}
                >
                  {isCreating ? 'Creating...' : 'Create Playlist'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Playlist Selector Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {playlists.map((pl) => {
          const isSelected = activePlaylist?.id === pl.id;
          return (
            <button
              type="button"
              key={pl.id}
              aria-pressed={isSelected}
              onClick={() => setSelectedPlaylistId(pl.id)}
              className={`w-full text-left p-4 rounded-2xl border flex flex-col gap-2 transition-all duration-200 ease-out cursor-pointer select-none group ${
                isSelected
                  ? 'bg-[#101010] -translate-y-0.5'
                  : 'bg-[#0A0A0A] border-[#1A1A1A] hover:-translate-y-1'
              }`}
              style={
                isSelected
                  ? {
                      borderColor: 'var(--accent-color, #FF2E55)',
                      boxShadow: '0 0 18px var(--accent-glow, rgba(255, 46, 85, 0.2))',
                    }
                  : undefined
              }
            >
              <div className="flex items-center justify-between">
                <div
                  className="w-8 h-8 rounded-lg bg-[#151515] border border-[#1A1A1A] flex items-center justify-center group-hover:scale-105 transition-transform"
                  style={{ color: 'var(--accent-color, #FF2E55)' }}
                >
                  <ListMusic className="w-4 h-4" />
                </div>
                <span className="text-[10px] font-mono text-[#666666]">
                  {pl.trackCount} {pl.trackCount === 1 ? 'SONG' : 'SONGS'}
                </span>
              </div>
              <h4
                className="text-xs font-bold truncate transition-colors"
                style={isSelected ? { color: 'var(--accent-color, #FF2E55)' } : { color: 'white' }}
              >
                {pl.name}
              </h4>
              {pl.description && (
                <p className="text-[11px] text-[#A3A3A3] truncate font-light">{pl.description}</p>
              )}
            </button>
          );
        })}
      </div>

      {/* Active Playlist Detail View */}
      {activePlaylist ? (
        <div className="flex flex-col gap-6 mt-2">
          <div className="flex items-end gap-6 bg-[#0A0A0A] border border-[#1A1A1A] p-6 rounded-2xl">
            <div className="w-40 h-40 rounded-xl overflow-hidden bg-[#101010] border border-[#1A1A1A] shrink-0 shadow-lg group">
              {activePlaylist.artworkPath && !imgError ? (
                <img
                  src={activePlaylist.artworkPath}
                  alt={activePlaylist.name}
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
                className="text-[10px] font-semibold uppercase tracking-widest font-mono"
                style={{ color: 'var(--accent-color, #FF2E55)' }}
              >
                SELECTED PLAYLIST
              </span>
              <h2 className="text-3xl font-bold text-white tracking-tight truncate">
                {activePlaylist.name}
              </h2>
              {activePlaylist.description && (
                <p className="text-xs text-[#A3A3A3] font-light">{activePlaylist.description}</p>
              )}
              <p className="text-xs text-[#666666] font-mono">
                {activePlaylistTracks.length}{' '}
                {activePlaylistTracks.length === 1 ? 'song' : 'songs'}
              </p>

              <div className="flex items-center gap-3 mt-2">
                <button
                  type="button"
                  onClick={handlePlayPlaylist}
                  disabled={activePlaylistTracks.length === 0}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl text-white text-xs font-semibold shadow-lg transition-all duration-200 hover:scale-102 active:scale-97 disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                  style={{
                    backgroundColor: 'var(--accent-color, #FF2E55)',
                    boxShadow: '0 0 16px var(--accent-glow, rgba(255, 46, 85, 0.35))',
                  }}
                >
                  <Play className="w-4 h-4 fill-white translate-x-0.5" />
                  <span>Play Playlist</span>
                </button>

                {confirmDeleteId === activePlaylist.id ? (
                  <div className="flex items-center gap-2 bg-[#151515] border border-[#FF4D67]/40 rounded-xl px-3 py-1.5 animate-fadeIn">
                    <span className="text-[11px] text-[#EDEDED]">Delete playlist?</span>
                    <button
                      type="button"
                      disabled={isDeleting}
                      onClick={() => void handleConfirmDelete(activePlaylist.id)}
                      className="px-2.5 py-1 rounded-lg bg-[#FF4D67] text-white text-[11px] font-semibold hover:bg-[#ff647b] disabled:opacity-50 cursor-pointer"
                    >
                      {isDeleting ? 'Deleting...' : 'Confirm'}
                    </button>
                    <button
                      type="button"
                      disabled={isDeleting}
                      onClick={() => setConfirmDeleteId(null)}
                      className="px-2 py-1 rounded-lg text-[11px] text-[#A3A3A3] hover:text-white cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(activePlaylist.id)}
                    className="p-2 rounded-xl bg-[#101010] border border-[#1A1A1A] text-[#FF4D67] hover:bg-[#FF4D67]/10 hover:border-[#FF4D67]/30 transition-all duration-150 hover:scale-105 active:scale-95 cursor-pointer"
                    title="Delete playlist"
                    aria-label={`Delete playlist ${activePlaylist.name}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <div className="grid grid-cols-12 px-4 py-2 text-[10px] font-semibold text-[#666666] uppercase tracking-widest font-mono border-b border-[#1A1A1A]">
              <div className="col-span-1">#</div>
              <div className="col-span-4">TITLE</div>
              <div className="col-span-3">ARTIST</div>
              <div className="col-span-2">ALBUM</div>
              <div className="col-span-2 text-right">TIME / TYPE</div>
            </div>

            {tracksError ? (
              <div
                role="alert"
                className="py-10 text-center bg-[#1F1012] border border-[#FF4D67]/30 rounded-xl text-xs text-[#FF4D67]"
              >
                {tracksError}
              </div>
            ) : isLoadingTracks && activePlaylistTracks.length === 0 ? (
              <div className="py-12 text-center bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl text-xs text-[#666666]">
                Loading playlist tracks...
              </div>
            ) : activePlaylistTracks.length > 0 ? (
              <VirtualTrackList
                tracks={activePlaylistTracks}
                queueContext={activePlaylistTracks}
                scrollRef={scrollRef}
                onRemoveTrack={(track) => {
                  void handleRemoveTrackFromActivePlaylist(track.id);
                }}
                removeLabel="Remove from playlist"
              />
            ) : (
              <div className="py-12 text-center bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl text-xs text-[#666666]">
                This playlist has no songs yet. Hover over any track in Tracks or Albums and click
                the <strong className="text-white">+ icon</strong> to add it to this playlist.
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="py-12 text-center bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl text-xs text-[#666666]">
          No playlists created yet. Click "NEW PLAYLIST" to create one.
        </div>
      )}
    </div>
  );
};

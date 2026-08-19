import React, { useState, useEffect } from 'react';
import { Plus, Play, Trash2, Disc, ListMusic, X } from 'lucide-react';
import { useLibraryStore } from '../stores/useLibraryStore';
import { usePlayerStore } from '../stores/usePlayerStore';
import { Playlist, Track } from '../../shared/types';
import { TrackRow } from '../components/TrackRow';

export const Playlists: React.FC = () => {
  const {
    playlists,
    createPlaylist,
    deletePlaylist,
    removeTrackFromPlaylist,
    selectedPlaylistId,
    setSelectedPlaylistId,
  } = useLibraryStore();
  const { playTrack } = usePlayerStore();

  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [newPlaylistDesc, setNewPlaylistDesc] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [activePlaylistTracks, setActivePlaylistTracks] = useState<Track[]>([]);

  // Default to first playlist if none selected
  const activePlaylist =
    playlists.find((p) => p.id === selectedPlaylistId) || playlists[0];

  useEffect(() => {
    if (activePlaylist && window.electronAPI) {
      window.electronAPI.getPlaylistTracks(activePlaylist.id).then((tracks) => {
        setActivePlaylistTracks(tracks);
      });
    }
  }, [activePlaylist, playlists]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlaylistName.trim()) return;
    const created = await createPlaylist(newPlaylistName.trim(), newPlaylistDesc.trim());
    if (created) {
      setSelectedPlaylistId(created.id);
      setNewPlaylistName('');
      setNewPlaylistDesc('');
      setShowCreateModal(false);
    }
  };

  const handleDelete = async (id: string) => {
    await deletePlaylist(id);
    const remaining = playlists.filter((p) => p.id !== id);
    if (remaining.length > 0) {
      setSelectedPlaylistId(remaining[0].id);
    } else {
      setSelectedPlaylistId(null);
    }
  };

  const handleRemoveTrackFromActivePlaylist = async (trackId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!activePlaylist) return;
    await removeTrackFromPlaylist(activePlaylist.id, trackId);
    if (window.electronAPI) {
      const updated = await window.electronAPI.getPlaylistTracks(activePlaylist.id);
      setActivePlaylistTracks(updated);
    }
  };

  const handlePlayPlaylist = () => {
    if (activePlaylistTracks.length > 0) {
      playTrack(activePlaylistTracks[0], activePlaylistTracks);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-8 flex flex-col gap-8 max-w-6xl mx-auto w-full select-none">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[10px] font-semibold text-[#FF2E55] uppercase tracking-widest mb-1 font-mono">
            USER PLAYLISTS
          </h2>
          <h1 className="text-3xl font-bold text-white tracking-tight">PLAYLISTS</h1>
          <p className="text-xs text-[#A3A3A3] mt-1 font-mono">{playlists.length} PLAYLISTS CREATED</p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#FF2E55] hover:bg-[#FF4568] text-white text-xs font-semibold shadow-lg shadow-[#FF2E55]/30 hover:shadow-xl hover:shadow-[#FF2E55]/50 transition-all duration-200 hover:scale-102 active:scale-97 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>NEW PLAYLIST</span>
        </button>
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-2xl p-6 w-96 flex flex-col gap-4 shadow-2xl animate-pageTransition">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white">Create New Playlist</h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-[#666666] hover:text-white p-1 rounded-full hover:bg-[#151515] transition-all hover:scale-110 active:scale-90"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="flex flex-col gap-4">
              <div>
                <label className="text-[10px] font-semibold text-[#666666] uppercase font-mono mb-1 block">
                  PLAYLIST NAME
                </label>
                <input
                  type="text"
                  value={newPlaylistName}
                  onChange={(e) => setNewPlaylistName(e.target.value)}
                  placeholder="e.g. Chill Vibes..."
                  autoFocus
                  className="w-full bg-[#101010] border border-[#242424] focus:border-[#FF2E55] focus:shadow-md focus:shadow-[#FF2E55]/10 rounded-xl px-4 py-2 text-xs text-white outline-none transition-all duration-200"
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-[#666666] uppercase font-mono mb-1 block">
                  DESCRIPTION (OPTIONAL)
                </label>
                <input
                  type="text"
                  value={newPlaylistDesc}
                  onChange={(e) => setNewPlaylistDesc(e.target.value)}
                  placeholder="Short description..."
                  className="w-full bg-[#101010] border border-[#242424] focus:border-[#FF2E55] focus:shadow-md focus:shadow-[#FF2E55]/10 rounded-xl px-4 py-2 text-xs text-white outline-none transition-all duration-200"
                />
              </div>
              <div className="flex justify-end gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl text-xs text-[#A3A3A3] hover:text-white hover:bg-[#151515] transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-[#FF2E55] hover:bg-[#FF4568] text-white text-xs font-semibold shadow-md shadow-[#FF2E55]/30 hover:scale-102 active:scale-97 transition-all cursor-pointer"
                >
                  Create Playlist
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Playlist Selector Cards */}
      <div className="grid grid-cols-4 gap-4">
        {playlists.map((pl) => {
          const isSelected = activePlaylist?.id === pl.id;
          return (
            <div
              key={pl.id}
              onClick={() => setSelectedPlaylistId(pl.id)}
              className={`p-4 rounded-2xl border flex flex-col gap-2 transition-all duration-200 ease-out cursor-pointer select-none group ${
                isSelected
                  ? 'bg-[#101010] border-[#FF2E55]/40 shadow-lg shadow-[#FF2E55]/10 -translate-y-0.5'
                  : 'bg-[#0A0A0A] border-[#1A1A1A] hover:border-[#FF2E55]/30 hover:shadow-lg hover:shadow-[#FF2E55]/5 hover:-translate-y-1'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="w-8 h-8 rounded-lg bg-[#151515] border border-[#1A1A1A] flex items-center justify-center text-[#FF2E55] group-hover:scale-105 transition-transform">
                  <ListMusic className="w-4 h-4" />
                </div>
                <span className="text-[10px] font-mono text-[#666666]">
                  {pl.trackCount} {pl.trackCount === 1 ? 'SONG' : 'SONGS'}
                </span>
              </div>
              <h4 className={`text-xs font-bold truncate transition-colors ${isSelected ? 'text-[#FF2E55]' : 'text-white group-hover:text-[#FF2E55]'}`}>
                {pl.name}
              </h4>
              {pl.description && (
                <p className="text-[11px] text-[#A3A3A3] truncate font-light">{pl.description}</p>
              )}
            </div>
          );
        })}
      </div>

      {/* Active Playlist Detail View */}
      {activePlaylist ? (
        <div className="flex flex-col gap-6 mt-2">
          <div className="flex items-end gap-6 bg-[#0A0A0A] border border-[#1A1A1A] p-6 rounded-2xl">
            <div className="w-40 h-40 rounded-xl overflow-hidden bg-[#101010] border border-[#1A1A1A] shrink-0 shadow-lg group">
              {activePlaylist.artworkPath ? (
                <img
                  src={activePlaylist.artworkPath}
                  alt={activePlaylist.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#151515] to-[#0A0A0A]">
                  <Disc className="w-12 h-12 text-[#FF2E55] opacity-80 group-hover:scale-105 transition-transform duration-300" />
                </div>
              )}
            </div>

            <div className="flex flex-col gap-3 min-w-0 flex-1">
              <span className="text-[10px] font-semibold text-[#FF2E55] uppercase tracking-widest font-mono">
                SELECTED PLAYLIST
              </span>
              <h2 className="text-3xl font-bold text-white tracking-tight truncate">
                {activePlaylist.name}
              </h2>
              {activePlaylist.description && (
                <p className="text-xs text-[#A3A3A3] font-light">{activePlaylist.description}</p>
              )}
              <p className="text-xs text-[#666666] font-mono">
                {activePlaylistTracks.length} songs
              </p>

              <div className="flex items-center gap-3 mt-2">
                <button
                  onClick={handlePlayPlaylist}
                  disabled={activePlaylistTracks.length === 0}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl bg-[#FF2E55] hover:bg-[#FF4568] text-white text-xs font-semibold shadow-lg shadow-[#FF2E55]/30 hover:shadow-xl hover:shadow-[#FF2E55]/50 transition-all duration-200 hover:scale-102 active:scale-97 disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-white translate-x-0.5" />
                  <span>Play Playlist</span>
                </button>
                <button
                  onClick={() => handleDelete(activePlaylist.id)}
                  className="p-2 rounded-xl bg-[#101010] border border-[#1A1A1A] text-[#FF4D67] hover:bg-[#FF4D67]/10 hover:border-[#FF4D67]/30 transition-all duration-150 hover:scale-105 active:scale-95 cursor-pointer"
                  title="Delete playlist"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <div className="grid grid-cols-12 px-4 py-2 text-[10px] font-semibold text-[#666666] uppercase tracking-widest font-mono border-b border-[#1A1A1A]">
              <div className="col-span-1">#</div>
              <div className="col-span-4">TITLE</div>
              <div className="col-span-3">ARTIST</div>
              <div className="col-span-2">ALBUM</div>
              <div className="col-span-2 text-right">TIME</div>
            </div>

            {activePlaylistTracks.length > 0 ? (
              activePlaylistTracks.map((track, idx) => (
                <div key={track.id} className="relative group">
                  <TrackRow track={track} index={idx} queueContext={activePlaylistTracks} />
                  <button
                    onClick={(e) => handleRemoveTrackFromActivePlaylist(track.id, e)}
                    className="absolute right-24 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 text-[#FF4D67] hover:text-red-400 p-1 font-mono text-[10px]"
                    title="Remove from playlist"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            ) : (
              <div className="py-12 text-center bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl text-xs text-[#666666]">
                This playlist has no songs yet. Hover over any track in Tracks or Albums and click the <strong className="text-white">+ icon</strong> to add it to this playlist.
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

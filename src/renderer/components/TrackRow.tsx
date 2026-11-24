import React, { useState, memo, useRef, useEffect } from 'react';
import { Play, Pause, Heart, ListPlus, Check, Disc, Trash2 } from 'lucide-react';
import { Track } from '../../shared/types';
import { usePlayerStore } from '../stores/usePlayerStore';
import { useLibraryStore } from '../stores/useLibraryStore';

interface TrackRowProps {
  track: Track;
  index: number;
  queueContext?: Track[];
  onPlay?: (track: Track, index: number) => void;
  onRemove?: (track: Track, index: number) => void;
  removeLabel?: string;
}

interface TrackPlaylistMenuProps {
  trackId: string;
  menuId: string;
  openUpward: boolean;
  onClose: () => void;
}

function formatDuration(secs: number): string {
  if (!Number.isFinite(secs) || secs < 0) return '0:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export const TrackPlaylistMenu: React.FC<TrackPlaylistMenuProps> = ({
  trackId,
  menuId,
  openUpward,
  onClose,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playlists = useLibraryStore((state) => state.playlists);
  const addTrackToPlaylist = useLibraryStore((state) => state.addTrackToPlaylist);
  const [addedPlaylistId, setAddedPlaylistId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        !(e.target as HTMLElement).closest('[data-playlist-trigger]')
      ) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [onClose]);

  const handleAddToPlaylist = async (playlistId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (isAdding) return;

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    setIsAdding(true);
    setErrorMsg(null);
    try {
      await addTrackToPlaylist(playlistId, trackId);
      setAddedPlaylistId(playlistId);
      timeoutRef.current = setTimeout(() => {
        setAddedPlaylistId(null);
        onClose();
      }, 800);
    } catch (err) {
      console.error('Failed to add track to playlist:', err);
      setErrorMsg('Failed to add');
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div
      id={menuId}
      ref={menuRef}
      role="menu"
      aria-label="Add to playlist"
      onClick={(e) => e.stopPropagation()}
      className={`absolute right-0 w-48 bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl shadow-2xl z-50 p-1 flex flex-col gap-1 text-xs animate-fadeIn max-h-56 overflow-y-auto ${
        openUpward ? 'bottom-full mb-1' : 'top-full mt-1'
      }`}
    >
      <div className="px-2 py-1 text-[10px] font-semibold text-[#666666] uppercase font-mono border-b border-[#1A1A1A]">
        ADD TO PLAYLIST
      </div>
      {errorMsg && (
        <div role="alert" className="px-2 py-1 text-[11px] text-[#FF4D67]">
          {errorMsg}
        </div>
      )}
      {playlists.length === 0 ? (
        <div className="px-2 py-2 text-[11px] text-[#666666] italic text-center">
          No playlists yet
        </div>
      ) : (
        playlists.map((pl) => (
          <button
            key={pl.id}
            type="button"
            role="menuitem"
            disabled={isAdding}
            onClick={(e) => void handleAddToPlaylist(pl.id, e)}
            className="flex items-center justify-between px-2 py-1.5 rounded-md text-left text-[#A3A3A3] hover:text-white hover:bg-[#151515] transition-colors active:scale-95 disabled:opacity-60"
          >
            <span className="truncate">{pl.name}</span>
            {addedPlaylistId === pl.id && <Check className="w-3.5 h-3.5 text-[#5FE39A] animate-fadeIn shrink-0" />}
          </button>
        ))
      )}
    </div>
  );
};
TrackPlaylistMenu.displayName = 'TrackPlaylistMenu';

export const TrackRow: React.FC<TrackRowProps> = memo(
  ({ track, index, queueContext, onPlay, onRemove, removeLabel }) => {
    const isCurrent = usePlayerStore((state) => state.currentTrack?.id === track.id);
    const isCurrentPlaying = usePlayerStore(
      (state) => state.currentTrack?.id === track.id && state.isPlaying
    );
    const playTrack = usePlayerStore((state) => state.playTrack);
    const togglePlay = usePlayerStore((state) => state.togglePlay);
    const toggleFavorite = useLibraryStore((state) => state.toggleFavorite);
    const isFavorite = useLibraryStore((state) => Boolean(state.favoriteIdMap[track.id]));

    const [showPlaylistMenu, setShowPlaylistMenu] = useState(false);
    const [openMenuUpward, setOpenMenuUpward] = useState(false);
    const [imgError, setImgError] = useState(false);
    const triggerRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
      setImgError(false);
    }, [track.artworkPath]);

    const handleRowClick = () => {
      if (onPlay) {
        onPlay(track, index);
        return;
      }
      if (isCurrent) {
        togglePlay();
      } else {
        playTrack(track, queueContext);
      }
    };

    const handleToggleMenu = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!showPlaylistMenu && triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        const scrollParent = triggerRef.current.closest('.overflow-y-auto');
        const bottomEdge = scrollParent
          ? scrollParent.getBoundingClientRect().bottom
          : window.innerHeight;
        setOpenMenuUpward(bottomEdge - rect.bottom < 220);
      }
      setShowPlaylistMenu((prev) => !prev);
    };

    const menuId = `track-playlist-menu-${track.id}-${index}`;

    return (
      <div
        role="button"
        tabIndex={0}
        aria-label={`Play ${track.title} by ${track.artist}`}
        onClick={handleRowClick}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            handleRowClick();
          }
        }}
        className={`grid grid-cols-12 items-center px-4 py-2.5 rounded-xl text-xs transition-all duration-150 ease-out group cursor-pointer select-none border relative h-[50px] ${
          isCurrent
            ? 'bg-[#101010] text-white shadow-sm'
            : 'bg-transparent border-transparent hover:bg-[#0A0A0A] hover:border-[#1A1A1A] text-[#A3A3A3] hover:text-[#EDEDED]'
        }`}
        style={
          isCurrent
            ? {
                borderColor: 'var(--accent-glow, rgba(255, 46, 85, 0.35))',
              }
            : undefined
        }
      >
        {/* Index / Play Icon */}
        <div className="col-span-1 flex items-center justify-start text-[#666666] font-mono text-xs">
          {isCurrent ? (
            <div className="flex items-center gap-1">
              {isCurrentPlaying ? (
                <Pause
                  className="w-3.5 h-3.5 animate-pulse"
                  style={{
                    color: 'var(--accent-color, #FF2E55)',
                    fill: 'var(--accent-color, #FF2E55)',
                  }}
                />
              ) : (
                <Play
                  className="w-3.5 h-3.5"
                  style={{
                    color: 'var(--accent-color, #FF2E55)',
                    fill: 'var(--accent-color, #FF2E55)',
                  }}
                />
              )}
            </div>
          ) : (
            <>
              <span className="group-hover:hidden transition-opacity">
                {String(index + 1).padStart(2, '0')}
              </span>
              <Play className="w-3.5 h-3.5 hidden group-hover:block text-white fill-white transform group-hover:scale-110 transition-transform" />
            </>
          )}
        </div>

        {/* Title */}
        <div className="col-span-4 flex items-center gap-3 pr-2 min-w-0">
          {track.artworkPath && !imgError ? (
            <img
              src={track.artworkPath}
              alt={track.title}
              loading="lazy"
              onError={() => setImgError(true)}
              className="w-7 h-7 rounded object-cover border border-[#1A1A1A] shrink-0 group-hover:scale-105 transition-transform duration-200"
            />
          ) : track.artworkPath ? (
            <div className="w-7 h-7 rounded bg-[#151515] border border-[#1A1A1A] shrink-0 flex items-center justify-center">
              <Disc className="w-3.5 h-3.5 text-[#666666]" />
            </div>
          ) : null}
          <span
            className="font-medium truncate transition-colors duration-150"
            style={isCurrent ? { color: 'var(--accent-color, #FF2E55)' } : undefined}
          >
            {track.title}
          </span>
        </div>

        {/* Artist */}
        <div className="col-span-3 truncate pr-2 text-[#A3A3A3] group-hover:text-[#EDEDED] transition-colors">
          {track.artist}
        </div>

        {/* Album */}
        <div className="col-span-2 truncate pr-2 text-[#666666] group-hover:text-[#A3A3A3] transition-colors">
          {track.album}
        </div>

        {/* Duration, Format & Actions */}
        <div className="col-span-2 flex items-center justify-end gap-1.5 font-mono relative min-w-0">
          <span className="text-[#666666] mr-0.5 shrink-0">{formatDuration(track.duration)}</span>
          <span
            className={`px-1.5 py-0.5 rounded text-[10px] uppercase border transition-colors shrink-0 ${
              track.codec === 'FLAC'
                ? 'bg-[#151515]'
                : 'bg-[#0A0A0A] border-[#1A1A1A] text-[#666666]'
            }`}
            style={
              track.codec === 'FLAC'
                ? {
                    borderColor: 'var(--accent-glow, rgba(255, 46, 85, 0.3))',
                    color: 'var(--accent-color, #FF2E55)',
                  }
                : undefined
            }
          >
            {track.codec}
          </span>

          {/* Add to Playlist Button & Dropdown */}
          <div className="relative shrink-0">
            <button
              ref={triggerRef}
              type="button"
              data-playlist-trigger="true"
              aria-haspopup="menu"
              aria-expanded={showPlaylistMenu}
              aria-controls={showPlaylistMenu ? menuId : undefined}
              onClick={handleToggleMenu}
              className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-[#666666] hover:text-white p-1 rounded hover:bg-[#151515] transition-all duration-150 hover:scale-110 active:scale-90"
              title="Add to playlist"
              aria-label={`Add ${track.title} to a playlist`}
            >
              <ListPlus className="w-3.5 h-3.5" />
            </button>

            {showPlaylistMenu && (
              <TrackPlaylistMenu
                trackId={track.id}
                menuId={menuId}
                openUpward={openMenuUpward}
                onClose={() => setShowPlaylistMenu(false)}
              />
            )}
          </div>

          {/* Favorite Heart Button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              void toggleFavorite(track.id).catch((err) => {
                console.error('Failed to toggle favorite:', err);
              });
            }}
            className={`p-1 rounded hover:bg-[#151515] transition-all duration-150 hover:scale-125 active:scale-90 shrink-0 ${
              isFavorite
                ? 'opacity-100'
                : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-[#666666]'
            }`}
            title="Favorite"
            aria-label={`${isFavorite ? 'Remove' : 'Add'} ${track.title} ${isFavorite ? 'from' : 'to'} favorites`}
            aria-pressed={isFavorite}
          >
            <Heart
              className={`w-3.5 h-3.5 transition-all duration-200 ${
                isFavorite ? 'opacity-100 scale-105' : ''
              }`}
              style={
                isFavorite
                  ? {
                      color: 'var(--accent-color, #FF2E55)',
                      fill: 'var(--accent-color, #FF2E55)',
                    }
                  : undefined
              }
            />
          </button>

          {/* Optional inline Remove button (e.g. Playlist / Queue) */}
          {onRemove && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(track, index);
              }}
              className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-[#FF4D67] hover:text-red-400 p-1 rounded hover:bg-[#151515] transition-all duration-150 hover:scale-110 active:scale-90 shrink-0"
              title={removeLabel || 'Remove'}
              aria-label={`${removeLabel || 'Remove'} ${track.title}`}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    );
  }
);

TrackRow.displayName = 'TrackRow';

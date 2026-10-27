import React, { useState, memo, useRef, useEffect } from 'react';
import { Play, Pause, Heart, ListPlus, Check } from 'lucide-react';
import { Track } from '../../shared/types';
import { usePlayerStore } from '../stores/usePlayerStore';
import { useLibraryStore } from '../stores/useLibraryStore';

interface TrackRowProps {
  track: Track;
  index: number;
  queueContext?: Track[];
}

interface TrackPlaylistMenuProps {
  trackId: string;
  onClose: () => void;
}

export const TrackPlaylistMenu: React.FC<TrackPlaylistMenuProps> = ({ trackId, onClose }) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playlists = useLibraryStore((state) => state.playlists);
  const addTrackToPlaylist = useLibraryStore((state) => state.addTrackToPlaylist);
  const [addedPlaylistId, setAddedPlaylistId] = useState<string | null>(null);

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
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [onClose]);

  const handleAddToPlaylist = async (playlistId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await addTrackToPlaylist(playlistId, trackId);
    setAddedPlaylistId(playlistId);
    timeoutRef.current = setTimeout(() => {
      setAddedPlaylistId(null);
      onClose();
    }, 800);
  };

  return (
    <div
      ref={menuRef}
      onClick={(e) => e.stopPropagation()}
      className="absolute right-0 top-full mt-1 w-48 bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl shadow-2xl z-50 p-1 flex flex-col gap-1 text-xs animate-fadeIn"
    >
      <div className="px-2 py-1 text-[10px] font-semibold text-[#666666] uppercase font-mono border-b border-[#1A1A1A]">
        ADD TO PLAYLIST
      </div>
      {playlists.length === 0 ? (
        <div className="px-2 py-2 text-[11px] text-[#666666] italic text-center">
          No playlists yet
        </div>
      ) : (
        playlists.map((pl) => (
          <button
            key={pl.id}
            onClick={(e) => handleAddToPlaylist(pl.id, e)}
            className="flex items-center justify-between px-2 py-1.5 rounded-md text-left text-[#A3A3A3] hover:text-white hover:bg-[#151515] transition-colors active:scale-95"
          >
            <span className="truncate">{pl.name}</span>
            {addedPlaylistId === pl.id && <Check className="w-3.5 h-3.5 text-[#5FE39A] animate-fadeIn" />}
          </button>
        ))
      )}
    </div>
  );
};
TrackPlaylistMenu.displayName = 'TrackPlaylistMenu';

export const TrackRow: React.FC<TrackRowProps> = memo(({ track, index, queueContext }) => {
  const isCurrent = usePlayerStore((state) => state.currentTrack?.id === track.id);
  const isCurrentPlaying = usePlayerStore(
    (state) => state.currentTrack?.id === track.id && state.isPlaying
  );
  const playTrack = usePlayerStore((state) => state.playTrack);
  const togglePlay = usePlayerStore((state) => state.togglePlay);
  const toggleFavorite = useLibraryStore((state) => state.toggleFavorite);
  const [showPlaylistMenu, setShowPlaylistMenu] = useState(false);

  const formatDuration = (secs: number) => {
    if (!secs || isNaN(secs)) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handleRowClick = () => {
    if (isCurrent) {
      togglePlay();
    } else {
      playTrack(track, queueContext);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
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
            <span className="group-hover:hidden transition-opacity">{String(index + 1).padStart(2, '0')}</span>
            <Play className="w-3.5 h-3.5 hidden group-hover:block text-white fill-white transform group-hover:scale-110 transition-transform" />
          </>
        )}
      </div>

      {/* Title */}
      <div className="col-span-4 flex items-center gap-3 pr-2 min-w-0">
        {track.artworkPath && (
          <img
            src={track.artworkPath}
            alt={track.title}
            className="w-7 h-7 rounded object-cover border border-[#1A1A1A] shrink-0 group-hover:scale-105 transition-transform duration-200"
          />
        )}
        <span
          className="font-medium truncate transition-colors duration-150"
          style={isCurrent ? { color: 'var(--accent-color, #FF2E55)' } : undefined}
        >
          {track.title}
        </span>
      </div>

      {/* Artist */}
      <div className="col-span-3 truncate pr-2 text-[#A3A3A3] group-hover:text-[#EDEDED] transition-colors">{track.artist}</div>

      {/* Album */}
      <div className="col-span-2 truncate pr-2 text-[#666666] group-hover:text-[#A3A3A3] transition-colors">{track.album}</div>

      {/* Duration, Format & Actions */}
      <div className="col-span-2 flex items-center justify-end gap-2 font-mono relative">
        <span className="text-[#666666] mr-1">{formatDuration(track.duration)}</span>
        <span
          className={`px-1.5 py-0.5 rounded text-[10px] uppercase border transition-colors ${
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
        <div className="relative">
          <button
            data-playlist-trigger="true"
            onClick={(e) => {
              e.stopPropagation();
              setShowPlaylistMenu(!showPlaylistMenu);
            }}
            className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-[#666666] hover:text-white p-1 rounded hover:bg-[#151515] transition-all duration-150 hover:scale-110 active:scale-90"
            title="Add to playlist"
            aria-label={`Add ${track.title} to a playlist`}
          >
            <ListPlus className="w-3.5 h-3.5" />
          </button>

          {showPlaylistMenu && (
            <TrackPlaylistMenu trackId={track.id} onClose={() => setShowPlaylistMenu(false)} />
          )}
        </div>

        {/* Favorite Heart Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleFavorite(track.id);
          }}
          className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-[#666666] p-1 rounded hover:bg-[#151515] transition-all duration-150 hover:scale-125 active:scale-90"
          title="Favorite"
          aria-label={`${track.isFavorite ? 'Remove' : 'Add'} ${track.title} ${track.isFavorite ? 'from' : 'to'} favorites`}
        >
          <Heart
            className={`w-3.5 h-3.5 transition-all duration-200 ${
              track.isFavorite ? 'opacity-100 scale-105' : ''
            }`}
            style={
              track.isFavorite
                ? {
                    color: 'var(--accent-color, #FF2E55)',
                    fill: 'var(--accent-color, #FF2E55)',
                  }
                : undefined
            }
          />
        </button>
      </div>
    </div>
  );
});

TrackRow.displayName = 'TrackRow';

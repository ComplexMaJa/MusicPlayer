import React, { useState } from 'react';
import { Play, Pause, Heart, ListPlus, Check } from 'lucide-react';
import { Track } from '../../shared/types';
import { usePlayerStore } from '../stores/usePlayerStore';
import { useLibraryStore } from '../stores/useLibraryStore';

interface TrackRowProps {
  track: Track;
  index: number;
  queueContext?: Track[];
}

export const TrackRow: React.FC<TrackRowProps> = ({ track, index, queueContext }) => {
  const { currentTrack, isPlaying, playTrack, togglePlay } = usePlayerStore();
  const { toggleFavorite, playlists, addTrackToPlaylist } = useLibraryStore();
  const [showPlaylistMenu, setShowPlaylistMenu] = useState(false);
  const [addedPlaylistId, setAddedPlaylistId] = useState<string | null>(null);

  const isCurrent = currentTrack?.id === track.id;

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

  const handleAddToPlaylist = async (playlistId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await addTrackToPlaylist(playlistId, track.id);
    setAddedPlaylistId(playlistId);
    setTimeout(() => {
      setAddedPlaylistId(null);
      setShowPlaylistMenu(false);
    }, 800);
  };

  return (
    <div
      onClick={handleRowClick}
      className={`grid grid-cols-12 items-center px-4 py-2.5 rounded-xl text-xs transition-all duration-150 ease-out group cursor-pointer select-none border relative ${
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
            {isPlaying ? (
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
            onClick={(e) => {
              e.stopPropagation();
              setShowPlaylistMenu(!showPlaylistMenu);
            }}
            className="opacity-0 group-hover:opacity-100 text-[#666666] hover:text-white p-1 rounded hover:bg-[#151515] transition-all duration-150 hover:scale-110 active:scale-90"
            title="Add to playlist"
          >
            <ListPlus className="w-3.5 h-3.5" />
          </button>

          {showPlaylistMenu && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="absolute right-0 top-full mt-1 w-48 bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl shadow-2xl z-50 p-1 flex flex-col gap-1 text-xs animate-fadeIn"
            >
              <div className="px-2 py-1 text-[10px] font-semibold text-[#666666] uppercase font-mono border-b border-[#1A1A1A]">
                ADD TO PLAYLIST
              </div>
              {playlists.map((pl) => (
                <button
                  key={pl.id}
                  onClick={(e) => handleAddToPlaylist(pl.id, e)}
                  className="flex items-center justify-between px-2 py-1.5 rounded-md text-left text-[#A3A3A3] hover:text-white hover:bg-[#151515] transition-colors active:scale-95"
                >
                  <span className="truncate">{pl.name}</span>
                  {addedPlaylistId === pl.id && <Check className="w-3.5 h-3.5 text-[#5FE39A] animate-fadeIn" />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Favorite Heart Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleFavorite(track.id);
          }}
          className="opacity-0 group-hover:opacity-100 text-[#666666] p-1 rounded hover:bg-[#151515] transition-all duration-150 hover:scale-125 active:scale-90"
          title="Favorite"
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
};

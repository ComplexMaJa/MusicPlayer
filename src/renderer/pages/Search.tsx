import React, { useState } from 'react';
import { Search as SearchIcon, Disc, User, Music, ListMusic } from 'lucide-react';
import { useLibraryStore } from '../stores/useLibraryStore';
import { usePlayerStore } from '../stores/usePlayerStore';
import { TrackRow } from '../components/TrackRow';
import { AlbumCard } from '../components/AlbumCard';
import { ArtistCard } from '../components/ArtistCard';

export const Search: React.FC = () => {
  const { searchQuery, setSearchQuery, tracks, albums, artists, playlists } = useLibraryStore();
  const [activeTab, setActiveTab] = useState<'all' | 'songs' | 'artists' | 'albums' | 'playlists'>('all');

  const query = searchQuery.toLowerCase().trim();

  const filteredTracks = query ? tracks.filter((t) => t.title.toLowerCase().includes(query) || t.artist.toLowerCase().includes(query)) : [];
  const filteredAlbums = query ? albums.filter((a) => a.title.toLowerCase().includes(query) || a.artist.toLowerCase().includes(query)) : [];
  const filteredArtists = query ? artists.filter((a) => a.name.toLowerCase().includes(query)) : [];
  const filteredPlaylists = query ? playlists.filter((p) => p.name.toLowerCase().includes(query)) : [];

  return (
    <div className="flex-1 overflow-y-auto p-8 flex flex-col gap-6 max-w-6xl mx-auto w-full select-none">
      {/* Search Header */}
      <div className="flex flex-col gap-4">
        <h1 className="text-3xl font-bold text-white tracking-tight">SEARCH</h1>

        {/* Tab Buttons matching Screen #7 */}
        <div className="flex items-center gap-2 border-b border-[#1A1A1A] pb-3">
          {[
            { id: 'all', label: 'All Results' },
            { id: 'songs', label: 'Songs' },
            { id: 'artists', label: 'Artists' },
            { id: 'albums', label: 'Albums' },
            { id: 'playlists', label: 'Playlists' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer ${
                activeTab === tab.id
                  ? 'text-white shadow-md'
                  : 'bg-[#0A0A0A] text-[#A3A3A3] hover:text-white border border-[#1A1A1A] hover:border-[#2E2E2E]'
              }`}
              style={
                activeTab === tab.id
                  ? {
                      backgroundColor: 'var(--accent-color, #FF2E55)',
                      boxShadow: '0 0 12px var(--accent-glow, rgba(255, 46, 85, 0.35))',
                    }
                  : undefined
              }
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {query ? (
        <div className="flex flex-col gap-8">
          {/* Songs Results */}
          {(activeTab === 'all' || activeTab === 'songs') && filteredTracks.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="text-[11px] font-semibold text-[#666666] uppercase tracking-widest font-mono">
                SONGS ({filteredTracks.length})
              </h2>
              <div className="flex flex-col gap-1">
                {filteredTracks.slice(0, 8).map((track, idx) => (
                  <TrackRow key={track.id} track={track} index={idx} queueContext={filteredTracks} />
                ))}
              </div>
            </section>
          )}

          {/* Artists Results */}
          {(activeTab === 'all' || activeTab === 'artists') && filteredArtists.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="text-[11px] font-semibold text-[#666666] uppercase tracking-widest font-mono">
                ARTISTS ({filteredArtists.length})
              </h2>
              <div className="grid grid-cols-5 gap-4">
                {filteredArtists.slice(0, 5).map((artist) => (
                  <ArtistCard key={artist.id} artist={artist} />
                ))}
              </div>
            </section>
          )}

          {/* Albums Results */}
          {(activeTab === 'all' || activeTab === 'albums') && filteredAlbums.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="text-[11px] font-semibold text-[#666666] uppercase tracking-widest font-mono">
                ALBUMS ({filteredAlbums.length})
              </h2>
              <div className="grid grid-cols-5 gap-4">
                {filteredAlbums.slice(0, 5).map((album) => (
                  <AlbumCard key={album.id} album={album} />
                ))}
              </div>
            </section>
          )}

          {filteredTracks.length === 0 && filteredArtists.length === 0 && filteredAlbums.length === 0 && (
            <div className="py-16 text-center bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl text-xs text-[#666666]">
              No results found for "{searchQuery}".
            </div>
          )}
        </div>
      ) : (
        <div className="py-16 text-center bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl flex flex-col items-center gap-3 text-xs text-[#666666]">
          <SearchIcon className="w-8 h-8 text-[#333333]" />
          <p>Type in the top search bar to search for songs, artists, or albums.</p>
        </div>
      )}
    </div>
  );
};

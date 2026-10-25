import React, { useMemo, useState } from 'react';
import { Search as SearchIcon, ListMusic } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useLibraryStore } from '../stores/useLibraryStore';
import { TrackRow } from '../components/TrackRow';
import { AlbumCard } from '../components/AlbumCard';
import { ArtistCard } from '../components/ArtistCard';

type SearchTab = 'all' | 'songs' | 'artists' | 'albums' | 'playlists';

export const Search: React.FC = () => {
  const {
    searchQuery,
    tracks,
    albums,
    artists,
    playlists,
    setSelectedPlaylistId,
    setActiveView,
  } = useLibraryStore(
    useShallow((state) => ({
      searchQuery: state.searchQuery,
      tracks: state.tracks,
      albums: state.albums,
      artists: state.artists,
      playlists: state.playlists,
      setSelectedPlaylistId: state.setSelectedPlaylistId,
      setActiveView: state.setActiveView,
    }))
  );
  const [activeTab, setActiveTab] = useState<SearchTab>('all');

  const query = searchQuery.toLowerCase().trim();

  const { filteredTracks, filteredAlbums, filteredArtists, filteredPlaylists } = useMemo(() => {
    if (!query) {
      return {
        filteredTracks: [],
        filteredAlbums: [],
        filteredArtists: [],
        filteredPlaylists: [],
      };
    }

    return {
      filteredTracks: tracks.filter(
        (track) =>
          track.title.toLowerCase().includes(query) ||
          track.artist.toLowerCase().includes(query) ||
          track.album.toLowerCase().includes(query)
      ),
      filteredAlbums: albums.filter(
        (album) =>
          album.title.toLowerCase().includes(query) || album.artist.toLowerCase().includes(query)
      ),
      filteredArtists: artists.filter((artist) => artist.name.toLowerCase().includes(query)),
      filteredPlaylists: playlists.filter((playlist) =>
        playlist.name.toLowerCase().includes(query)
      ),
    };
  }, [albums, artists, playlists, query, tracks]);

  const visibleTracks =
    activeTab === 'all' ? filteredTracks.slice(0, 8) : filteredTracks;
  const visibleArtists =
    activeTab === 'all' ? filteredArtists.slice(0, 5) : filteredArtists;
  const visibleAlbums =
    activeTab === 'all' ? filteredAlbums.slice(0, 5) : filteredAlbums;
  const visiblePlaylists =
    activeTab === 'all' ? filteredPlaylists.slice(0, 5) : filteredPlaylists;

  const hasResults =
    activeTab === 'all'
      ? filteredTracks.length > 0 ||
        filteredArtists.length > 0 ||
        filteredAlbums.length > 0 ||
        filteredPlaylists.length > 0
      : activeTab === 'songs'
        ? filteredTracks.length > 0
        : activeTab === 'artists'
          ? filteredArtists.length > 0
          : activeTab === 'albums'
            ? filteredAlbums.length > 0
            : filteredPlaylists.length > 0;

  return (
    <div className="flex-1 overflow-y-auto p-8 flex flex-col gap-6 max-w-6xl mx-auto w-full select-none will-change-scroll">
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
              onClick={() => setActiveTab(tab.id as SearchTab)}
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
                {visibleTracks.map((track, idx) => (
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
                {visibleArtists.map((artist) => (
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
                {visibleAlbums.map((album) => (
                  <AlbumCard key={album.id} album={album} />
                ))}
              </div>
            </section>
          )}

          {/* Playlists Results */}
          {(activeTab === 'all' || activeTab === 'playlists') &&
            filteredPlaylists.length > 0 && (
              <section className="flex flex-col gap-3">
                <h2 className="text-[11px] font-semibold text-[#666666] uppercase tracking-widest font-mono">
                  PLAYLISTS ({filteredPlaylists.length})
                </h2>
                <div className="grid grid-cols-5 gap-4">
                  {visiblePlaylists.map((playlist) => (
                    <button
                      key={playlist.id}
                      onClick={() => {
                        setSelectedPlaylistId(playlist.id);
                        setActiveView('playlist-detail');
                      }}
                      className="p-4 rounded-2xl border border-[#1A1A1A] bg-[#0A0A0A] text-left transition-all duration-200 ease-out hover:-translate-y-1 hover:border-white/20 cursor-pointer"
                    >
                      <div
                        className="w-8 h-8 rounded-lg bg-[#151515] border border-[#1A1A1A] flex items-center justify-center mb-3"
                        style={{ color: 'var(--accent-color, #FF2E55)' }}
                      >
                        <ListMusic className="w-4 h-4" />
                      </div>
                      <h4 className="text-xs font-bold text-white truncate">{playlist.name}</h4>
                      <p className="text-[10px] font-mono text-[#666666] mt-1">
                        {playlist.trackCount} {playlist.trackCount === 1 ? 'SONG' : 'SONGS'}
                      </p>
                    </button>
                  ))}
                </div>
              </section>
            )}

          {!hasResults && (
            <div className="py-16 text-center bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl text-xs text-[#666666]">
              No results found for "{searchQuery}".
            </div>
          )}
        </div>
      ) : (
        <div className="py-16 text-center bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl flex flex-col items-center gap-3 text-xs text-[#666666]">
          <SearchIcon className="w-8 h-8 text-[#333333]" />
          <p>Type in the top search bar to search for songs, artists, albums, or playlists.</p>
        </div>
      )}
    </div>
  );
};

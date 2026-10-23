export interface Track {
  id: string;
  path: string;
  title: string;
  artist: string;
  album: string;
  albumArtist?: string;
  trackNumber?: number;
  discNumber?: number;
  genre?: string;
  year?: number;
  duration: number; // in seconds
  codec: string; // e.g. "FLAC", "MP3", "WAV", "OGG"
  sampleRate?: number; // e.g. 44100, 96000
  bitDepth?: number; // e.g. 16, 24
  bitrate?: number; // kbps
  channels?: number;
  artworkPath?: string; // file path or data URI
  dateAdded: number; // timestamp
  lastPlayed?: number; // timestamp
  playCount: number;
  isFavorite?: boolean;
}

export interface Album {
  id: string;
  title: string;
  artist: string;
  year?: number;
  artworkPath?: string;
  trackCount: number;
  totalDuration: number;
  tracks?: Track[];
}

export interface Artist {
  id: string;
  name: string;
  trackCount: number;
  albumCount: number;
  artworkPath?: string;
}

export interface Playlist {
  id: string;
  name: string;
  description?: string;
  trackCount: number;
  totalDuration: number;
  createdAt: number;
  updatedAt: number;
  artworkPath?: string;
}

export interface AudioFormatInfo {
  codec: string;
  sampleRate: number;
  bitDepth: number;
  channels: number;
  bitrate?: number;
}

export type LyricProviderOption = 'auto' | 'online' | 'embedded' | 'local';

export interface LyricLine {
  time: number; // in seconds
  text: string;
}

export interface LyricsResult {
  syncedLyrics: LyricLine[];
  plainLyrics?: string;
  source: 'local' | 'embedded' | 'online' | 'none';
  availableSources?: ('local' | 'embedded' | 'online')[];
  instrumental?: boolean;
}

export interface PlaybackState {
  isPlaying: boolean;
  isPaused: boolean;
  isMuted: boolean;
  volume: number;
  currentTime: number;
  duration: number;
  currentTrack: Track | null;
  queue: Track[];
  queueIndex: number;
  history: Track[];
  repeatMode: 'off' | 'all' | 'one';
  isShuffle: boolean;
  audioFormat: AudioFormatInfo | null;
}

export interface LibraryStats {
  trackCount: number;
  albumCount: number;
  artistCount: number;
  playlistCount: number;
  totalDuration: number;
  lastScanned?: number;
}

export interface ScanProgress {
  isScanning: boolean;
  totalFiles: number;
  processedFiles: number;
  currentFile?: string;
  error?: string;
}

export interface Settings {
  musicFolders: string[];
  volume: number;
  isMuted?: boolean;
  discordEnabled: boolean;
  discordClientId?: string;
  discordShowTrack: boolean;
  discordShowElapsed: boolean;
  discordLargeImage?: string;
  discordLargeImageText?: string;
  discordActivityType?: 'listening' | 'playing';
  accentColor: string;
  customBackgroundEnabled?: boolean;
  customBackgroundUrl?: string;
  customBackgroundOpacity?: number;
  customBackgroundBlur?: number;
  customBackgroundFit?: 'cover' | 'contain' | 'tile';
  reducedMotion: boolean;
  lyricsProvider?: LyricProviderOption;
}

export type ViewMode =
  | 'home'
  | 'library'
  | 'albums'
  | 'album-detail'
  | 'artists'
  | 'artist-detail'
  | 'tracks'
  | 'playlists'
  | 'playlist-detail'
  | 'queue'
  | 'search'
  | 'now-playing'
  | 'settings'
  | 'favorites';

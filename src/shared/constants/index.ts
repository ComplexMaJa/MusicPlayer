import { Settings } from '../types';

export const DEFAULT_SETTINGS: Settings = {
  musicFolders: [],
  outputDevice: 'Default (WASAPI)',
  outputMode: 'WASAPI Shared',
  exclusiveMode: false,
  gaplessPlayback: true,
  rememberPlaybackPosition: true,
  normalizeVolume: false,
  volume: 0.8,
  isMuted: false,
  discordEnabled: true,
  discordClientId: '463097721130188830',
  discordShowTrack: true,
  discordShowElapsed: true,
  discordLargeImage: 'logo',
  discordLargeImageText: '',
  discordActivityType: 'listening',
  amoledMode: true,
  accentColor: '#FF2E55',
  customBackgroundEnabled: false,
  customBackgroundUrl: '',
  customBackgroundOpacity: 0.3,
  customBackgroundBlur: 10,
  customBackgroundFit: 'cover',
  reducedMotion: false,
  startMinimized: false,
  lyricsProvider: 'auto',
};

export const SUPPORTED_EXTENSIONS = ['.flac', '.mp3', '.wav', '.ogg'];

export const THEME_COLORS = {
  bgPrimary: '#050505',
  bgSecondary: '#0A0A0A',
  surface: '#101010',
  surfaceElevated: '#151515',
  border: '#242424',
  borderSubtle: '#1A1A1A',
  textPrimary: '#EDEDED',
  textSecondary: '#A3A3A3',
  textMuted: '#666666',
  accent: '#FF2E55',
  accentHover: '#FF4568',
  success: '#5FE39A',
  warning: '#FFB84D',
  error: '#FF4D67',
};

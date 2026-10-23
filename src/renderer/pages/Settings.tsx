import React, { useState } from 'react';
import {
  Sliders,
  Volume2,
  Moon,
  Disc,
  FolderPlus,
  Trash2,
  Sparkles,
  Check,
  CheckCircle2,
  Pipette,
  Upload,
  Link as LinkIcon,
  Image as ImageIcon,
  Palette,
  RotateCcw,
  Mic2,
} from 'lucide-react';
import { useSettingsStore } from '../stores/useSettingsStore';
import { useLibraryStore } from '../stores/useLibraryStore';
import { usePlayerStore } from '../stores/usePlayerStore';
import { LyricProviderOption } from '../../shared/types';
import { ToggleSwitch } from '../components/ToggleSwitch';

export const SettingsPage: React.FC = () => {
  const settings = useSettingsStore((state) => state.settings);
  const updateSettings = useSettingsStore((state) => state.updateSettings);
  const scanFolders = useLibraryStore((state) => state.scanFolders);
  const setLyricProvider = usePlayerStore((state) => state.setLyricProvider);
  const currentTrack = usePlayerStore((state) => state.currentTrack);
  const audioFormat = usePlayerStore((state) => state.audioFormat);
  const [activeCategory, setActiveCategory] = useState<
    'playback' | 'discord' | 'appearance' | 'library'
  >('playback');
  const [showSavedToast, setShowSavedToast] = useState(false);
  const [bgTab, setBgTab] = useState<'file' | 'url' | 'presets'>('file');
  const [webUrlInput, setWebUrlInput] = useState('');

  const triggerToast = () => {
    setShowSavedToast(true);
    setTimeout(() => setShowSavedToast(false), 1500);
  };

  const handleUpdate = async (newSettings: Partial<typeof settings>) => {
    await updateSettings(newSettings);
    triggerToast();
  };

  const formatRate = (sampleRate?: number) => {
    if (!sampleRate) return '';
    return `${(sampleRate / 1000).toFixed(sampleRate % 1000 === 0 ? 0 : 1)}kHz`;
  };

  const previewSpecs = currentTrack
    ? [
        audioFormat?.codec || currentTrack.codec,
        (audioFormat?.bitDepth || currentTrack.bitDepth)
          ? `${audioFormat?.bitDepth || currentTrack.bitDepth}bit`
          : '',
        formatRate(audioFormat?.sampleRate || currentTrack.sampleRate),
      ]
        .filter(Boolean)
        .join(' • ')
    : '';

  const handleAddFolder = async () => {
    if (!window.electronAPI) return;
    const paths = await window.electronAPI.selectFolder();
    if (paths && paths.length > 0) {
      await scanFolders(paths);
      await handleUpdate({
        musicFolders: Array.from(new Set([...settings.musicFolders, ...paths])),
      });
    }
  };

  const handleRemoveFolder = async (folderPath: string) => {
    const updated = settings.musicFolders.filter((f) => f !== folderPath);
    await handleUpdate({ musicFolders: updated });
    if (updated.length > 0) {
      await scanFolders(updated);
    }
  };

  const handleSelectLocalImage = async () => {
    if (!window.electronAPI?.selectImage) return;
    const imgUrl = await window.electronAPI.selectImage();
    if (imgUrl) {
      await handleUpdate({
        customBackgroundEnabled: true,
        customBackgroundUrl: imgUrl,
      });
    }
  };

  const handleApplyWebUrl = async () => {
    if (!webUrlInput.trim()) return;
    await handleUpdate({
      customBackgroundEnabled: true,
      customBackgroundUrl: webUrlInput.trim(),
    });
    setWebUrlInput('');
  };

  const handleClearBackground = async () => {
    await handleUpdate({
      customBackgroundEnabled: false,
      customBackgroundUrl: '',
    });
  };

  const wallpaperPresets = [
    {
      name: 'Cyber Horizon',
      url: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=1600&auto=format&fit=crop',
      thumb: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=400&auto=format&fit=crop',
    },
    {
      name: 'Deep Space Nebula',
      url: 'https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?q=80&w=1600&auto=format&fit=crop',
      thumb: 'https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?q=80&w=400&auto=format&fit=crop',
    },
    {
      name: 'Abstract Dark Flow',
      url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1600&auto=format&fit=crop',
      thumb: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=400&auto=format&fit=crop',
    },
    {
      name: 'Neon Horizon',
      url: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?q=80&w=1600&auto=format&fit=crop',
      thumb: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?q=80&w=400&auto=format&fit=crop',
    },
  ];

  const accentColors = [
    { name: 'MaJa Crimson', hex: '#FF2E55' },
    { name: 'Neon Rose', hex: '#F43F5E' },
    { name: 'Cyber Amber', hex: '#F59E0B' },
    { name: 'Sunset Gold', hex: '#EAB308' },
    { name: 'Lime Pulse', hex: '#84CC16' },
    { name: 'Emerald Glow', hex: '#10B981' },
    { name: 'Cyberpunk Cyan', hex: '#06B6D4' },
    { name: 'Electric Blue', hex: '#3B82F6' },
    { name: 'Neon Violet', hex: '#8B5CF6' },
    { name: 'Orchid Purple', hex: '#A855F7' },
    { name: 'Hot Magenta', hex: '#EC4899' },
    { name: 'Pure Platinum', hex: '#F1F5F9' },
  ];

  return (
    <div className="flex-1 overflow-y-auto p-8 flex flex-col gap-8 max-w-5xl mx-auto w-full select-none relative">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2
            className="text-[10px] font-semibold uppercase tracking-widest mb-1 font-mono transition-colors"
            style={{ color: 'var(--accent-color, #FF2E55)' }}
          >
            PREFERENCES
          </h2>
          <h1 className="text-3xl font-bold text-white tracking-tight">SETTINGS</h1>
        </div>

        {/* Saved Toast Notification */}
        <div
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#101010] border text-xs font-mono transition-all duration-300 ${
            showSavedToast ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 pointer-events-none'
          }`}
          style={{
            borderColor: 'var(--accent-glow, rgba(255, 46, 85, 0.35))',
            color: 'var(--accent-color, #FF2E55)',
          }}
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>Setting Saved</span>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-8 items-start">
        {/* Left Navigation Tabs */}
        <div className="col-span-3 bg-[#0A0A0A] border border-[#1A1A1A] rounded-2xl p-2 flex flex-col gap-1 shadow-xl">
          {[
            { id: 'playback', label: 'Playback & Lyrics', icon: <Volume2 className="w-4 h-4" /> },
            { id: 'discord', label: 'Discord RPC', icon: <Disc className="w-4 h-4" /> },
            { id: 'appearance', label: 'Appearance', icon: <Moon className="w-4 h-4" /> },
            { id: 'library', label: 'Library & System', icon: <Sliders className="w-4 h-4" /> },
          ].map((cat) => {
            const isActive = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() =>
                  setActiveCategory(
                    cat.id as 'playback' | 'discord' | 'appearance' | 'library'
                  )
                }
                className={`flex items-center gap-3 px-3.5 py-3 rounded-xl text-xs font-medium transition-all duration-200 relative group cursor-pointer ${
                  isActive
                    ? 'bg-[#101010] font-semibold shadow-md'
                    : 'text-[#A3A3A3] hover:text-white hover:bg-[#0D0D0D] hover:translate-x-0.5'
                }`}
                style={
                  isActive
                    ? {
                        color: 'var(--accent-color, #FF2E55)',
                        borderColor: 'var(--accent-glow, rgba(255, 46, 85, 0.3))',
                        borderWidth: '1px',
                      }
                    : undefined
                }
              >
                {isActive && (
                  <div
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-r-full animate-fadeIn"
                    style={{
                      backgroundColor: 'var(--accent-color, #FF2E55)',
                      boxShadow: '0 0 12px var(--accent-glow, rgba(255, 46, 85, 0.5))',
                    }}
                  />
                )}
                <span
                  className="transition-transform duration-200 group-hover:scale-110"
                  style={isActive ? { color: 'var(--accent-color, #FF2E55)' } : { color: '#666666' }}
                >
                  {cat.icon}
                </span>
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>

        {/* Right Settings Content Area */}
        <div className="col-span-9 bg-[#0A0A0A] border border-[#1A1A1A] rounded-2xl p-6 flex flex-col gap-6 shadow-xl transition-all duration-300">
          {/* Playback Category */}
          {activeCategory === 'playback' && (
            <div className="flex flex-col gap-6 animate-fadeIn">
              <div>
                <h3 className="text-sm font-bold text-white mb-1">Playback & Lyrics</h3>
                <p className="text-xs text-[#666666]">
                  Playback uses the system output through Electron's HTML5 audio engine. Choose the
                  default lyrics source below.
                </p>
              </div>

              {/* Lyrics Engine Provider Selection Card */}
              <div className="bg-[#101010] border border-[#1A1A1A] rounded-xl p-5 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-white"
                      style={{
                        backgroundColor: 'var(--accent-glow, rgba(255, 46, 85, 0.2))',
                        color: 'var(--accent-color, #FF2E55)',
                      }}
                    >
                      <Mic2 className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                        LYRICS ENGINE & PROVIDER
                      </h4>
                      <p className="text-[11px] text-[#777777]">
                        Choose your default lyrics source for synchronized karaoke and cinema mode.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  {[
                    {
                      id: 'auto',
                      title: '⚡ Auto (Smart Priority)',
                      desc: 'Automatically finds the best timestamped synced lyrics (Local → Embedded → LRCLIB Online).',
                    },
                    {
                      id: 'online',
                      title: '🌐 LRCLIB (Online Synced)',
                      desc: 'Queries open-source LRCLIB database with smart title cleaning for accurate karaoke sync.',
                    },
                    {
                      id: 'embedded',
                      title: '🏷️ Embedded Audio Tag',
                      desc: 'Reads embedded USLT/SYLT/lyrics metadata tags stored directly inside audio files.',
                    },
                    {
                      id: 'local',
                      title: '📁 Local File (.lrc)',
                      desc: 'Loads .lrc files located in the same directory as your song files.',
                    },
                  ].map((prov) => {
                    const isSelected = (settings.lyricsProvider || 'auto') === prov.id;
                    return (
                      <button
                        key={prov.id}
                        onClick={async () => {
                          await setLyricProvider(prov.id as LyricProviderOption);
                          triggerToast();
                        }}
                        className={`p-3.5 rounded-xl border text-left flex flex-col justify-between transition-all duration-150 cursor-pointer ${
                          isSelected
                            ? 'bg-[#181820] border-[var(--accent-color,#FF2E55)] shadow-md'
                            : 'bg-[#121214] border-[#222226] hover:border-[#35353C]'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-bold text-white">{prov.title}</span>
                          {isSelected && (
                            <Check
                              className="w-4 h-4 shrink-0"
                              style={{ color: 'var(--accent-color, #FF2E55)' }}
                            />
                          )}
                        </div>
                        <p className="text-[10px] text-[#7A7A85] leading-relaxed">{prov.desc}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

            </div>
          )}

          {/* Discord Category */}
          {activeCategory === 'discord' && (
            <div className="flex flex-col gap-6 animate-fadeIn">
              <div>
                <h3 className="text-sm font-bold text-white mb-1">Discord Rich Presence</h3>
                <p className="text-xs text-[#666666]">Customize your Discord status, activity prefix, application title, and logo icon.</p>
              </div>

              {/* Status Banner */}
              <div
                className="bg-[#101010] border border-[#1A1A1A] p-4 rounded-xl flex items-center justify-between text-xs font-mono transition-all duration-200"
                style={{
                  borderColor: settings.discordEnabled ? 'var(--accent-glow, rgba(255, 46, 85, 0.25))' : undefined,
                }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[#5865F2]/10 border border-[#5865F2]/30 flex items-center justify-center text-[#5865F2]">
                    <Disc className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-white font-bold">
                      {settings.discordClientId && settings.discordClientId !== '463097721130188830'
                        ? 'Custom Discord Application'
                        : 'Default Plug & Play'}
                    </p>
                    <p className="text-[10px] text-[#666666]">
                      {settings.discordActivityType === 'playing' ? 'Playing ...' : 'Listening to ...'} • Local IPC Pipe
                    </p>
                  </div>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-[10px] border font-bold uppercase tracking-wider transition-colors ${
                  settings.discordEnabled
                    ? 'bg-[#5FE39A]/10 text-[#5FE39A] border-[#5FE39A]/30'
                    : 'bg-[#666666]/10 text-[#666666] border-[#666666]/30'
                }`}>
                  {settings.discordEnabled ? 'ENABLED' : 'DISABLED'}
                </span>
              </div>

              {/* Live Discord Status Preview Card */}
              <div className="bg-[#0e0f12] border border-[#232428] rounded-xl p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono font-bold text-[#A3A3A3] uppercase tracking-wider">
                    DISCORD PROFILE PREVIEW
                  </span>
                  <span className="text-[10px] text-[#5865F2] font-mono">Live Preview</span>
                </div>

                <div className="bg-[#1e1f22] border border-[#2b2d31] rounded-lg p-3.5 flex items-center gap-3.5 shadow-md">
                  <div
                    className="w-12 h-12 rounded-lg bg-[#111214] border border-[#35373c] flex items-center justify-center relative flex-shrink-0"
                    style={{ color: 'var(--accent-color, #FF2E55)' }}
                  >
                    <Disc className="w-6 h-6 animate-spin-slow" />
                    <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-[#5865F2] border-2 border-[#1e1f22] flex items-center justify-center text-white text-[8px] font-bold">
                      ▶
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-bold text-[#b5bac1] uppercase tracking-wide truncate">
                      {settings.discordActivityType === 'playing' ? 'PLAYING A GAME' : 'LISTENING TO MUSIC'}
                    </p>
                    <p className="text-xs font-bold text-white truncate">MaJa Player</p>
                    <p className="text-xs text-[#dbdee1] truncate">
                      {settings.discordShowTrack
                        ? currentTrack
                          ? currentTrack.title
                          : 'No active track'
                        : 'Listening to Music'}
                    </p>
                    <p className="text-[11px] text-[#949ba4] font-mono truncate">
                      {settings.discordLargeImageText?.trim() ||
                        previewSpecs ||
                        'Start playback to preview audio specs'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Core Toggles */}
              <div className="flex flex-col gap-5 pt-2 border-t border-[#1A1A1A]">
                <ToggleSwitch
                  label="Enable Discord Rich Presence"
                  description="Automatically broadcasts track title, artist, album art, and timestamps to Discord Desktop."
                  checked={settings.discordEnabled}
                  onChange={(val) => handleUpdate({ discordEnabled: val })}
                />

                <ToggleSwitch
                  label="Show Track & Album Info"
                  description="Display currently playing song title and album name in Discord activity status."
                  checked={settings.discordShowTrack}
                  onChange={(val) => handleUpdate({ discordShowTrack: val })}
                  disabled={!settings.discordEnabled}
                />

                <ToggleSwitch
                  label="Show Live Playback Progress"
                  description="Include real-time song elapsed and remaining time countdown in Discord."
                  checked={settings.discordShowElapsed}
                  onChange={(val) => handleUpdate({ discordShowElapsed: val })}
                  disabled={!settings.discordEnabled}
                />
              </div>

              {/* Activity Type & Branding Customization */}
              <div className="flex flex-col gap-4 pt-4 border-t border-[#1A1A1A]">
                <div className="flex flex-col gap-1">
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                    Activity Status Header
                  </h4>
                  <p className="text-xs text-[#666666]">
                    Choose how Discord formats the top header badge on your profile.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => handleUpdate({ discordActivityType: 'listening' })}
                    className={`p-3 rounded-xl border text-left flex flex-col gap-1 transition-all duration-200 cursor-pointer ${
                      (settings.discordActivityType ?? 'listening') === 'listening'
                        ? 'bg-[#101010] text-white shadow-lg'
                        : 'bg-[#0A0A0A] border-[#1A1A1A] text-[#A3A3A3] hover:border-[#333333]'
                    }`}
                    style={
                      (settings.discordActivityType ?? 'listening') === 'listening'
                        ? {
                            borderColor: 'var(--accent-color, #FF2E55)',
                            boxShadow: '0 0 16px var(--accent-glow, rgba(255, 46, 85, 0.2))',
                          }
                        : undefined
                    }
                  >
                    <span className="text-xs font-bold flex items-center gap-1.5">
                      <Disc
                        className="w-3.5 h-3.5"
                        style={{
                          color:
                            (settings.discordActivityType ?? 'listening') === 'listening'
                              ? 'var(--accent-color, #FF2E55)'
                              : '#666666',
                        }}
                      />
                      Listening to ...
                    </span>
                    <span className="text-[10px] text-[#666666]">
                      Displays as a music activity (Recommended)
                    </span>
                  </button>

                  <button
                    onClick={() => handleUpdate({ discordActivityType: 'playing' })}
                    className={`p-3 rounded-xl border text-left flex flex-col gap-1 transition-all duration-200 cursor-pointer ${
                      settings.discordActivityType === 'playing'
                        ? 'bg-[#101010] text-white shadow-lg'
                        : 'bg-[#0A0A0A] border-[#1A1A1A] text-[#A3A3A3] hover:border-[#333333]'
                    }`}
                    style={
                      settings.discordActivityType === 'playing'
                        ? {
                            borderColor: 'var(--accent-color, #FF2E55)',
                            boxShadow: '0 0 16px var(--accent-glow, rgba(255, 46, 85, 0.2))',
                          }
                        : undefined
                    }
                  >
                    <span className="text-xs font-bold flex items-center gap-1.5">
                      <Sparkles
                        className="w-3.5 h-3.5"
                        style={{
                          color:
                            settings.discordActivityType === 'playing'
                              ? 'var(--accent-color, #FF2E55)'
                              : '#666666',
                        }}
                      />
                      Playing ...
                    </span>
                    <span className="text-[10px] text-[#666666]">
                      Displays as playing an application
                    </span>
                  </button>
                </div>
              </div>

              {/* Custom Application ID & Logo Setup */}
              <div className="flex flex-col gap-4 pt-4 border-t border-[#1A1A1A]">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                      Custom Discord Application & Logo
                    </h4>
                    <p className="text-xs text-[#666666]">
                      To change the app title to &quot;MaJa Player&quot; and use a custom logo icon, use your own Discord Application ID.
                    </p>
                  </div>
                  <a
                    href="https://discord.com/developers/applications"
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1.5 rounded-lg bg-[#5865F2]/10 hover:bg-[#5865F2]/20 border border-[#5865F2]/30 text-[#5865F2] text-xs font-semibold flex items-center gap-1.5 transition-all duration-150 hover:scale-105 active:scale-95 cursor-pointer"
                  >
                    <span>Discord Developer Portal</span>
                    <span className="text-[10px]">↗</span>
                  </a>
                </div>

                {/* Application ID Input */}
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-semibold text-[#666666] uppercase tracking-wider font-mono">
                    DISCORD APPLICATION ID (CLIENT ID)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={settings.discordClientId || ''}
                      onChange={(e) => handleUpdate({ discordClientId: e.target.value.trim() })}
                      placeholder="e.g. 123456789012345678"
                      className="flex-1 bg-[#101010] border border-[#242424] text-xs text-white rounded-xl px-3.5 py-2.5 outline-none font-mono transition-all"
                    />
                    <button
                      onClick={() => handleUpdate({ discordClientId: '463097721130188830' })}
                      className="px-3.5 py-2.5 rounded-xl bg-[#151515] hover:bg-[#202020] border border-[#242424] text-xs text-[#A3A3A3] hover:text-white transition-all font-mono active:scale-95 cursor-pointer"
                      title="Reset to default plug & play client ID"
                    >
                      Reset
                    </button>
                  </div>
                </div>

                {/* Custom Logo Asset Key */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-semibold text-[#666666] uppercase tracking-wider font-mono">
                      LOGO ASSET KEY / IMAGE URL
                    </label>
                    <input
                      type="text"
                      value={settings.discordLargeImage || ''}
                      onChange={(e) => handleUpdate({ discordLargeImage: e.target.value.trim() })}
                      placeholder="e.g. logo, app_icon, or URL"
                      className="bg-[#101010] border border-[#242424] text-xs text-white rounded-xl px-3.5 py-2.5 outline-none font-mono transition-all"
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-semibold text-[#666666] uppercase tracking-wider font-mono">
                      AUDIO SPECS / HOVER BADGE TEXT
                    </label>
                    <input
                      type="text"
                      value={settings.discordLargeImageText || ''}
                      onChange={(e) => handleUpdate({ discordLargeImageText: e.target.value })}
                      placeholder="Auto (e.g. FLAC • 16bit • 44.1kHz)"
                      className="bg-[#101010] border border-[#242424] text-xs text-white rounded-xl px-3.5 py-2.5 outline-none transition-all"
                    />
                  </div>
                </div>

                {/* 30-Second Quick Setup Guide Card */}
                <div className="bg-[#101010] border border-[#1A1A1A] rounded-xl p-4 flex flex-col gap-2.5 text-xs text-[#A3A3A3]">
                  <div className="flex items-center gap-2 text-white font-bold">
                    <Sparkles className="w-3.5 h-3.5" style={{ color: 'var(--accent-color, #FF2E55)' }} />
                    <span>How to set up &quot;Listening in MaJa Player&quot; &amp; custom logo in 30s:</span>
                  </div>
                  <ol className="list-decimal list-inside space-y-1 text-[#888888] text-[11px] leading-relaxed">
                    <li>Open <a href="https://discord.com/developers/applications" target="_blank" rel="noreferrer" className="text-[#5865F2] hover:underline font-mono">discord.com/developers/applications</a> and click <strong className="text-white">&quot;New Application&quot;</strong>.</li>
                    <li>Name it <strong className="text-white">&quot;MaJa Player&quot;</strong> (or whatever title you want Discord to display).</li>
                    <li>Go to <strong className="text-white">Rich Presence → Art Assets</strong> on the left, upload your logo image, and name the asset key <code className="text-accent bg-[#1A1A1A] px-1 py-0.5 rounded">logo</code> (or upload it as the App Icon).</li>
                    <li>Copy your <strong className="text-white">Application ID</strong> from the General Information tab and paste it into the field above!</li>
                  </ol>
                </div>
              </div>
            </div>
          )}

          {/* Appearance Category */}
          {activeCategory === 'appearance' && (
            <div className="flex flex-col gap-6 animate-fadeIn">
              <div>
                <h3 className="text-sm font-bold text-white mb-1">Appearance & Studio</h3>
                <p className="text-xs text-[#666666]">
                  Personalize accent highlights, custom wallpapers, and motion preferences.
                </p>
              </div>

              {/* Accent Highlight Color Studio */}
              <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-2xl p-5 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Palette className="w-4 h-4 text-white" />
                    <div>
                      <h4 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                        Accent Highlight Color
                      </h4>
                      <p className="text-[11px] text-[#666666]">
                        Pick any custom color or choose from curated studio presets.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleUpdate({ accentColor: '#FF2E55' })}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#151515] hover:bg-[#202020] border border-[#242424] text-[11px] font-mono text-[#A3A3A3] hover:text-white transition-all cursor-pointer active:scale-95"
                    title="Reset to default MaJa Crimson"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Reset (#FF2E55)</span>
                  </button>
                </div>

                {/* Custom Color Picker & Hex Input Bar */}
                <div className="bg-[#101010] border border-[#202020] rounded-xl p-3 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    {/* HTML5 Native Color Picker with custom skin */}
                    <div className="relative group cursor-pointer">
                      <input
                        type="color"
                        value={settings.accentColor || '#FF2E55'}
                        onChange={(e) => handleUpdate({ accentColor: e.target.value.toUpperCase() })}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                      />
                      <div
                        className="w-10 h-10 rounded-xl border-2 border-white/40 group-hover:border-white flex items-center justify-center shadow-lg transition-all duration-200 group-hover:scale-105 active:scale-95"
                        style={{
                          backgroundColor: settings.accentColor || '#FF2E55',
                          boxShadow: `0 0 16px ${settings.accentColor || '#FF2E55'}50`,
                        }}
                      >
                        <Pipette className="w-4 h-4 text-white drop-shadow" />
                      </div>
                    </div>

                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-white">Custom Color Spectrum Picker</span>
                      <span className="text-[11px] text-[#666666]">Click the swatch to choose any custom RGB color</span>
                    </div>
                  </div>

                  {/* Hex Text Input */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-[#666666]">HEX:</span>
                    <input
                      type="text"
                      value={settings.accentColor || '#FF2E55'}
                      onChange={(e) => {
                        let val = e.target.value;
                        if (!val.startsWith('#')) val = `#${val}`;
                        if (val.length <= 7) {
                          handleUpdate({ accentColor: val.toUpperCase() });
                        }
                      }}
                      maxLength={7}
                      placeholder="#FF2E55"
                      className="w-24 bg-[#0A0A0A] border border-[#242424] focus:border-[#FF2E55] text-xs text-white font-mono font-bold text-center rounded-lg px-2.5 py-1.5 outline-none uppercase transition-all"
                    />
                  </div>
                </div>

                {/* 12 Curated Preset Swatches */}
                <div className="flex flex-col gap-2">
                  <span className="text-[10px] font-semibold text-[#666666] uppercase tracking-wider font-mono">
                    CURATED STUDIO PALETTES
                  </span>
                  <div className="grid grid-cols-6 sm:grid-cols-12 gap-2.5">
                    {accentColors.map((c) => {
                      const isSelected = (settings.accentColor || '').toLowerCase() === c.hex.toLowerCase();
                      return (
                        <button
                          key={c.hex}
                          onClick={() => handleUpdate({ accentColor: c.hex })}
                          className={`h-9 rounded-xl flex items-center justify-center border transition-all duration-150 active:scale-90 group relative cursor-pointer ${
                            isSelected
                              ? 'border-white scale-110 shadow-lg shadow-black/80 ring-2 ring-white/20'
                              : 'border-transparent hover:scale-105 hover:border-white/40 opacity-85 hover:opacity-100'
                          }`}
                          style={{ backgroundColor: c.hex }}
                          title={c.name}
                        >
                          {isSelected && <Check className="w-3.5 h-3.5 text-white drop-shadow-md animate-fadeIn" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Custom Background & Wallpaper Studio */}
              <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-2xl p-5 flex flex-col gap-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ImageIcon className="w-4 h-4 text-white" />
                    <div>
                      <h4 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                        Custom Background Wallpaper
                      </h4>
                      <p className="text-[11px] text-[#666666]">
                        Set a custom image wallpaper from a local file or direct web link.
                      </p>
                    </div>
                  </div>
                  {settings.customBackgroundUrl && (
                    <button
                      onClick={handleClearBackground}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#1F1012] hover:bg-[#2A1518] border border-[#FF2E55]/30 text-[11px] font-mono text-[#FF2E55] transition-all cursor-pointer active:scale-95"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Remove Background</span>
                    </button>
                  )}
                </div>

                <ToggleSwitch
                  label="Enable Custom Wallpaper Background"
                  description="Displays your selected image across the player interface with frosted glass styling."
                  checked={settings.customBackgroundEnabled ?? false}
                  onChange={(val) => {
                    if (val && !settings.customBackgroundUrl) {
                      handleUpdate({
                        customBackgroundEnabled: true,
                        customBackgroundUrl: wallpaperPresets[0].url,
                      });
                    } else {
                      handleUpdate({ customBackgroundEnabled: val });
                    }
                  }}
                />

                {/* Background Source Selectors */}
                <div className="flex flex-col gap-4 pt-3 border-t border-[#1A1A1A]">
                  {/* Source Tabs */}
                  <div className="flex items-center gap-2 bg-[#101010] p-1 rounded-xl border border-[#202020] self-start">
                    <button
                      onClick={() => setBgTab('file')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                        bgTab === 'file'
                          ? 'bg-[#202020] text-white shadow-sm'
                          : 'text-[#A3A3A3] hover:text-white'
                      }`}
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>Local Image File</span>
                    </button>
                    <button
                      onClick={() => setBgTab('url')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                        bgTab === 'url'
                          ? 'bg-[#202020] text-white shadow-sm'
                          : 'text-[#A3A3A3] hover:text-white'
                      }`}
                    >
                      <LinkIcon className="w-3.5 h-3.5" />
                      <span>Direct Web Link</span>
                    </button>
                    <button
                      onClick={() => setBgTab('presets')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                        bgTab === 'presets'
                          ? 'bg-[#202020] text-white shadow-sm'
                          : 'text-[#A3A3A3] hover:text-white'
                      }`}
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Curated Presets</span>
                    </button>
                  </div>

                  {/* Tab 1: Local Image File */}
                  {bgTab === 'file' && (
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={handleSelectLocalImage}
                          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#151515] hover:bg-[#202020] border border-[#2E2E2E] hover:border-white/30 text-xs font-bold text-white transition-all duration-200 hover:scale-102 active:scale-97 cursor-pointer shadow-md"
                        >
                          <Upload className="w-4 h-4" style={{ color: 'var(--accent-color, #FF2E55)' }} />
                          <span>Browse Local Image...</span>
                        </button>
                        <span className="text-xs text-[#666666]">
                          Supports JPG, PNG, WEBP, GIF, AVIF, and BMP
                        </span>
                      </div>

                      {settings.customBackgroundUrl && settings.customBackgroundUrl.startsWith('maja-artwork://') && (
                        <div className="bg-[#101010] border border-[#202020] rounded-xl p-2.5 flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2 truncate">
                            <CheckCircle2 className="w-4 h-4 text-[#5FE39A] flex-shrink-0" />
                            <span className="font-mono text-[#A3A3A3] truncate">
                              {decodeURIComponent(settings.customBackgroundUrl.split('path=')[1] || 'Local Image Loaded')}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Tab 2: Direct Web Link */}
                  {bgTab === 'url' && (
                    <div className="flex flex-col gap-3">
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <LinkIcon className="w-4 h-4 text-[#666666] absolute left-3.5 top-1/2 -translate-y-1/2" />
                          <input
                            type="url"
                            value={webUrlInput}
                            onChange={(e) => setWebUrlInput(e.target.value)}
                            placeholder="https://example.com/wallpaper.jpg"
                            className="w-full bg-[#101010] border border-[#242424] text-xs text-white rounded-xl pl-9 pr-3.5 py-2.5 outline-none font-mono transition-all"
                          />
                        </div>
                        <button
                          onClick={handleApplyWebUrl}
                          disabled={!webUrlInput.trim()}
                          className="px-4 py-2.5 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed text-xs font-bold text-white transition-all duration-200 hover:scale-102 active:scale-97 cursor-pointer shadow-md"
                          style={{
                            backgroundColor: 'var(--accent-color, #FF2E55)',
                            boxShadow: '0 0 14px var(--accent-glow, rgba(255, 46, 85, 0.35))',
                          }}
                        >
                          Apply Link
                        </button>
                      </div>

                      {settings.customBackgroundUrl && !settings.customBackgroundUrl.startsWith('maja-artwork://') && (
                        <div className="bg-[#101010] border border-[#202020] rounded-xl p-2.5 flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2 truncate">
                            <CheckCircle2 className="w-4 h-4 text-[#5FE39A] flex-shrink-0" />
                            <span className="font-mono text-[#A3A3A3] truncate">{settings.customBackgroundUrl}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Tab 3: Curated Presets */}
                  {bgTab === 'presets' && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {wallpaperPresets.map((preset) => {
                        const isCurrent = settings.customBackgroundUrl === preset.url;
                        return (
                          <div
                            key={preset.name}
                            onClick={() =>
                              handleUpdate({
                                customBackgroundEnabled: true,
                                customBackgroundUrl: preset.url,
                              })
                            }
                            className={`group relative h-24 rounded-xl overflow-hidden border cursor-pointer transition-all duration-200 hover:scale-103 active:scale-97 ${
                              isCurrent
                                ? 'shadow-lg shadow-black/80'
                                : 'border-[#242424] hover:border-white/40'
                            }`}
                            style={
                              isCurrent
                                ? {
                                    borderColor: 'var(--accent-color, #FF2E55)',
                                    boxShadow: '0 0 16px var(--accent-glow, rgba(255, 46, 85, 0.4))',
                                  }
                                : undefined
                            }
                          >
                            <img
                              src={preset.thumb}
                              alt={preset.name}
                              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex items-end p-2">
                              <span className="text-[10px] font-bold text-white truncate">{preset.name}</span>
                            </div>
                            {isCurrent && (
                              <div
                                className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center text-white shadow"
                                style={{ backgroundColor: 'var(--accent-color, #FF2E55)' }}
                              >
                                <Check className="w-3 h-3" />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Wallpaper Tuning Sliders */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-[#1A1A1A]">
                    {/* Opacity Slider */}
                    <div className="flex flex-col gap-2 bg-[#101010] border border-[#1E1E1E] rounded-xl p-3">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-semibold text-[#A3A3A3] uppercase tracking-wider font-mono">
                          WALLPAPER OPACITY / DIM
                        </label>
                        <span className="text-xs font-mono font-bold text-white">
                          {Math.round((settings.customBackgroundOpacity ?? 0.3) * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0.05"
                        max="1"
                        step="0.05"
                        value={settings.customBackgroundOpacity ?? 0.3}
                        onChange={(e) => handleUpdate({ customBackgroundOpacity: parseFloat(e.target.value) })}
                        className="w-full h-1.5 bg-[#202020] rounded-lg appearance-none cursor-pointer"
                        style={{ accentColor: 'var(--accent-color, #FF2E55)' }}
                      />
                      <span className="text-[10px] text-[#666666]">
                        Lower opacity ensures high-contrast readability.
                      </span>
                    </div>

                    {/* Blur Slider */}
                    <div className="flex flex-col gap-2 bg-[#101010] border border-[#1E1E1E] rounded-xl p-3">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-semibold text-[#A3A3A3] uppercase tracking-wider font-mono">
                          GLASSMORPHISM BLUR
                        </label>
                        <span className="text-xs font-mono font-bold text-white">
                          {settings.customBackgroundBlur ?? 10}px
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="40"
                        step="2"
                        value={settings.customBackgroundBlur ?? 10}
                        onChange={(e) => handleUpdate({ customBackgroundBlur: parseInt(e.target.value, 10) })}
                        className="w-full h-1.5 bg-[#202020] rounded-lg appearance-none cursor-pointer"
                        style={{ accentColor: 'var(--accent-color, #FF2E55)' }}
                      />
                      <span className="text-[10px] text-[#666666]">
                        Applies smooth frosted glass depth behind menus.
                      </span>
                    </div>
                  </div>

                  {/* Fit Mode */}
                  <div className="flex flex-col gap-2 pt-2">
                    <label className="text-[10px] font-semibold text-[#666666] uppercase tracking-wider font-mono">
                      WALLPAPER FIT &amp; SCALING
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['cover', 'contain', 'tile'] as const).map((fit) => {
                        const isFit = (settings.customBackgroundFit ?? 'cover') === fit;
                        return (
                          <button
                            key={fit}
                            onClick={() => handleUpdate({ customBackgroundFit: fit })}
                            className={`py-2 rounded-xl border text-xs font-mono font-bold uppercase transition-all duration-150 cursor-pointer ${
                              isFit
                                ? 'bg-[#151515] text-white shadow-sm'
                                : 'bg-[#0E0E0E] border-[#1E1E1E] text-[#A3A3A3] hover:border-[#333333]'
                            }`}
                            style={isFit ? { borderColor: 'var(--accent-color, #FF2E55)' } : undefined}
                          >
                            {fit}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Display & Motion Preferences */}
              <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-2xl p-5 flex flex-col gap-5">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                  Display &amp; Motion Controls
                </h4>

                <div className="flex flex-col gap-4">
                  <ToggleSwitch
                    label="Reduced Motion & Subtle Animations"
                    description="Disables subtle glow pulses and UI scale transitions for maximum minimalism."
                    checked={settings.reducedMotion}
                    onChange={(val) => handleUpdate({ reducedMotion: val })}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Library & System Category */}
          {activeCategory === 'library' && (
            <div className="flex flex-col gap-6 animate-fadeIn">
              <div>
                <h3 className="text-sm font-bold text-white mb-1">Library & Storage</h3>
                <p className="text-xs text-[#666666]">Manage the folders that make up your local library.</p>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-white">Monitored Music Folders</h4>
                  <p className="text-[11px] text-[#666666]">Recursive folder scanning locations.</p>
                </div>
                <button
                  onClick={handleAddFolder}
                  className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-white text-xs font-semibold transition-all duration-200 hover:scale-102 active:scale-97 cursor-pointer"
                  style={{
                    backgroundColor: 'var(--accent-color, #FF2E55)',
                    boxShadow: '0 0 14px var(--accent-glow, rgba(255, 46, 85, 0.35))',
                  }}
                >
                  <FolderPlus className="w-3.5 h-3.5" />
                  <span>Add Folder</span>
                </button>
              </div>

              <div className="flex flex-col gap-2">
                {settings.musicFolders.length > 0 ? (
                  settings.musicFolders.map((folder, idx) => (
                    <div
                      key={idx}
                      className="bg-[#101010] border border-[#1A1A1A] p-3 rounded-xl flex items-center justify-between text-xs group"
                    >
                      <span className="font-mono text-[#EDEDED] truncate mr-4">{folder}</span>
                      <button
                        onClick={() => handleRemoveFolder(folder)}
                        className="text-[#FF4D67] hover:text-red-400 p-1.5 rounded-full hover:bg-[#151515] font-mono text-[10px] transition-all duration-150 hover:scale-110 active:scale-90 cursor-pointer"
                        title="Remove folder"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="p-4 text-center bg-[#101010] border border-[#1A1A1A] rounded-xl text-xs text-[#666666]">
                    No music folders added yet. Click "Add Folder" to specify a folder.
                  </div>
                )}
              </div>

              <div className="p-4 rounded-xl bg-[#101010] border border-[#1A1A1A] flex items-center gap-3">
                <Sparkles className="w-5 h-5 shrink-0" style={{ color: 'var(--accent-color, #FF2E55)' }} />
                <div>
                  <p className="text-xs font-bold text-white">MaJa Player 1.0.0 — Local Music Player</p>
                  <p className="text-[11px] text-[#666666]">
                    Local-first playback built with Electron, React, TypeScript, SQLite & Tailwind CSS.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

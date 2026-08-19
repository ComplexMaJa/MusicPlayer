import React, { useState } from 'react';
import {
  Sliders,
  Volume2,
  ShieldCheck,
  Moon,
  Radio,
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
  Eye,
  Palette,
  RotateCcw,
  Layers,
  X,
  Plus,
} from 'lucide-react';
import { useSettingsStore } from '../stores/useSettingsStore';
import { useLibraryStore } from '../stores/useLibraryStore';
import { ToggleSwitch } from '../components/ToggleSwitch';

export const SettingsPage: React.FC = () => {
  const { settings, updateSettings } = useSettingsStore();
  const { scanFolders } = useLibraryStore();
  const [activeCategory, setActiveCategory] = useState<'audio' | 'playback' | 'discord' | 'appearance' | 'library'>('audio');
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
          <h2 className="text-[10px] font-semibold text-[#FF2E55] uppercase tracking-widest mb-1 font-mono">
            PREFERENCES
          </h2>
          <h1 className="text-3xl font-bold text-white tracking-tight">SETTINGS</h1>
        </div>

        {/* Saved Toast Notification */}
        <div
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#101010] border border-[#FF2E55]/30 text-xs font-mono text-[#FF2E55] transition-all duration-300 ${
            showSavedToast ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 pointer-events-none'
          }`}
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>Setting Saved</span>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-8 items-start">
        {/* Left Navigation Tabs */}
        <div className="col-span-3 bg-[#0A0A0A] border border-[#1A1A1A] rounded-2xl p-2 flex flex-col gap-1 shadow-xl">
          {[
            { id: 'audio', label: 'Audio Engine', icon: <Radio className="w-4 h-4" /> },
            { id: 'playback', label: 'Playback', icon: <Volume2 className="w-4 h-4" /> },
            { id: 'discord', label: 'Discord RPC', icon: <Disc className="w-4 h-4" /> },
            { id: 'appearance', label: 'Appearance', icon: <Moon className="w-4 h-4" /> },
            { id: 'library', label: 'Library & System', icon: <Sliders className="w-4 h-4" /> },
          ].map((cat) => {
            const isActive = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id as any)}
                className={`flex items-center gap-3 px-3.5 py-3 rounded-xl text-xs font-medium transition-all duration-200 relative group cursor-pointer ${
                  isActive
                    ? 'bg-[#101010] text-[#FF2E55] font-semibold border border-[#FF2E55]/20 shadow-md'
                    : 'text-[#A3A3A3] hover:text-white hover:bg-[#0D0D0D] hover:translate-x-0.5'
                }`}
              >
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-[#FF2E55] rounded-r-full shadow-lg shadow-[#FF2E55]/50 animate-fadeIn" />
                )}
                <span className={`transition-transform duration-200 group-hover:scale-110 ${isActive ? 'text-[#FF2E55]' : 'text-[#666666]'}`}>{cat.icon}</span>
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>

        {/* Right Settings Content Area */}
        <div className="col-span-9 bg-[#0A0A0A] border border-[#1A1A1A] rounded-2xl p-6 flex flex-col gap-6 shadow-xl transition-all duration-300">
          {/* Audio Engine Category */}
          {activeCategory === 'audio' && (
            <div className="flex flex-col gap-6 animate-fadeIn">
              <div>
                <h3 className="text-sm font-bold text-white mb-1">Audio Output & Engine</h3>
                <p className="text-xs text-[#666666]">Configure WASAPI direct hardware output and sample rates.</p>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-semibold text-[#666666] uppercase tracking-wider font-mono">
                  OUTPUT DEVICE API
                </label>
                <div className="relative">
                  <select
                    value={settings.outputDevice}
                    onChange={(e) => handleUpdate({ outputDevice: e.target.value })}
                    className="w-full bg-[#101010] border border-[#242424] focus:border-[#FF2E55] text-xs text-white rounded-xl p-3 outline-none transition-all appearance-none cursor-pointer"
                  >
                    <option value="Default (WASAPI)">Default (WASAPI Shared Mode)</option>
                    <option value="WASAPI Exclusive">WASAPI Exclusive Mode (Direct Hardware Output)</option>
                    <option value="DirectSound">DirectSound Speakers</option>
                  </select>
                </div>
                <p className="text-[11px] text-[#666666] font-light mt-1">
                  WASAPI Direct ensures bit-exact PCM decoding without Windows audio engine resampling.
                </p>
              </div>

              {/* Status Banner */}
              <div className="bg-[#101010] border border-[#1A1A1A] p-4 rounded-xl flex items-center justify-between text-xs font-mono">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[#FF2E55]/10 border border-[#FF2E55]/30 flex items-center justify-center text-[#FF2E55]">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-white font-bold">FLAC • 24-bit • 96kHz</p>
                    <p className="text-[10px] text-[#666666]">Neutral Lossless Audio Engine Active</p>
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-full text-[10px] bg-[#FF2E55]/20 text-[#FF2E55] border border-[#FF2E55]/40 font-bold uppercase tracking-wider">
                  {settings.exclusiveMode ? 'WASAPI EXCLUSIVE' : 'WASAPI SHARED'}
                </span>
              </div>

              <div className="flex flex-col gap-5 pt-4 border-t border-[#1A1A1A]">
                <ToggleSwitch
                  label="WASAPI Exclusive Mode"
                  description="Bypasses Windows system mixer for direct hardware stream delivery."
                  checked={settings.exclusiveMode}
                  onChange={(val) => handleUpdate({ exclusiveMode: val })}
                />

                <ToggleSwitch
                  label="Gapless Track Transitions"
                  description="Pre-buffers consecutive album tracks for seamless 0ms gapless playback."
                  checked={settings.gaplessPlayback}
                  onChange={(val) => handleUpdate({ gaplessPlayback: val })}
                />

                <ToggleSwitch
                  label="Remember Playback Position"
                  description="Restores your active track and position when launching MaJa Player."
                  checked={settings.rememberPlaybackPosition}
                  onChange={(val) => handleUpdate({ rememberPlaybackPosition: val })}
                />
              </div>
            </div>
          )}

          {/* Playback Category */}
          {activeCategory === 'playback' && (
            <div className="flex flex-col gap-6 animate-fadeIn">
              <div>
                <h3 className="text-sm font-bold text-white mb-1">Playback & Volume</h3>
                <p className="text-xs text-[#666666]">Manage gain processing and start preferences.</p>
              </div>

              <div className="flex flex-col gap-5">
                <ToggleSwitch
                  label="Normalize Volume (Gain Normalization)"
                  description="Applies peak normalization across tracks. Disabled by default for pure audiophile neutrality."
                  checked={settings.normalizeVolume}
                  onChange={(val) => handleUpdate({ normalizeVolume: val })}
                />
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
              <div className="bg-[#101010] border border-[#1A1A1A] hover:border-[#FF2E55]/30 p-4 rounded-xl flex items-center justify-between text-xs font-mono transition-all duration-200">
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
                  {settings.discordEnabled ? 'ACTIVE & READY' : 'DISABLED'}
                </span>
              </div>

              {/* Live Discord Status Preview Card */}
              <div className="bg-[#0e0f12] border border-[#232428] rounded-xl p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono font-bold text-[#A3A3A3] uppercase tracking-wider">
                    DISCORD PROFILE PREVIEW
                  </span>
                  <span className="text-[10px] text-[#5865F2] font-mono">Real-time Simulation</span>
                </div>

                <div className="bg-[#1e1f22] border border-[#2b2d31] rounded-lg p-3.5 flex items-center gap-3.5 shadow-md">
                  <div className="w-12 h-12 rounded-lg bg-[#111214] border border-[#35373c] flex items-center justify-center text-[#FF2E55] relative flex-shrink-0">
                    <Disc className="w-6 h-6 animate-spin-slow" />
                    <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-[#5865F2] border-2 border-[#1e1f22] flex items-center justify-center text-white text-[8px] font-bold">
                      ▶
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-bold text-[#b5bac1] uppercase tracking-wide truncate">
                      {settings.discordActivityType === 'playing' ? 'PLAYING A GAME' : 'LISTENING TO MUSIC'}
                    </p>
                    <p className="text-xs font-bold text-white truncate">
                      {settings.discordClientId && settings.discordClientId !== '463097721130188830'
                        ? 'MaJa Player'
                        : 'MaJa Player (Lossless)'}
                    </p>
                    <p className="text-xs text-[#dbdee1] truncate">
                      {settings.discordShowTrack ? 'Machine Love' : 'Listening to Music'}
                    </p>
                    <p className="text-[11px] text-[#949ba4] font-mono truncate">
                      {settings.discordLargeImageText?.trim() || 'FLAC • 16bit • 44.1kHz'}
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
                        ? 'bg-[#101010] border-[#FF2E55] text-white shadow-lg shadow-[#FF2E55]/10'
                        : 'bg-[#0A0A0A] border-[#1A1A1A] text-[#A3A3A3] hover:border-[#333333]'
                    }`}
                  >
                    <span className="text-xs font-bold flex items-center gap-1.5">
                      <Disc className="w-3.5 h-3.5 text-[#FF2E55]" />
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
                        ? 'bg-[#101010] border-[#FF2E55] text-white shadow-lg shadow-[#FF2E55]/10'
                        : 'bg-[#0A0A0A] border-[#1A1A1A] text-[#A3A3A3] hover:border-[#333333]'
                    }`}
                  >
                    <span className="text-xs font-bold flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-[#FF2E55]" />
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
                      className="flex-1 bg-[#101010] border border-[#242424] focus:border-[#FF2E55] text-xs text-white rounded-xl px-3.5 py-2.5 outline-none font-mono transition-all"
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
                      className="bg-[#101010] border border-[#242424] focus:border-[#FF2E55] text-xs text-white rounded-xl px-3.5 py-2.5 outline-none font-mono transition-all"
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
                      className="bg-[#101010] border border-[#242424] focus:border-[#FF2E55] text-xs text-white rounded-xl px-3.5 py-2.5 outline-none transition-all"
                    />
                  </div>
                </div>

                {/* 30-Second Quick Setup Guide Card */}
                <div className="bg-[#101010] border border-[#1A1A1A] rounded-xl p-4 flex flex-col gap-2.5 text-xs text-[#A3A3A3]">
                  <div className="flex items-center gap-2 text-white font-bold">
                    <Sparkles className="w-3.5 h-3.5 text-[#FF2E55]" />
                    <span>How to set up &quot;Listening in MaJa Player&quot; &amp; custom logo in 30s:</span>
                  </div>
                  <ol className="list-decimal list-inside space-y-1 text-[#888888] text-[11px] leading-relaxed">
                    <li>Open <a href="https://discord.com/developers/applications" target="_blank" rel="noreferrer" className="text-[#5865F2] hover:underline font-mono">discord.com/developers/applications</a> and click <strong className="text-white">&quot;New Application&quot;</strong>.</li>
                    <li>Name it <strong className="text-white">&quot;MaJa Player&quot;</strong> (or whatever title you want Discord to display).</li>
                    <li>Go to <strong className="text-white">Rich Presence → Art Assets</strong> on the left, upload your logo image, and name the asset key <code className="text-[#FF2E55] bg-[#1A1A1A] px-1 py-0.5 rounded">logo</code> (or upload it as the App Icon).</li>
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
                  Personalize accent highlights, custom wallpapers, glassmorphism blur, and AMOLED styling.
                </p>
              </div>

              {/* Live Theme Playground & Preview Card */}
              <div className="relative overflow-hidden rounded-2xl border border-[#242424] bg-[#0A0A0A] p-5 shadow-2xl">
                {/* Background Simulation inside Card */}
                {settings.customBackgroundEnabled && settings.customBackgroundUrl && (
                  <div className="absolute inset-0 pointer-events-none overflow-hidden">
                    <div
                      className="absolute -inset-4 transition-all duration-300"
                      style={{
                        backgroundImage: `url("${settings.customBackgroundUrl}")`,
                        backgroundSize: settings.customBackgroundFit === 'tile' ? 'auto' : settings.customBackgroundFit === 'contain' ? 'contain' : 'cover',
                        backgroundRepeat: settings.customBackgroundFit === 'tile' ? 'repeat' : 'no-repeat',
                        backgroundPosition: 'center',
                        filter: `blur(${settings.customBackgroundBlur ?? 10}px)`,
                        opacity: settings.customBackgroundOpacity ?? 0.3,
                      }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-b from-[#0A0A0A]/50 via-[#0A0A0A]/30 to-[#0A0A0A]/70" />
                  </div>
                )}

                <div className="relative z-10 flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-bold text-[#A3A3A3] uppercase tracking-wider flex items-center gap-1.5">
                      <Eye className="w-3.5 h-3.5 text-white" />
                      Live Theme &amp; Accent Preview
                    </span>
                    <span
                      className="text-[10px] font-mono px-2 py-0.5 rounded-full border text-white font-bold"
                      style={{
                        backgroundColor: `${settings.accentColor || '#FF2E55'}20`,
                        borderColor: `${settings.accentColor || '#FF2E55'}50`,
                        color: settings.accentColor || '#FF2E55',
                      }}
                    >
                      {settings.accentColor || '#FF2E55'}
                    </span>
                  </div>

                  {/* Simulated Mini App Bar */}
                  <div className="bg-[#121212]/90 backdrop-blur-md border border-[#202020] rounded-xl p-3.5 flex items-center justify-between shadow-lg">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center text-white shadow-md transition-all duration-300"
                        style={{
                          backgroundColor: settings.accentColor || '#FF2E55',
                          boxShadow: `0 0 15px ${settings.accentColor || '#FF2E55'}60`,
                        }}
                      >
                        <Disc className="w-5 h-5 animate-spin-slow" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-white">After Hours</span>
                        <span className="text-[11px] text-[#A3A3A3]">The Weeknd • Lossless Master</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div
                        className="px-2.5 py-1 rounded text-[10px] font-mono tracking-wider border font-bold transition-all duration-300"
                        style={{
                          backgroundColor: '#151515',
                          borderColor: `${settings.accentColor || '#FF2E55'}50`,
                          color: settings.accentColor || '#FF2E55',
                        }}
                      >
                        FLAC • 24bit • 96kHz
                      </div>
                      <button
                        className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold cursor-pointer transition-all duration-200 hover:scale-105 active:scale-95"
                        style={{
                          backgroundColor: settings.accentColor || '#FF2E55',
                          boxShadow: `0 0 15px ${settings.accentColor || '#FF2E55'}80`,
                        }}
                      >
                        ▶
                      </button>
                    </div>
                  </div>
                </div>
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
                  onChange={(val) => handleUpdate({ customBackgroundEnabled: val })}
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
                          <Upload className="w-4 h-4 text-[#FF2E55]" />
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
                            className="w-full bg-[#101010] border border-[#242424] focus:border-[#FF2E55] text-xs text-white rounded-xl pl-9 pr-3.5 py-2.5 outline-none font-mono transition-all"
                          />
                        </div>
                        <button
                          onClick={handleApplyWebUrl}
                          disabled={!webUrlInput.trim()}
                          className="px-4 py-2.5 rounded-xl bg-[#FF2E55] hover:bg-[#FF4568] disabled:opacity-50 disabled:cursor-not-allowed text-xs font-bold text-white transition-all duration-200 hover:scale-102 active:scale-97 cursor-pointer shadow-md shadow-[#FF2E55]/30"
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
                                ? 'border-white ring-2 ring-[#FF2E55] shadow-lg shadow-black/80'
                                : 'border-[#242424] hover:border-white/40'
                            }`}
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
                              <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-[#FF2E55] flex items-center justify-center text-white shadow">
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
                        className="w-full h-1.5 bg-[#202020] rounded-lg appearance-none cursor-pointer accent-[#FF2E55]"
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
                        className="w-full h-1.5 bg-[#202020] rounded-lg appearance-none cursor-pointer accent-[#FF2E55]"
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
                                ? 'bg-[#151515] border-[#FF2E55] text-white shadow-sm'
                                : 'bg-[#0E0E0E] border-[#1E1E1E] text-[#A3A3A3] hover:border-[#333333]'
                            }`}
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
                    label="AMOLED Deep Black Mode"
                    description="Enforces pure #050505 AMOLED black backgrounds for high-contrast OLED displays."
                    checked={settings.amoledMode}
                    onChange={(val) => handleUpdate({ amoledMode: val })}
                  />

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
                <h3 className="text-sm font-bold text-white mb-1">Library & Startup</h3>
                <p className="text-xs text-[#666666]">Manage local music folders and launch preferences.</p>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-white">Monitored Music Folders</h4>
                  <p className="text-[11px] text-[#666666]">Recursive folder scanning locations.</p>
                </div>
                <button
                  onClick={handleAddFolder}
                  className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-[#FF2E55] hover:bg-[#FF4568] text-white text-xs font-semibold shadow-md shadow-[#FF2E55]/30 hover:shadow-lg hover:shadow-[#FF2E55]/50 transition-all duration-200 hover:scale-102 active:scale-97 cursor-pointer"
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

              <div className="flex flex-col gap-5 pt-4 border-t border-[#1A1A1A]">
                <ToggleSwitch
                  label="Start Minimized to Tray"
                  description="Launches MaJa Player quietly in the system background."
                  checked={settings.startMinimized}
                  onChange={(val) => handleUpdate({ startMinimized: val })}
                />
              </div>

              <div className="p-4 rounded-xl bg-[#101010] border border-[#1A1A1A] flex items-center gap-3">
                <Sparkles className="w-5 h-5 text-[#FF2E55] shrink-0" />
                <div>
                  <p className="text-xs font-bold text-white">MaJa Player V1.0.0 — Minimal Audiophile Player</p>
                  <p className="text-[11px] text-[#666666]">
                    Offline-first FLAC engine built with Electron, React, TypeScript, SQLite & Tailwind CSS.
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

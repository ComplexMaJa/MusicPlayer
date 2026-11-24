import React, { useState } from 'react';
import { FolderPlus, RefreshCw, Music, Album as AlbumIcon, Users, Clock, AlertCircle } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useLibraryStore } from '../stores/useLibraryStore';
import { useSettingsStore } from '../stores/useSettingsStore';

export const Library: React.FC = () => {
  const { stats, scanProgress, scanFolders, setActiveView } = useLibraryStore(
    useShallow((state) => ({
      stats: state.stats,
      scanProgress: state.scanProgress,
      scanFolders: state.scanFolders,
      setActiveView: state.setActiveView,
    }))
  );
  const { settings, updateSettings } = useSettingsStore(
    useShallow((state) => ({
      settings: state.settings,
      updateSettings: state.updateSettings,
    }))
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [removingFolder, setRemovingFolder] = useState<string | null>(null);

  const handleAddFolder = async () => {
    if (!window.electronAPI || scanProgress.isScanning) return;
    setActionError(null);
    try {
      const paths = await window.electronAPI.selectFolder();
      if (paths && paths.length > 0) {
        await scanFolders(paths);
        await useSettingsStore.getState().loadSettings();
      }
    } catch (err) {
      console.error('Failed to add music folder:', err);
      setActionError(err instanceof Error ? err.message : 'Failed to add music folder.');
    }
  };

  const handleRescan = async () => {
    if (!window.electronAPI || scanProgress.isScanning || settings.musicFolders.length === 0) return;
    setActionError(null);
    try {
      await scanFolders(settings.musicFolders);
    } catch (err) {
      console.error('Failed to rescan library:', err);
      setActionError(err instanceof Error ? err.message : 'Failed to rescan library.');
    }
  };

  const handleRemoveFolder = async (folderPath: string) => {
    if (scanProgress.isScanning || removingFolder !== null) return;
    setActionError(null);
    setRemovingFolder(folderPath);
    try {
      const latestFolders = useSettingsStore.getState().settings.musicFolders;
      const updated = latestFolders.filter((f) => f !== folderPath);
      await updateSettings({ musicFolders: updated });
      await scanFolders(updated);
    } catch (err) {
      console.error('Failed to remove music folder:', err);
      setActionError(err instanceof Error ? err.message : 'Failed to remove music folder.');
    } finally {
      setRemovingFolder(null);
    }
  };

  const formatHours = (secs: number) => {
    if (!Number.isFinite(secs) || secs < 0) return '0h 0m';
    const hours = Math.floor(secs / 3600);
    const mins = Math.floor((secs % 3600) / 60);
    return `${hours}h ${mins}m`;
  };

  const displayError = actionError || scanProgress.error;

  return (
    <div className="flex-1 overflow-y-auto p-8 flex flex-col gap-8 max-w-6xl mx-auto w-full select-none">
      {/* Title Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2
            className="text-[10px] font-semibold uppercase tracking-widest mb-1 font-mono transition-colors"
            style={{ color: 'var(--accent-color, #FF2E55)' }}
          >
            MANAGEMENT
          </h2>
          <h1 className="text-3xl font-bold text-white tracking-tight">YOUR LIBRARY</h1>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void handleAddFolder()}
            disabled={scanProgress.isScanning}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-xs font-semibold shadow-lg transition-all duration-200 hover:scale-102 active:scale-97 disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
            style={{
              backgroundColor: 'var(--accent-color, #FF2E55)',
              boxShadow: '0 0 16px var(--accent-glow, rgba(255, 46, 85, 0.35))',
            }}
          >
            <FolderPlus className="w-4 h-4" />
            <span>ADD MUSIC FOLDER</span>
          </button>
          <button
            type="button"
            onClick={() => void handleRescan()}
            disabled={scanProgress.isScanning || settings.musicFolders.length === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#101010] hover:bg-[#151515] border border-[#1A1A1A] hover:border-[#2E2E2E] text-white text-xs font-medium transition-all duration-200 hover:scale-102 active:scale-97 disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${scanProgress.isScanning ? 'animate-spin' : ''}`} />
            <span>SCAN LIBRARY</span>
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {displayError && (
        <div
          role="alert"
          className="bg-[#1F1012] border border-[#FF4D67]/30 px-4 py-3 rounded-xl flex items-center gap-2.5 text-xs text-[#FF4D67] animate-fadeIn"
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="truncate">{displayError}</span>
        </div>
      )}

      {/* Progress Notification */}
      {scanProgress.isScanning && (
        <div
          className="bg-[#101010] border p-4 rounded-xl flex flex-col gap-2 animate-fadeIn"
          style={{
            borderColor: 'var(--accent-glow, rgba(255, 46, 85, 0.3))',
          }}
        >
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="font-semibold" style={{ color: 'var(--accent-color, #FF2E55)' }}>
              Scanning Library...
            </span>
            <span className="text-[#A3A3A3]">
              {scanProgress.processedFiles} / {scanProgress.totalFiles}
            </span>
          </div>
          <div className="w-full h-1.5 bg-[#050505] rounded-full overflow-hidden">
            <div
              className="h-full transition-all duration-300 ease-out"
              style={{
                backgroundColor: 'var(--accent-color, #FF2E55)',
                width: `${
                  scanProgress.totalFiles > 0
                    ? Math.min(100, (scanProgress.processedFiles / scanProgress.totalFiles) * 100)
                    : 0
                }%`,
              }}
            />
          </div>
          {scanProgress.currentFile && (
            <p className="text-[11px] text-[#666666] truncate font-mono">
              Processing: {scanProgress.currentFile}
            </p>
          )}
        </div>
      )}

      {/* Library Stats Grid */}
      <div className="grid grid-cols-4 gap-4">
        <button
          type="button"
          onClick={() => setActiveView('tracks')}
          className="w-full text-left bg-[#0A0A0A] border border-[#1A1A1A] hover:border-white/20 p-5 rounded-2xl flex flex-col gap-2 cursor-pointer transition-all duration-200 ease-out group hover:-translate-y-1"
        >
          <div className="flex items-center justify-between text-[#666666] group-hover:text-accent transition-colors w-full">
            <Music className="w-5 h-5 group-hover:scale-110 transition-transform duration-200" />
            <span className="text-[10px] font-mono tracking-widest uppercase">TRACKS</span>
          </div>
          <p className="text-2xl font-bold text-white group-hover:text-accent transition-colors">
            {stats.trackCount.toLocaleString()}
          </p>
        </button>

        <button
          type="button"
          onClick={() => setActiveView('albums')}
          className="w-full text-left bg-[#0A0A0A] border border-[#1A1A1A] hover:border-white/20 p-5 rounded-2xl flex flex-col gap-2 cursor-pointer transition-all duration-200 ease-out group hover:-translate-y-1"
        >
          <div className="flex items-center justify-between text-[#666666] group-hover:text-accent transition-colors w-full">
            <AlbumIcon className="w-5 h-5 group-hover:scale-110 transition-transform duration-200" />
            <span className="text-[10px] font-mono tracking-widest uppercase">ALBUMS</span>
          </div>
          <p className="text-2xl font-bold text-white group-hover:text-accent transition-colors">
            {stats.albumCount.toLocaleString()}
          </p>
        </button>

        <button
          type="button"
          onClick={() => setActiveView('artists')}
          className="w-full text-left bg-[#0A0A0A] border border-[#1A1A1A] hover:border-white/20 p-5 rounded-2xl flex flex-col gap-2 cursor-pointer transition-all duration-200 ease-out group hover:-translate-y-1"
        >
          <div className="flex items-center justify-between text-[#666666] group-hover:text-accent transition-colors w-full">
            <Users className="w-5 h-5 group-hover:scale-110 transition-transform duration-200" />
            <span className="text-[10px] font-mono tracking-widest uppercase">ARTISTS</span>
          </div>
          <p className="text-2xl font-bold text-white group-hover:text-accent transition-colors">
            {stats.artistCount.toLocaleString()}
          </p>
        </button>

        <div className="bg-[#0A0A0A] border border-[#1A1A1A] p-5 rounded-2xl flex flex-col gap-2">
          <div className="flex items-center justify-between text-[#666666]">
            <Clock className="w-5 h-5" />
            <span className="text-[10px] font-mono tracking-widest uppercase">PLAYTIME</span>
          </div>
          <p className="text-2xl font-bold text-white">{formatHours(stats.totalDuration)}</p>
        </div>
      </div>

      {/* Monitored Folders List */}
      <section className="flex flex-col gap-4">
        <h3 className="text-[11px] font-semibold text-[#666666] uppercase tracking-widest font-mono">
          MONITORED MUSIC FOLDERS
        </h3>

        <div className="flex flex-col gap-2">
          {settings.musicFolders.length > 0 ? (
            settings.musicFolders.map((folder) => (
              <div
                key={folder}
                className="bg-[#0A0A0A] border border-[#1A1A1A] p-4 rounded-xl flex items-center justify-between text-xs"
              >
                <div className="font-mono text-[#EDEDED] truncate mr-4">{folder}</div>
                <button
                  type="button"
                  onClick={() => void handleRemoveFolder(folder)}
                  disabled={scanProgress.isScanning || removingFolder !== null}
                  aria-label={`Remove folder ${folder}`}
                  className="text-xs text-[#FF4D67] hover:underline shrink-0 disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                >
                  {removingFolder === folder ? 'Removing...' : 'Remove'}
                </button>
              </div>
            ))
          ) : (
            <div className="p-8 text-center bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl flex flex-col items-center gap-3">
              <p className="text-sm font-medium text-white">No music folders added yet</p>
              <p className="text-xs text-[#A3A3A3]">
                Add your local Music folder to recursively scan your FLAC and audio files.
              </p>
              <button
                type="button"
                onClick={() => void handleAddFolder()}
                disabled={scanProgress.isScanning}
                className="mt-2 flex items-center gap-2 px-4 py-2 rounded-lg text-white text-xs font-semibold shadow-lg disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                style={{
                  backgroundColor: 'var(--accent-color, #FF2E55)',
                  boxShadow: '0 0 14px var(--accent-glow, rgba(255, 46, 85, 0.35))',
                }}
              >
                <FolderPlus className="w-4 h-4" />
                <span>ADD MUSIC FOLDER</span>
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

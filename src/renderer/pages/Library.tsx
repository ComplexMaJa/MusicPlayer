import React from 'react';
import { FolderPlus, RefreshCw, Music, Album as AlbumIcon, Users, Clock } from 'lucide-react';
import { useLibraryStore } from '../stores/useLibraryStore';
import { useSettingsStore } from '../stores/useSettingsStore';

export const Library: React.FC = () => {
  const { stats, scanProgress, scanFolders, setActiveView } = useLibraryStore();
  const { settings, updateSettings } = useSettingsStore();

  const handleAddFolder = async () => {
    if (!window.electronAPI) return;
    const paths = await window.electronAPI.selectFolder();
    if (paths && paths.length > 0) {
      await scanFolders(paths);
      await updateSettings({
        musicFolders: Array.from(new Set([...settings.musicFolders, ...paths])),
      });
    }
  };

  const handleRescan = async () => {
    if (settings.musicFolders.length > 0) {
      await scanFolders(settings.musicFolders);
    }
  };

  const handleRemoveFolder = async (folderPath: string) => {
    const updated = settings.musicFolders.filter((f) => f !== folderPath);
    await updateSettings({ musicFolders: updated });
    if (updated.length > 0) {
      await scanFolders(updated);
    }
  };

  const formatHours = (secs: number) => {
    const hours = Math.floor(secs / 3600);
    const mins = Math.floor((secs % 3600) / 60);
    return `${hours}h ${mins}m`;
  };

  return (
    <div className="flex-1 overflow-y-auto p-8 flex flex-col gap-8 max-w-6xl mx-auto w-full select-none">
      {/* Title Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[10px] font-semibold text-[#FF2E55] uppercase tracking-widest mb-1 font-mono">
            MANAGEMENT
          </h2>
          <h1 className="text-3xl font-bold text-white tracking-tight">YOUR LIBRARY</h1>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleAddFolder}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#FF2E55] hover:bg-[#FF4568] text-white text-xs font-semibold shadow-lg shadow-[#FF2E55]/30 hover:shadow-xl hover:shadow-[#FF2E55]/50 transition-all duration-200 hover:scale-102 active:scale-97 cursor-pointer"
          >
            <FolderPlus className="w-4 h-4" />
            <span>ADD MUSIC FOLDER</span>
          </button>
          <button
            onClick={handleRescan}
            disabled={scanProgress.isScanning || settings.musicFolders.length === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#101010] hover:bg-[#151515] border border-[#1A1A1A] hover:border-[#2E2E2E] text-white text-xs font-medium transition-all duration-200 hover:scale-102 active:scale-97 disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${scanProgress.isScanning ? 'animate-spin' : ''}`} />
            <span>SCAN LIBRARY</span>
          </button>
        </div>
      </div>

      {/* Progress Notification */}
      {scanProgress.isScanning && (
        <div className="bg-[#101010] border border-[#FF2E55]/30 p-4 rounded-xl flex flex-col gap-2 animate-fadeIn">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-[#FF2E55] font-semibold">Scanning Library...</span>
            <span className="text-[#A3A3A3]">
              {scanProgress.processedFiles} / {scanProgress.totalFiles}
            </span>
          </div>
          <div className="w-full h-1.5 bg-[#050505] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#FF2E55] transition-all duration-300 ease-out"
              style={{
                width: `${
                  scanProgress.totalFiles > 0
                    ? (scanProgress.processedFiles / scanProgress.totalFiles) * 100
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
        <div
          onClick={() => setActiveView('tracks')}
          className="bg-[#0A0A0A] border border-[#1A1A1A] hover:border-[#FF2E55]/30 hover:shadow-xl hover:shadow-[#FF2E55]/5 hover:-translate-y-1 p-5 rounded-2xl flex flex-col gap-2 cursor-pointer transition-all duration-200 ease-out group"
        >
          <div className="flex items-center justify-between text-[#666666] group-hover:text-[#FF2E55] transition-colors">
            <Music className="w-5 h-5 group-hover:scale-110 transition-transform duration-200" />
            <span className="text-[10px] font-mono tracking-widest uppercase">TRACKS</span>
          </div>
          <p className="text-2xl font-bold text-white group-hover:text-[#FF2E55] transition-colors">{stats.trackCount.toLocaleString()}</p>
        </div>

        <div
          onClick={() => setActiveView('albums')}
          className="bg-[#0A0A0A] border border-[#1A1A1A] hover:border-[#FF2E55]/30 hover:shadow-xl hover:shadow-[#FF2E55]/5 hover:-translate-y-1 p-5 rounded-2xl flex flex-col gap-2 cursor-pointer transition-all duration-200 ease-out group"
        >
          <div className="flex items-center justify-between text-[#666666] group-hover:text-[#FF2E55] transition-colors">
            <AlbumIcon className="w-5 h-5 group-hover:scale-110 transition-transform duration-200" />
            <span className="text-[10px] font-mono tracking-widest uppercase">ALBUMS</span>
          </div>
          <p className="text-2xl font-bold text-white group-hover:text-[#FF2E55] transition-colors">{stats.albumCount.toLocaleString()}</p>
        </div>

        <div
          onClick={() => setActiveView('artists')}
          className="bg-[#0A0A0A] border border-[#1A1A1A] hover:border-[#FF2E55]/30 hover:shadow-xl hover:shadow-[#FF2E55]/5 hover:-translate-y-1 p-5 rounded-2xl flex flex-col gap-2 cursor-pointer transition-all duration-200 ease-out group"
        >
          <div className="flex items-center justify-between text-[#666666] group-hover:text-[#FF2E55] transition-colors">
            <Users className="w-5 h-5 group-hover:scale-110 transition-transform duration-200" />
            <span className="text-[10px] font-mono tracking-widest uppercase">ARTISTS</span>
          </div>
          <p className="text-2xl font-bold text-white group-hover:text-[#FF2E55] transition-colors">{stats.artistCount.toLocaleString()}</p>
        </div>

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
            settings.musicFolders.map((folder, idx) => (
              <div
                key={idx}
                className="bg-[#0A0A0A] border border-[#1A1A1A] p-4 rounded-xl flex items-center justify-between text-xs"
              >
                <div className="font-mono text-[#EDEDED] truncate mr-4">{folder}</div>
                <button
                  onClick={() => handleRemoveFolder(folder)}
                  className="text-xs text-[#FF4D67] hover:underline shrink-0"
                >
                  Remove
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
                onClick={handleAddFolder}
                className="mt-2 flex items-center gap-2 px-4 py-2 rounded-lg bg-[#FF2E55] text-white text-xs font-semibold shadow-lg shadow-[#FF2E55]/30"
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

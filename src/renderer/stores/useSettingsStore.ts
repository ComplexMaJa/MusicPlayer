import { create } from 'zustand';
import { Settings } from '../../shared/types';
import { DEFAULT_SETTINGS } from '../../shared/constants';

interface SettingsStoreState {
  settings: Settings;
  loadSettings: () => Promise<Settings | undefined>;
  updateSettings: (newSettings: Partial<Settings>) => Promise<void>;
}

let settingsLoadSeq = 0;
let settingsUpdateSeq = 0;

export const useSettingsStore = create<SettingsStoreState>((set) => ({
  settings: DEFAULT_SETTINGS,

  loadSettings: async () => {
    const api = window.electronAPI;
    if (!api) return undefined;
    const reqLoadSeq = ++settingsLoadSeq;
    const updateEpochAtStart = settingsUpdateSeq;
    try {
      const settings = await api.getSettings();
      if (settings && reqLoadSeq === settingsLoadSeq && settingsUpdateSeq === updateEpochAtStart) {
        set({ settings });
      }
      return settings;
    } catch (err) {
      console.error('Error loading settings:', err);
      return undefined;
    }
  },

  updateSettings: async (newSettings: Partial<Settings>) => {
    const api = window.electronAPI;
    if (!api) return;
    const reqUpdateSeq = ++settingsUpdateSeq;
    try {
      const updated = await api.saveSettings(newSettings);
      if (updated && reqUpdateSeq === settingsUpdateSeq) {
        set({ settings: updated });
      }
    } catch (err) {
      console.error('Error saving settings:', err);
    }
  },
}));

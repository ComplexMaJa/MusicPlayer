import { create } from 'zustand';
import { Settings } from '../../shared/types';
import { DEFAULT_SETTINGS } from '../../shared/constants';

interface SettingsStoreState {
  settings: Settings;
  loadSettings: () => Promise<Settings | undefined>;
  updateSettings: (newSettings: Partial<Settings>) => Promise<void>;
}

export const useSettingsStore = create<SettingsStoreState>((set) => ({
  settings: DEFAULT_SETTINGS,

  loadSettings: async () => {
    if (!window.electronAPI) return undefined;
    try {
      const settings = await window.electronAPI.getSettings();
      set({ settings });
      return settings;
    } catch (err) {
      console.error('Error loading settings:', err);
      return undefined;
    }
  },

  updateSettings: async (newSettings: Partial<Settings>) => {
    if (!window.electronAPI) return;
    try {
      const updated = await window.electronAPI.saveSettings(newSettings);
      set({ settings: updated });
    } catch (err) {
      console.error('Error saving settings:', err);
    }
  },
}));

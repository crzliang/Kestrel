import { create } from 'zustand';
import {
  DEFAULT_SYSTEM_SETTINGS,
  type SystemSettings,
  type UpdateSystemSettingsInput,
} from '@kestrel/shared';
import { fetchSettings, updateSettings as apiUpdateSettings } from '../services/api';

type SettingsState = {
  settings: SystemSettings;
  loaded: boolean;
  refresh: () => Promise<void>;
  save: (patch: UpdateSystemSettingsInput) => Promise<SystemSettings>;
};

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: { ...DEFAULT_SYSTEM_SETTINGS },
  loaded: false,
  refresh: async () => {
    try {
      const res = await fetchSettings();
      set({ settings: res.settings, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },
  save: async (patch) => {
    const res = await apiUpdateSettings(patch);
    set({ settings: res.settings, loaded: true });
    return res.settings;
  },
}));

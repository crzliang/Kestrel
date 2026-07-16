import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeMode = 'light' | 'dark';

type ThemeState = {
  mode: ThemeMode;
  toggle: () => void;
  setMode: (mode: ThemeMode) => void;
};

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      mode: 'light',
      toggle: () => set({ mode: get().mode === 'light' ? 'dark' : 'light' }),
      setMode: (mode) => set({ mode }),
    }),
    { name: 'kestrel-theme' },
  ),
);

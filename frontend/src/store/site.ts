import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Site } from '@kestrel/shared';
import { fetchSites, fetchTrend } from '../services/api';

type SiteState = {
  siteId: string;
  sites: Site[];
  sparklines: Record<string, number[]>;
  loading: boolean;
  setSiteId: (id: string) => void;
  setSites: (sites: Site[]) => void;
  refreshSites: () => Promise<void>;
  refreshSparklines: () => Promise<void>;
};

export const useSiteStore = create<SiteState>()(
  persist(
    (set, get) => ({
      siteId: 'demo',
      sites: [],
      sparklines: {},
      loading: false,
      setSiteId: (siteId) => set({ siteId: siteId || 'demo' }),
      setSites: (sites) => set({ sites }),
      refreshSites: async () => {
        set({ loading: true });
        try {
          const res = await fetchSites();
          const sites = res.sites;
          set({ sites });
          const current = get().siteId;
          if (!sites.some((s) => s.id === current) && sites[0]) {
            set({ siteId: sites[0].id });
          }
          void get().refreshSparklines();
        } finally {
          set({ loading: false });
        }
      },
      refreshSparklines: async () => {
        const { sites } = get();
        const next: Record<string, number[]> = { ...get().sparklines };
        await Promise.all(
          sites.slice(0, 12).map(async (site) => {
            try {
              const trend = await fetchTrend(site.id, 7);
              next[site.id] = trend.points.map((p) => p.pv);
            } catch {
              if (!next[site.id]) next[site.id] = [0, 0, 0, 0, 0, 0, 0];
            }
          }),
        );
        set({ sparklines: next });
      },
    }),
    {
      name: 'kestrel-site',
      partialize: (s) => ({ siteId: s.siteId }),
    },
  ),
);

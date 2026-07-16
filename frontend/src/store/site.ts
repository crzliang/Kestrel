import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Site } from '@kestrel/shared';
import { fetchRealtime, fetchSites, fetchTrend } from '../services/api';
import { ALL_SITES_ID, isAllSites } from '../constants/sites';

export type SiteSummary = {
  siteId: string;
  online: number;
  pvToday: number;
};

type SiteState = {
  siteId: string;
  sites: Site[];
  sparklines: Record<string, number[]>;
  /** Workspace-wide 7d sparkline (sum across sites). */
  allSparkline: number[];
  summaries: Record<string, SiteSummary>;
  allSummary: SiteSummary;
  loading: boolean;
  setSiteId: (id: string) => void;
  setSites: (sites: Site[]) => void;
  refreshSites: () => Promise<void>;
  refreshSparklines: () => Promise<void>;
};

const emptySummary = (): SiteSummary => ({
  siteId: ALL_SITES_ID,
  online: 0,
  pvToday: 0,
});

function sumSparklines(values: number[][]): number[] {
  if (values.length === 0) return [0, 0, 0, 0, 0, 0, 0];
  const len = Math.max(...values.map((v) => v.length), 7);
  const out = Array.from({ length: len }, () => 0);
  for (const series of values) {
    for (let i = 0; i < len; i++) {
      out[i]! += series[i] ?? 0;
    }
  }
  return out;
}

export const useSiteStore = create<SiteState>()(
  persist(
    (set, get) => ({
      siteId: ALL_SITES_ID,
      sites: [],
      sparklines: {},
      allSparkline: [0, 0, 0, 0, 0, 0, 0],
      summaries: {},
      allSummary: emptySummary(),
      loading: false,
      setSiteId: (siteId) => set({ siteId: siteId || ALL_SITES_ID }),
      setSites: (sites) => set({ sites }),
      refreshSites: async () => {
        set({ loading: true });
        try {
          const res = await fetchSites();
          const sites = res.sites;
          set({ sites });
          const current = get().siteId;
          if (
            !isAllSites(current) &&
            !sites.some((s) => s.id === current) &&
            sites[0]
          ) {
            set({ siteId: ALL_SITES_ID });
          }
          void get().refreshSparklines();
        } finally {
          set({ loading: false });
        }
      },
      refreshSparklines: async () => {
        const { sites } = get();
        const nextSparks: Record<string, number[]> = { ...get().sparklines };
        const nextSummaries: Record<string, SiteSummary> = {
          ...get().summaries,
        };

        await Promise.all(
          sites.slice(0, 24).map(async (site) => {
            try {
              const [trend, realtime] = await Promise.all([
                fetchTrend(site.id, 7),
                fetchRealtime(site.id),
              ]);
              nextSparks[site.id] = trend.points.map((p) => p.pv);
              nextSummaries[site.id] = {
                siteId: site.id,
                online: realtime.online,
                pvToday: realtime.pvToday,
              };
            } catch {
              if (!nextSparks[site.id]) {
                nextSparks[site.id] = [0, 0, 0, 0, 0, 0, 0];
              }
              if (!nextSummaries[site.id]) {
                nextSummaries[site.id] = {
                  siteId: site.id,
                  online: 0,
                  pvToday: 0,
                };
              }
            }
          }),
        );

        const allSparkline = sumSparklines(Object.values(nextSparks));
        const allSummary = Object.values(nextSummaries).reduce(
          (acc, row) => ({
            siteId: ALL_SITES_ID,
            online: acc.online + row.online,
            pvToday: acc.pvToday + row.pvToday,
          }),
          emptySummary(),
        );

        set({
          sparklines: nextSparks,
          summaries: nextSummaries,
          allSparkline,
          allSummary,
        });
      },
    }),
    {
      name: 'kestrel-site',
      partialize: (s) => ({ siteId: s.siteId }),
    },
  ),
);

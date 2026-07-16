import { z } from 'zod';

export const TrackEventSchema = z.object({
  siteId: z.string().min(1).max(64),
  eventType: z.enum(['pageview', 'click', 'custom']),
  url: z.string().max(2048),
  referrer: z.string().max(2048).default(''),
  screenWidth: z.number().int().positive().max(10000),
  timestamp: z.number().int().positive(),
  visitorId: z.string().min(8).max(64),
});

export type TrackEvent = z.infer<typeof TrackEventSchema>;

export type RealtimeStats = {
  siteId: string;
  pvToday: number;
  online: number;
  ts: number;
};

export type GeoStats = {
  siteId: string;
  date: string;
  countries: Record<string, number>;
  ranking: Array<{ country: string; pv: number }>;
  ts: number;
};

export type SourceStats = {
  siteId: string;
  date: string;
  /** host → pv；直接访问为 "(direct)" */
  hosts: Record<string, number>;
  ranking: Array<{ host: string; pv: number; channel: string }>;
  /** @deprecated 兼容旧字段，等同 hosts */
  sources: Record<string, number>;
  ts: number;
};

export type PageStats = {
  siteId: string;
  date: string;
  pages: Record<string, number>;
  ranking: Array<{ path: string; pv: number }>;
  ts: number;
};

export type DeviceStats = {
  siteId: string;
  date: string;
  devices: {
    os: Record<string, number>;
    browser: Record<string, number>;
    type: Record<string, number>;
  };
  ranking: {
    os: Array<{ name: string; pv: number }>;
    browser: Array<{ name: string; pv: number }>;
    type: Array<{ name: string; pv: number }>;
    fingerprints: Array<{
      fingerprint: string;
      browser: string;
      version: string;
      pv: number;
    }>;
  };
  ts: number;
};

export type BehaviorEvent = {
  timestamp: number;
  receivedAt: number;
  visitorId: string;
  eventType: string;
  path: string;
  url: string;
  referrer: string;
  referrerHost: string;
  source: string;
  country: string;
  ipHash: string;
  /** Short hash of User-Agent — browser fingerprint, not raw UA */
  uaFingerprint: string;
  screenWidth: number;
  device: {
    os: string;
    browser: string;
    version: string;
    type: string;
  };
};

export type BehaviorStats = {
  siteId: string;
  events: BehaviorEvent[];
  note: string;
  ts: number;
};

export type DailyAggregate = {
  pv: number;
  uv: number;
  sources: Record<string, number>;
  pages: Record<string, number>;
  countries: Record<string, number>;
  devices: {
    os: Record<string, number>;
    browser: Record<string, number>;
    type: Record<string, number>;
  };
};

export {
  SiteSchema,
  CreateSiteSchema,
  UpdateSiteSchema,
  type Site,
  type CreateSiteInput,
  type UpdateSiteInput,
} from './site';

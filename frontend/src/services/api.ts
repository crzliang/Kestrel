import type {
  RealtimeStats,
  GeoStats,
  SourceStats,
  PageStats,
  DeviceStats,
  BehaviorStats,
  Site,
  CreateSiteInput,
  UpdateSiteInput,
} from '@kestrel/shared';

const API_BASE = import.meta.env.VITE_API_BASE ?? '';

async function requestJson<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

function getJson<T>(path: string) {
  return requestJson<T>(path);
}

export function fetchRealtime(siteId: string) {
  return getJson<RealtimeStats>(
    `/v1/stats/realtime?siteId=${encodeURIComponent(siteId)}`,
  );
}

export type TrendPoint = { date: string; pv: number; uv: number };

export function fetchTrend(siteId: string, days = 7) {
  return getJson<{ siteId: string; points: TrendPoint[] }>(
    `/v1/stats/trend?siteId=${encodeURIComponent(siteId)}&days=${days}`,
  );
}

export function fetchGeo(siteId: string) {
  return getJson<GeoStats>(
    `/v1/stats/geo?siteId=${encodeURIComponent(siteId)}`,
  );
}

export function fetchSources(siteId: string) {
  return getJson<SourceStats>(
    `/v1/stats/sources?siteId=${encodeURIComponent(siteId)}`,
  );
}

export function fetchPages(siteId: string, limit = 20) {
  return getJson<PageStats>(
    `/v1/stats/pages?siteId=${encodeURIComponent(siteId)}&limit=${limit}`,
  );
}

export function fetchDevices(siteId: string) {
  return getJson<DeviceStats>(
    `/v1/stats/devices?siteId=${encodeURIComponent(siteId)}`,
  );
}

export function fetchBehavior(siteId: string, limit = 50) {
  return getJson<BehaviorStats>(
    `/v1/stats/behavior?siteId=${encodeURIComponent(siteId)}&limit=${limit}`,
  );
}

export function fetchSites() {
  return getJson<{ sites: Site[]; total: number }>('/v1/sites');
}

export function createSite(input: CreateSiteInput) {
  return requestJson<{ site: Site }>('/v1/sites', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateSite(id: string, input: UpdateSiteInput) {
  return requestJson<{ site: Site }>(`/v1/sites/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function deleteSite(id: string) {
  return requestJson<void>(`/v1/sites/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export function trackingSnippet(siteId: string, endpoint?: string): string {
  const ep = endpoint || `${window.location.origin}/v1/track`;
  return `<script defer src="${window.location.origin}/kestrel.js?v=0.1.0" data-site="${siteId}" data-endpoint="${ep}"></script>`;
}

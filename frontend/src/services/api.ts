import type {
  RealtimeStats,
  GeoStats,
  SourceStats,
  PageStats,
  DeviceStats,
  BehaviorStats,
  IpStats,
  Site,
  CreateSiteInput,
  UpdateSiteInput,
  Account,
  LoginInput,
  SystemSettings,
  UpdateSystemSettingsInput,
  ChangePasswordInput,
  TotpConfirmInput,
  TotpDisableInput,
} from '@kestrel/shared';
import { getAuthToken, useAuthStore } from '../store/auth';

const API_BASE = import.meta.env.VITE_API_BASE ?? '';

export class ApiError extends Error {
  status: number;
  body: string;

  constructor(status: number, body: string) {
    super(body || `HTTP ${status}`);
    this.status = status;
    this.body = body;
  }
}

async function requestJson<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const token = getAuthToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 401 && !path.startsWith('/v1/auth/login')) {
      useAuthStore.getState().clearSession();
    }
    throw new ApiError(res.status, text || `HTTP ${res.status}`);
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

export type TrendQuery = {
  days?: number;
  startDate?: string;
  endDate?: string;
  /** 全部可用历史（服务端上限内） */
  all?: boolean;
};

export function fetchTrend(siteId: string, query: number | TrendQuery = 7) {
  const params = new URLSearchParams({
    siteId,
  });
  if (typeof query === 'number') {
    params.set('days', String(query));
  } else if (query.all) {
    params.set('range', 'all');
  } else if (query.startDate && query.endDate) {
    params.set('startDate', query.startDate);
    params.set('endDate', query.endDate);
  } else if (query.days != null) {
    params.set('days', String(query.days));
  } else {
    params.set('days', '7');
  }
  return getJson<{
    siteId: string;
    points: TrendPoint[];
    startDate?: string | null;
    endDate?: string | null;
  }>(`/v1/stats/trend?${params.toString()}`);
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

export function fetchIps(siteId: string, limit = 20) {
  return getJson<IpStats>(
    `/v1/stats/ips?siteId=${encodeURIComponent(siteId)}&limit=${limit}`,
  );
}

export function fetchDevices(siteId: string) {
  return getJson<DeviceStats>(
    `/v1/stats/devices?siteId=${encodeURIComponent(siteId)}`,
  );
}

export function fetchBehavior(
  siteId: string,
  query: number | (TrendQuery & { limit?: number }) = 100,
) {
  const params = new URLSearchParams({ siteId });
  if (typeof query === 'number') {
    params.set('limit', String(query));
    params.set('days', '7');
  } else {
    params.set('limit', String(query.limit ?? 100));
    if (query.all) {
      params.set('range', 'all');
    } else if (query.startDate && query.endDate) {
      params.set('startDate', query.startDate);
      params.set('endDate', query.endDate);
    } else if (query.days != null) {
      params.set('days', String(query.days));
    } else {
      params.set('days', '7');
    }
  }
  return getJson<BehaviorStats>(`/v1/stats/behavior?${params.toString()}`);
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

export function login(input: LoginInput) {
  return requestJson<
    | {
        token: string;
        account: Account;
        expiresAt: number;
      }
    | {
        requiresTotp: true;
        challengeToken: string;
      }
  >('/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function logout() {
  return requestJson<void>('/v1/auth/logout', { method: 'POST' });
}

export function fetchMe() {
  return requestJson<{ account: Account }>('/v1/auth/me');
}

export function changePassword(input: ChangePasswordInput) {
  return requestJson<void>('/v1/auth/password', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function beginTotpSetup() {
  return requestJson<{ secret: string; otpauthUrl: string }>(
    '/v1/auth/totp/setup',
    { method: 'POST' },
  );
}

export function confirmTotpSetup(input: TotpConfirmInput) {
  return requestJson<{ account: Account }>('/v1/auth/totp/confirm', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function disableTotp(input: TotpDisableInput) {
  return requestJson<{ account: Account }>('/v1/auth/totp/disable', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function fetchSettings() {
  return requestJson<{ settings: SystemSettings }>('/v1/settings');
}

export function updateSettings(input: UpdateSystemSettingsInput) {
  return requestJson<{ settings: SystemSettings }>('/v1/settings', {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function trackingSnippet(siteId: string, endpoint?: string): string {
  const ep = endpoint || `${window.location.origin}/v1/track`;
  return `<script defer src="${window.location.origin}/kestrel.js?v=0.1.0" data-site="${siteId}" data-endpoint="${ep}"></script>`;
}

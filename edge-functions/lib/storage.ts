/** EdgeOne KV binding (bound in console as variable `kestrel_kv`). */
export type KvNamespace = {
  get(
    key: string,
    type?: 'text' | 'json' | 'arrayBuffer' | 'stream' | { type: string },
  ): Promise<string | object | ArrayBuffer | ReadableStream | null>;
  put(
    key: string,
    value: string | ArrayBuffer | ArrayBufferView | ReadableStream,
  ): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: {
    prefix?: string;
    limit?: number;
    cursor?: string;
  }): Promise<{
    complete: boolean;
    cursor: string | null;
    keys: Array<{ key: string }>;
  }>;
};

export type SoftTTL<T> = { v: T; exp: number };

declare const kestrel_kv: KvNamespace | undefined;

const memory = new Map<string, string>();

function memoryKv(): KvNamespace {
  return {
    async get(key, type) {
      const raw = memory.get(key);
      if (raw == null) return null;
      if (type === 'json' || (typeof type === 'object' && type?.type === 'json')) {
        return JSON.parse(raw) as object;
      }
      return raw;
    },
    async put(key, value) {
      const text =
        typeof value === 'string'
          ? value
          : new TextDecoder().decode(value as ArrayBuffer);
      memory.set(key, text);
    },
    async delete(key) {
      memory.delete(key);
    },
    async list(options = {}) {
      const prefix = options.prefix ?? '';
      const limit = options.limit ?? 256;
      const keys = [...memory.keys()]
        .filter((k) => k.startsWith(prefix))
        .sort()
        .map((key) => ({ key }));
      const start = options.cursor
        ? keys.findIndex((k) => k.key === options.cursor)
        : 0;
      const slice = keys.slice(Math.max(0, start), Math.max(0, start) + limit);
      const complete = start + limit >= keys.length;
      return {
        complete,
        cursor: complete ? null : (slice[slice.length - 1]?.key ?? null),
        keys: slice,
      };
    },
  };
}

export function getKv(): KvNamespace {
  if (typeof kestrel_kv !== 'undefined' && kestrel_kv) return kestrel_kv;
  return memoryKv();
}

export async function kvGetText(key: string): Promise<string | null> {
  return (await getKv().get(key)) as string | null;
}

export async function kvGetJson<T>(key: string): Promise<T | null> {
  return (await getKv().get(key, { type: 'json' })) as T | null;
}

export async function kvPutText(key: string, value: string): Promise<void> {
  await getKv().put(key, value);
}

export async function kvPutJson(key: string, value: unknown): Promise<void> {
  await getKv().put(key, JSON.stringify(value));
}

export async function kvPutSoftTTL(
  key: string,
  value: unknown,
  ttlSeconds: number,
): Promise<void> {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  await kvPutJson(key, { v: value, exp } satisfies SoftTTL<unknown>);
}

export async function kvGetSoftTTL<T>(key: string): Promise<T | null> {
  const row = await kvGetJson<SoftTTL<T>>(key);
  if (!row) return null;
  if (row.exp < Math.floor(Date.now() / 1000)) {
    void getKv().delete(key);
    return null;
  }
  return row.v;
}

/** Non-atomic increment; slight race under multi-edge is acceptable for MVP PV. */
export async function kvIncr(key: string, delta = 1): Promise<number> {
  const cur = Number((await kvGetText(key)) ?? '0');
  const next = cur + delta;
  await kvPutText(key, String(next));
  return next;
}

const memoryBlob = new Map<string, string>();

type BlobStore = {
  set(key: string, value: string): Promise<void>;
  setJSON(key: string, value: unknown): Promise<void>;
  get(
    key: string,
    options?: { type?: string; consistency?: string },
  ): Promise<unknown>;
  list(options?: {
    prefix?: string;
    consistency?: string;
  }): Promise<{ blobs: Array<{ key: string; etag: string }> }>;
};

function memoryBlobStore(): BlobStore {
  return {
    async set(key, value) {
      memoryBlob.set(key, value);
    },
    async setJSON(key, value) {
      memoryBlob.set(key, JSON.stringify(value));
    },
    async get(key, options) {
      const raw = memoryBlob.get(key);
      if (raw == null) return null;
      if (options?.type === 'json') return JSON.parse(raw);
      return raw;
    },
    async list(options = {}) {
      const prefix = options.prefix ?? '';
      const blobs = [...memoryBlob.keys()]
        .filter((k) => k.startsWith(prefix))
        .map((key) => ({ key, etag: 'mem' }));
      return { blobs };
    },
  };
}

let blobStore: BlobStore | null = null;

function preferMemoryStorage(): boolean {
  try {
    const env = (globalThis as { process?: { env?: Record<string, string> } })
      .process?.env;
    const flag = env?.KESTREL_STORAGE ?? '';
    return flag === 'memory' || flag === 'test';
  } catch {
    return false;
  }
}

async function getBlob(): Promise<BlobStore> {
  if (blobStore) return blobStore;
  if (preferMemoryStorage()) {
    blobStore = memoryBlobStore();
    return blobStore;
  }
  try {
    const mod = await import('@edgeone/pages-blob');
    blobStore = mod.getStore('kestrel-blob') as BlobStore;
  } catch {
    blobStore = memoryBlobStore();
  }
  return blobStore;
}

export function rawShardPath(siteId: string, d: Date, shard: string): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const h = String(d.getUTCHours()).padStart(2, '0');
  return `sites/${siteId}/raw/${y}/${m}/${day}/${h}/${shard}.ndjson`;
}

export function dailyAggPath(siteId: string, ymd: string): string {
  return `sites/${siteId}/aggregates/daily/${ymd}.json`;
}

export async function appendRawEvent(
  siteId: string,
  event: Record<string, unknown>,
): Promise<void> {
  const now = new Date();
  const shard = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const key = rawShardPath(siteId, now, shard);
  const store = await getBlob();
  await store.set(key, `${JSON.stringify(event)}\n`);
}

export async function getDailyAggregate<T>(
  siteId: string,
  ymd: string,
  strong = false,
): Promise<T | null> {
  const store = await getBlob();
  return (await store.get(dailyAggPath(siteId, ymd), {
    type: 'json',
    consistency: strong ? 'strong' : 'eventual',
  })) as T | null;
}

export async function putDailyAggregate(
  siteId: string,
  ymd: string,
  data: unknown,
): Promise<void> {
  const store = await getBlob();
  await store.setJSON(dailyAggPath(siteId, ymd), data);
}

export function utcYmd(ts = Date.now()): string {
  const d = new Date(ts);
  return [
    d.getUTCFullYear(),
    String(d.getUTCMonth() + 1).padStart(2, '0'),
    String(d.getUTCDate()).padStart(2, '0'),
  ].join('');
}

export function pvDayKey(siteId: string, ts = Date.now()): string {
  return `pv_day_${siteId}_${utcYmd(ts)}`;
}

export function onlineKey(siteId: string, visitorId: string): string {
  return `online_${siteId}_${visitorId}`;
}

export function rateKey(siteId: string, ipHash: string): string {
  const minute = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
  return `rate_${siteId}_${ipHash}_${minute}`;
}

export function geoDayKey(siteId: string, ts = Date.now()): string {
  return `geo_day_${siteId}_${utcYmd(ts)}`;
}

/** Increment country counter for the day (ISO alpha-2). */
export async function kvIncrCountry(
  siteId: string,
  country: string,
  ts = Date.now(),
): Promise<Record<string, number>> {
  const key = geoDayKey(siteId, ts);
  const map = (await kvGetJson<Record<string, number>>(key)) ?? {};
  const code = country.toUpperCase();
  map[code] = (map[code] ?? 0) + 1;
  await kvPutJson(key, map);
  return map;
}

export function sourceDayKey(siteId: string, ts = Date.now()): string {
  return `src_day_${siteId}_${utcYmd(ts)}`;
}

export function deviceDayKey(siteId: string, ts = Date.now()): string {
  return `dev_day_${siteId}_${utcYmd(ts)}`;
}

export function pageDayKey(siteId: string, ts = Date.now()): string {
  return `page_day_${siteId}_${utcYmd(ts)}`;
}

export function recentKey(siteId: string): string {
  return `recent_${siteId}`;
}

export async function kvIncrNested(
  key: string,
  path: string[],
  delta = 1,
): Promise<void> {
  const root = (await kvGetJson<Record<string, unknown>>(key)) ?? {};
  let cursor: Record<string, unknown> = root;
  for (let i = 0; i < path.length - 1; i++) {
    const seg = path[i]!;
    const next = cursor[seg];
    if (!next || typeof next !== 'object') {
      cursor[seg] = {};
    }
    cursor = cursor[seg] as Record<string, unknown>;
  }
  const leaf = path[path.length - 1]!;
  cursor[leaf] = Number(cursor[leaf] ?? 0) + delta;
  await kvPutJson(key, root);
}

export async function kvIncrFlatField(
  key: string,
  field: string,
  delta = 1,
): Promise<Record<string, number>> {
  const map = (await kvGetJson<Record<string, number>>(key)) ?? {};
  map[field] = (map[field] ?? 0) + delta;
  await kvPutJson(key, map);
  return map;
}

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
  /** SHA-256 short hash of IP — never store raw IP by default */
  ipHash: string;
  screenWidth: number;
  device: {
    os: string;
    browser: string;
    type: string;
  };
};

const RECENT_LIMIT = 100;

export async function pushRecentEvent(
  siteId: string,
  event: BehaviorEvent,
): Promise<void> {
  const key = recentKey(siteId);
  const list = (await kvGetJson<BehaviorEvent[]>(key)) ?? [];
  list.unshift(event);
  await kvPutJson(key, list.slice(0, RECENT_LIMIT));
}

export async function getRecentEvents(
  siteId: string,
  limit = 50,
): Promise<BehaviorEvent[]> {
  const list = (await kvGetJson<BehaviorEvent[]>(recentKey(siteId))) ?? [];
  return list.slice(0, Math.min(100, Math.max(1, limit)));
}

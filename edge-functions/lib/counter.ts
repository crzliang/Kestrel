import { kvGetText, kvIncr, kvPutText, kvReadCount } from './storage';

export type VisitCounts = {
  site_pv: number;
  page_pv: number;
  site_uv: number;
  page_uv: number;
};

/** Page identity: pathname plus query string. Hashed before it becomes a KV key. */
export function pagePath(input: string): string {
  const raw = input.trim();
  if (!raw) return '/';
  try {
    const u = new URL(raw, 'https://kestrel.local');
    return ((u.pathname || '/') + (u.search || '')).slice(0, 2048);
  } catch {
    return raw.startsWith('/') ? raw.slice(0, 2048) : '/';
  }
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(input),
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function sitePvKey(siteId: string): string {
  return `spv_${siteId}`;
}

export function siteUvKey(siteId: string): string {
  return `suv_${siteId}`;
}

export function pagePvKey(siteId: string, pathHash: string): string {
  return `ppv_${siteId}_${pathHash}`;
}

export function pageUvKey(siteId: string, pathHash: string): string {
  return `puv_${siteId}_${pathHash}`;
}

export function siteSeenKey(siteId: string, visitorId: string): string {
  return `seen_${siteId}_${visitorId}`;
}

export function pageSeenKey(
  siteId: string,
  pathHash: string,
  visitorId: string,
): string {
  return `seen_${siteId}_${pathHash}_${visitorId}`;
}

async function bumpUnique(
  seenKey: string,
  counterKey: string,
): Promise<number> {
  const seen = await kvGetText(seenKey);
  if (seen != null) return kvReadCount(counterKey);
  await kvPutText(seenKey, '1');
  return kvIncr(counterKey);
}

/** One page view: always bump PV, bump UV only the first time this visitor is seen. */
export async function recordVisit(
  siteId: string,
  pathHash: string,
  visitorId: string,
): Promise<VisitCounts> {
  const site_pv = await kvIncr(sitePvKey(siteId));
  const page_pv = await kvIncr(pagePvKey(siteId, pathHash));
  const site_uv = await bumpUnique(
    siteSeenKey(siteId, visitorId),
    siteUvKey(siteId),
  );
  const page_uv = await bumpUnique(
    pageSeenKey(siteId, pathHash, visitorId),
    pageUvKey(siteId, pathHash),
  );
  return { site_pv, page_pv, site_uv, page_uv };
}

export async function readCounts(
  siteId: string,
  pathHash: string | null,
): Promise<VisitCounts> {
  const site_pv = await kvReadCount(sitePvKey(siteId));
  const site_uv = await kvReadCount(siteUvKey(siteId));
  if (!pathHash) {
    return { site_pv, page_pv: 0, site_uv, page_uv: 0 };
  }
  return {
    site_pv,
    page_pv: await kvReadCount(pagePvKey(siteId, pathHash)),
    site_uv,
    page_uv: await kvReadCount(pageUvKey(siteId, pathHash)),
  };
}

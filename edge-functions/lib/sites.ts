import type { Site } from '@kestrel/shared';
import { kvGetJson, kvPutJson, getKv } from './storage';

const INDEX_KEY = 'sites_index';

export function siteConfigKey(siteId: string): string {
  return `config_${siteId}`;
}

function newSiteId(): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `site_${Date.now().toString(36)}_${rand}`;
}

export async function listSiteIds(): Promise<string[]> {
  return (await kvGetJson<string[]>(INDEX_KEY)) ?? [];
}

async function saveSiteIds(ids: string[]): Promise<void> {
  await kvPutJson(INDEX_KEY, ids);
}

export async function getSite(siteId: string): Promise<Site | null> {
  return kvGetJson<Site>(siteConfigKey(siteId));
}

export async function listSites(): Promise<Site[]> {
  const ids = await listSiteIds();
  const sites: Site[] = [];
  for (const id of ids) {
    const site = await getSite(id);
    if (site) sites.push(site);
  }
  return sites.sort((a, b) => b.createdAt - a.createdAt);
}

export async function ensureDemoSite(): Promise<Site[]> {
  const existing = await listSites();
  if (existing.length > 0) return existing;

  const now = Date.now();
  const demo: Site = {
    id: 'demo',
    name: 'Demo Site',
    domain: 'example.com',
    createdAt: now,
    updatedAt: now,
  };
  await kvPutJson(siteConfigKey(demo.id), demo);
  await saveSiteIds([demo.id]);
  return [demo];
}

export async function createSite(input: {
  id?: string;
  name: string;
  domain?: string;
}): Promise<Site> {
  const id = (input.id?.trim() || newSiteId()).toLowerCase();
  const existing = await getSite(id);
  if (existing) {
    throw Object.assign(new Error('site_exists'), { status: 409 });
  }

  const now = Date.now();
  const site: Site = {
    id,
    name: input.name.trim(),
    domain: (input.domain ?? '').trim(),
    createdAt: now,
    updatedAt: now,
  };

  await kvPutJson(siteConfigKey(id), site);
  const ids = await listSiteIds();
  if (!ids.includes(id)) {
    ids.push(id);
    await saveSiteIds(ids);
  }
  return site;
}

export async function updateSite(
  siteId: string,
  patch: { name?: string; domain?: string },
): Promise<Site> {
  const current = await getSite(siteId);
  if (!current) {
    throw Object.assign(new Error('not_found'), { status: 404 });
  }

  const next: Site = {
    ...current,
    name: patch.name?.trim() ?? current.name,
    domain: patch.domain !== undefined ? patch.domain.trim() : current.domain,
    updatedAt: Date.now(),
  };
  await kvPutJson(siteConfigKey(siteId), next);
  return next;
}

export async function deleteSite(siteId: string): Promise<void> {
  const current = await getSite(siteId);
  if (!current) {
    throw Object.assign(new Error('not_found'), { status: 404 });
  }
  await getKv().delete(siteConfigKey(siteId));
  const ids = (await listSiteIds()).filter((id) => id !== siteId);
  await saveSiteIds(ids);
}

export async function assertSiteExists(siteId: string): Promise<Site> {
  const site = await getSite(siteId);
  if (!site) {
    // Auto-bootstrap unknown sites into index on first track for smoother onboarding
    // only if index is empty; otherwise reject.
    const ids = await listSiteIds();
    if (ids.length === 0) {
      const now = Date.now();
      const created: Site = {
        id: siteId,
        name: siteId,
        domain: '',
        createdAt: now,
        updatedAt: now,
      };
      await kvPutJson(siteConfigKey(siteId), created);
      await saveSiteIds([siteId]);
      return created;
    }
    throw Object.assign(new Error('unknown_site'), { status: 404 });
  }
  return site;
}

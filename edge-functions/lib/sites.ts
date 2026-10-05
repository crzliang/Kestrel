import {
  isRequestHostAllowed,
  parseSitesConfig,
  type Site,
} from '@kestrel/shared';
import rawConfig from '../../sites.json';

function cloneSite(site: Site): Site {
  return { id: site.id, domain: [...site.domain] };
}

/**
 * Hostnames are read from the repo file `sites.json` when this module loads.
 * The first site whose allowlist contains the host wins. An empty allowlist never matches.
 */
const sites: Site[] = parseSitesConfig(rawConfig);

export function matchSiteByHost(
  list: readonly Site[],
  host: string,
): Site | null {
  for (const site of list) {
    if (isRequestHostAllowed(host, site.domain)) return site;
  }
  return null;
}

export function listSites(): Site[] {
  return sites.map(cloneSite);
}

export function getSite(siteId: string): Site | null {
  const id = siteId.trim().toLowerCase();
  const site = sites.find((item) => item.id === id);
  return site ? cloneSite(site) : null;
}

export function findSiteByHost(host: string): Site | null {
  const site = matchSiteByHost(sites, host);
  return site ? cloneSite(site) : null;
}

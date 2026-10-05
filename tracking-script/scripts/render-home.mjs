import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const templatePath = join(dirname(fileURLToPath(import.meta.url)), '..', 'site', 'index.html');

/** First sites.json entry that lists at least one hostname. */
export function homepageSiteId(repoRoot) {
  const raw = JSON.parse(readFileSync(join(repoRoot, 'sites.json'), 'utf8'));
  const sites = Array.isArray(raw?.sites) ? raw.sites : [];
  const site = sites.find(
    (item) => item && typeof item.id === 'string' && Array.isArray(item.domain) && item.domain.length > 0,
  );
  if (!site) return '';
  return site.id.trim().toLowerCase();
}

/** Fill the public homepage from sites.json. */
export function renderHomepage(repoRoot, version = '0.1.0') {
  const siteId = homepageSiteId(repoRoot);
  const safeVersion = /^[A-Za-z0-9._-]+$/.test(version) ? version : '0.1.0';
  const template = readFileSync(templatePath, 'utf8');
  return template.replaceAll('%%SITE_ID%%', siteId).replaceAll('%%VERSION%%', safeVersion);
}

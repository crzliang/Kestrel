#!/usr/bin/env node
/**
 * Import the local busuanzi CSV snapshots into Kestrel.
 *
 * Usage:
 *   KESTREL_IMPORT_TOKEN=... node scripts/import-busuanzi.mjs
 *
 * Optional:
 *   KESTREL_IMPORT_URL=https://kestrel.crzliang.cn/v1/import
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const dataDir = join(root, 'docs', 'data');
const endpoint = process.env.KESTREL_IMPORT_URL || 'https://kestrel.crzliang.cn/v1/import';
const token = process.env.KESTREL_IMPORT_TOKEN;

const SITES = [
  { id: 'www', origin: 'https://www.crzliang.cn', file: 'busuanzi-www.csv' },
  { id: 'blog', origin: 'https://blog.crzliang.cn', file: 'busuanzi-blog.csv' },
];

if (!token) {
  console.error('KESTREL_IMPORT_TOKEN is required');
  process.exit(1);
}

function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  const columns = lines.shift().split(',');
  return lines.map((line) => {
    const cells = line.split(',');
    const row = {};
    columns.forEach((column, index) => {
      row[column] = cells[index] ?? '';
    });
    return row;
  });
}

async function importSite(site) {
  const file = join(dataDir, site.file);
  if (!existsSync(file)) throw new Error(`missing ${file}`);
  const rows = parseCsv(readFileSync(file, 'utf8'));
  const siteRow = rows.find((row) => row.type === 'site');
  const pages = rows
    .filter((row) => row.type === 'page')
    .map((row) => ({ path: row.path, pagePv: Number(row.page_pv) }));

  const body = {
    siteId: site.id,
    sitePv: Number(siteRow.site_pv),
    siteUv: Number(siteRow.site_uv),
    pages,
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${site.id}: HTTP ${response.status} ${JSON.stringify(result)}`);
  }
  console.log(`imported ${site.id}: ${JSON.stringify(result)}`);

  const check = new URL('https://kestrel.crzliang.cn/v1/track');
  check.searchParams.set('siteId', site.id);
  check.searchParams.set('path', '/');
  const read = await fetch(check, { headers: { Origin: site.origin } });
  console.log(`verify ${site.id}: ${read.status} ${await read.text()}`);
}

for (const site of SITES) {
  await importSite(site);
}

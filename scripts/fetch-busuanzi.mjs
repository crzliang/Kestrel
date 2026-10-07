#!/usr/bin/env node
/**
 * Snapshot original busuanzi counters into CSV files.
 *
 * The original busuanzi endpoint increments the counters on every read, so the
 * script subtracts the read that produced each value. page_uv is not exposed by
 * the original service and is left empty.
 *
 * Progress is written after every successful page so a retry never reads the
 * same URL twice.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const outDir = join(root, 'docs', 'data');
const requested = new Set(process.argv.slice(2));
const capturedAt = new Date().toISOString();

const SITES = [
  {
    id: 'www',
    origin: 'https://www.crzliang.cn',
    urls: ['https://www.crzliang.cn/'],
  },
  {
    id: 'blog',
    origin: 'https://blog.crzliang.cn',
    sitemap: 'https://blog.crzliang.cn/sitemap-index.xml',
  },
];

const ENDPOINT = 'https://busuanzi.ibruce.info/busuanzi?jsonpCallback=BusuanziCallback';
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36';
const DELAY_MS = 350;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cookieFor(host) {
  return createHash('md5').update(host).digest('hex').toUpperCase();
}

async function fetchBusuanzi(pageUrl, cookie, attempts = 6) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(ENDPOINT, {
        headers: {
          Referer: pageUrl,
          'User-Agent': USER_AGENT,
          Accept: 'application/javascript, */*; q=0.1',
          Cookie: `busuanziId=${cookie}`,
        },
      });
      const text = await response.text();
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 120)}`);
      const match = text.match(/BusuanziCallback\((.*?)\);/);
      if (!match) throw new Error(`unexpected response: ${text.slice(0, 160)}`);
      return JSON.parse(match[1]);
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(1000 * attempt);
    }
  }
  throw lastError;
}

async function readSitemap(url, seen = new Set()) {
  if (seen.has(url)) return [];
  seen.add(url);
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  const xml = await response.text();
  if (!response.ok) throw new Error(`sitemap ${url}: HTTP ${response.status}`);
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1].trim());
  if (/<sitemapindex[\s>]/i.test(xml)) {
    const nested = [];
    for (const loc of locs) nested.push(...(await readSitemap(loc, seen)));
    return nested;
  }
  return locs;
}

function csvCell(value) {
  const text = value == null ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(rows) {
  const columns = [
    'type',
    'site_id',
    'url',
    'path',
    'site_pv',
    'site_uv',
    'page_pv',
    'page_uv',
    'captured_at',
    'note',
  ];
  const lines = [columns.join(',')];
  for (const row of rows) {
    lines.push(columns.map((column) => csvCell(row[column])).join(','));
  }
  return `${lines.join('\n')}\n`;
}

function progressPath(siteId) {
  return join(outDir, `busuanzi-${siteId}.progress.json`);
}

function loadProgress(siteId) {
  const file = progressPath(siteId);
  if (!existsSync(file)) return { site: null, pages: {} };
  return JSON.parse(readFileSync(file, 'utf8'));
}

function saveProgress(siteId, progress) {
  writeFileSync(progressPath(siteId), `${JSON.stringify(progress, null, 2)}\n`);
}

async function snapshot(site) {
  mkdirSync(outDir, { recursive: true });
  const progress = loadProgress(site.id);
  const urls = [...new Set(site.urls ?? (await readSitemap(site.sitemap)))];
  const rootUrl = `${site.origin}/`;
  if (!urls.includes(rootUrl)) urls.unshift(rootUrl);

  const cookie = cookieFor(new URL(site.origin).hostname);
  if (!progress.site) {
    const counts = await fetchBusuanzi(rootUrl, cookie);
    progress.site = {
      site_pv: Math.max(0, counts.site_pv - 1),
      site_uv: Math.max(0, counts.site_uv - 1),
      page_pv: Math.max(0, counts.page_pv - 1),
    };
    saveProgress(site.id, progress);
  }

  for (const url of urls) {
    if (progress.pages[url]) continue;
    try {
      const counts = url === rootUrl && progress.site.page_pv != null
        ? { page_pv: progress.site.page_pv + 1 }
        : await fetchBusuanzi(url, cookie);
      progress.pages[url] = {
        page_pv: Math.max(0, counts.page_pv - 1),
      };
      saveProgress(site.id, progress);
      console.log(`[ok] ${url}`);
    } catch (error) {
      console.error(`[fail] ${url}: ${error.message}`);
    }
    await sleep(DELAY_MS);
  }

  const rows = [
    {
      type: 'site',
      site_id: site.id,
      url: rootUrl,
      path: '/',
      site_pv: progress.site.site_pv,
      site_uv: progress.site.site_uv,
      page_pv: '',
      page_uv: '',
      captured_at: capturedAt,
      note: 'busuanzi 原版没有 page_uv',
    },
  ];

  for (const url of urls) {
    const page = progress.pages[url];
    if (!page) continue;
    const parsed = new URL(url);
    rows.push({
      type: 'page',
      site_id: site.id,
      url,
      path: parsed.pathname + parsed.search,
      site_pv: progress.site.site_pv,
      site_uv: progress.site.site_uv,
      page_pv: page.page_pv,
      page_uv: '',
      captured_at: capturedAt,
      note: 'page_uv 原版不蒜子未提供',
    });
  }

  const file = join(outDir, `busuanzi-${site.id}.csv`);
  writeFileSync(file, toCsv(rows));
  console.log(`wrote ${file} (${rows.length - 1} pages, ${urls.length - rows.length + 1} missing)`);
}

async function main() {
  for (const site of SITES) {
    if (requested.size > 0 && !requested.has(site.id)) continue;
    await snapshot(site);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

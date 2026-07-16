#!/usr/bin/env node
/**
 * Generate local preview fixtures into .kestrel/mock/ (gitignored).
 * Usage: node scripts/seed-mock.mjs
 */
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, '.kestrel', 'mock');

const SITES = [
  { id: 'urbanbite', name: 'UrbanBite Delivery', domain: 'urbanbite.example' },
  { id: 'blog', name: 'Blog', domain: 'blog.example.com' },
  { id: 'northstar', name: 'Northstar Commerce', domain: 'northstar.shop' },
  { id: 'pulsefit', name: 'PulseFit', domain: 'pulsefit.app' },
  { id: 'demo', name: 'Demo Site', domain: 'example.com' },
];

const PATHS = [
  '/',
  '/cart',
  '/checkout',
  '/products',
  '/products/sku-1024',
  '/blog/launch',
  '/pricing',
  '/docs/getting-started',
  '/account/settings',
  '/search',
];

const REF_HOSTS = [
  'reddit.com',
  'github.com',
  'www.google.com',
  'twitter.com',
  'www.bing.com',
  'www.producthunt.com',
  'news.ycombinator.com',
  'www.baidu.com',
  'linkedin.com',
  'youtube.com',
  '(direct)',
];

const COUNTRIES = ['CN', 'US', 'JP', 'SG', 'DE', 'GB', 'KR', 'AU', 'IN', 'BR'];
const OS_LIST = ['iOS', 'Android', 'Mac OS', 'Windows', 'Linux'];
const BROWSERS = [
  { name: 'Safari', version: '17.5' },
  { name: 'Chrome', version: '126.0.0.0' },
  { name: 'Firefox', version: '127.0' },
  { name: 'Edge', version: '126.0.0.0' },
  { name: 'Samsung Internet', version: '25.0' },
];
const TYPES = ['mobile', 'desktop', 'tablet'];

function channelOf(host) {
  if (!host || host === '(direct)') return 'direct';
  if (/google\.|bing\.|baidu\.|duckduckgo\./.test(host)) return 'search';
  if (/twitter\.|x\.com|reddit\.|linkedin\.|youtube\.|facebook\./.test(host))
    return 'social';
  if (/mail\.|outlook\./.test(host)) return 'email';
  return 'referral';
}

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(arr) {
  return arr[rand(0, arr.length - 1)];
}

function weighted(map) {
  const entries = Object.entries(map);
  const total = entries.reduce((s, [, n]) => s + n, 0);
  return entries
    .map(([name, pv]) => ({ name, pv }))
    .sort((a, b) => b.pv - a.pv);
}

function daysAgo(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function hash12(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, '0').slice(0, 12);
}

function buildSiteBundle(site, idx) {
  const now = Date.now();
  const base = 80 + idx * 40;

  const trendPoints = Array.from({ length: 90 }, (_, i) => {
    const day = 89 - i;
    const wave = Math.sin(i / 2.4 + idx) * 22;
    return {
      date: daysAgo(day),
      pv: Math.max(12, Math.round(base + wave + rand(-15, 35))),
      uv: Math.max(8, Math.round(base * 0.45 + wave * 0.5 + rand(-8, 18))),
    };
  });

  const hosts = {};
  for (const h of REF_HOSTS) hosts[h] = rand(8, 70 + idx * 8);
  hosts['(direct)'] = rand(50, 140);
  hosts['www.google.com'] = rand(40, 120);
  hosts['github.com'] = rand(20, 80);

  const pages = {};
  for (const p of PATHS) pages[p] = rand(5, 90 + idx * 8);
  pages['/'] = rand(100, 220);
  pages['/cart'] = rand(40, 110);

  const countries = {};
  for (const c of COUNTRIES) countries[c] = rand(2, 60 + idx * 5);
  countries.CN = rand(40, 160);
  countries.US = rand(20, 90);

  const devices = {
    os: Object.fromEntries(OS_LIST.map((o) => [o, rand(5, 70)])),
    browser: Object.fromEntries(BROWSERS.map((b) => [b.name, rand(8, 80)])),
    type: {
      mobile: rand(50, 140),
      desktop: rand(40, 120),
      tablet: rand(5, 30),
    },
  };

  const fingerprints = BROWSERS.map((b, i) => ({
    fingerprint: hash12(`ua-${site.id}-${b.name}-${b.version}-${i}`),
    browser: b.name,
    version: b.version,
    pv: devices.browser[b.name] ?? rand(8, 80),
  })).sort((a, b) => b.pv - a.pv);

  const events = Array.from({ length: 48 }, (_, i) => {
    const path = pick(PATHS);
    const ref = pick(REF_HOSTS);
    const host = ref === '(direct)' ? '' : ref;
    const source = channelOf(ref);
    const country = pick(COUNTRIES);
    const deviceType = pick(TYPES);
    const browserInfo = pick(BROWSERS);
    const ts = now - i * rand(40_000, 180_000);
    return {
      timestamp: ts - 1000,
      receivedAt: ts,
      visitorId: `vid_${hash12(`${site.id}-${i}`)}abcdef`,
      eventType: i % 9 === 0 ? 'click' : 'pageview',
      path,
      url: `https://${site.domain}${path}`,
      referrer: host ? `https://${host}/` : '',
      referrerHost: host,
      source,
      country,
      ipHash: hash12(`ip-${site.id}-${i}`),
      uaFingerprint: hash12(`ua-${site.id}-${browserInfo.name}-${browserInfo.version}`),
      screenWidth: deviceType === 'mobile' ? pick([390, 414, 375]) : pick([1440, 1920, 1280]),
      device: {
        os: pick(OS_LIST),
        browser: browserInfo.name,
        version: browserInfo.version,
        type: deviceType,
      },
    };
  });

  const online = rand(3, 28);
  const pvToday = trendPoints[trendPoints.length - 1]?.pv ?? base;

  return {
    realtime: {
      siteId: site.id,
      pvToday: pvToday + rand(20, 80),
      online,
      ts: now,
    },
    trend: {
      siteId: site.id,
      granularity: 'day',
      points: trendPoints,
    },
    geo: {
      siteId: site.id,
      date: daysAgo(0),
      countries,
      ranking: Object.entries(countries)
        .map(([country, pv]) => ({ country, pv }))
        .sort((a, b) => b.pv - a.pv),
      ts: now,
    },
    sources: {
      siteId: site.id,
      date: daysAgo(0),
      hosts,
      sources: hosts,
      ranking: Object.entries(hosts)
        .map(([host, pv]) => ({ host, pv, channel: channelOf(host) }))
        .sort((a, b) => b.pv - a.pv),
      ts: now,
    },
    pages: {
      siteId: site.id,
      date: daysAgo(0),
      pages,
      ranking: Object.entries(pages)
        .map(([path, pv]) => ({ path, pv }))
        .sort((a, b) => b.pv - a.pv),
      ts: now,
    },
    devices: {
      siteId: site.id,
      date: daysAgo(0),
      devices,
      ranking: {
        os: weighted(devices.os),
        browser: weighted(devices.browser),
        type: weighted(devices.type),
        fingerprints,
      },
      ts: now,
    },
    behavior: {
      siteId: site.id,
      events,
      note: 'ipHash is a truncated SHA-256 of client IP; raw IP is never stored',
      ts: now,
    },
  };
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const now = Date.now();
const sites = SITES.map((s, i) => ({
  ...s,
  createdAt: now - (SITES.length - i) * 86_400_000,
  updatedAt: now - i * 3_600_000,
}));

writeFileSync(join(outDir, 'sites.json'), JSON.stringify({ sites, total: sites.length }, null, 2));

for (const [idx, site] of sites.entries()) {
  const dir = join(outDir, site.id);
  mkdirSync(dir, { recursive: true });
  const bundle = buildSiteBundle(site, idx);
  for (const [key, value] of Object.entries(bundle)) {
    writeFileSync(join(dir, `${key}.json`), JSON.stringify(value, null, 2));
  }
}

writeFileSync(
  join(outDir, 'meta.json'),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      siteCount: sites.length,
      note: 'Local preview fixtures only. Do not commit.',
    },
    null,
    2,
  ),
);

console.log(`Seeded mock data → ${outDir}`);
console.log(`Sites: ${sites.map((s) => s.id).join(', ')}`);

/**
 * Local smoke tests for track → KV/Blob → realtime/trend.
 * Run: KESTREL_STORAGE=memory npx tsx scripts/smoke.ts
 */
import { readFileSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TrackEventSchema } from '@kestrel/shared';
import { onRequestPost as trackPost } from '../edge-functions/v1/track';
import { onRequestGet as realtimeGet } from '../edge-functions/v1/stats/realtime';
import { onRequestGet as trendGet } from '../edge-functions/v1/stats/trend';
import { onRequestGet as geoGet } from '../edge-functions/v1/stats/geo';
import { onRequestGet as sourcesGet } from '../edge-functions/v1/stats/sources';
import { onRequestGet as pagesGet } from '../edge-functions/v1/stats/pages';
import { onRequestGet as devicesGet } from '../edge-functions/v1/stats/devices';
import { onRequestGet as behaviorGet } from '../edge-functions/v1/stats/behavior';
import {
  onRequestGet as sitesListGet,
  onRequestPost as sitesCreate,
} from '../edge-functions/v1/sites';
import {
  onRequestGet as siteGet,
  onRequestPatch as sitePatch,
  onRequestDelete as siteDelete,
} from '../edge-functions/v1/sites/[id]';
import { putDailyAggregate } from '../edge-functions/lib/storage';
import { parseUserAgent } from '../edge-functions/lib/parser';
import { resolveClientGeo } from '../edge-functions/lib/geo';
import { classifySource } from '../edge-functions/lib/referrer';
import { createSite, ensureDemoSite } from '../edge-functions/lib/sites';

process.env.KESTREL_STORAGE = 'memory';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

let passed = 0;
let failed = 0;

function assert(cond: unknown, msg: string): void {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${msg}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${msg}`);
  }
}

async function testSchema(): Promise<void> {
  console.log('\n[schema]');
  const ok = TrackEventSchema.safeParse({
    siteId: 'demo',
    eventType: 'pageview',
    url: 'https://example.com/',
    referrer: '',
    screenWidth: 1440,
    timestamp: Date.now(),
    visitorId: 'visitor_abcdefgh',
  });
  assert(ok.success, 'valid pageview parses');

  const bad = TrackEventSchema.safeParse({ siteId: '', eventType: 'pageview' });
  assert(!bad.success, 'invalid payload rejected');
}

async function testParser(): Promise<void> {
  console.log('\n[parser]');
  const desktop = parseUserAgent(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  );
  assert(desktop.browser === 'Chrome', `browser=Chrome (got ${desktop.browser})`);
  assert(desktop.version.startsWith('126'), `version~126 (got ${desktop.version})`);
  assert(desktop.type === 'desktop', `type=desktop (got ${desktop.type})`);

  const firefox = parseUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0',
  );
  assert(firefox.browser === 'Firefox', `browser=Firefox (got ${firefox.browser})`);
  assert(firefox.version.startsWith('127'), `version~127 (got ${firefox.version})`);

  const safari = parseUserAgent(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  );
  assert(safari.browser === 'Safari', `browser=Safari (got ${safari.browser})`);
  assert(safari.version.startsWith('17'), `version~17 (got ${safari.version})`);
}

async function testSites(): Promise<void> {
  console.log('\n[sites]');
  const listed = await sitesListGet();
  assert(listed.status === 200, 'list sites 200');
  const listBody = (await listed.json()) as { sites: Array<{ id: string }> };
  assert(listBody.sites.some((s) => s.id === 'demo'), 'demo site seeded');

  const created = await sitesCreate({
    request: new Request('http://localhost/v1/sites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'smoke',
        name: 'Smoke Test',
        domain: 'smoke.test',
      }),
    }),
    params: {},
    next: async () => new Response('not used'),
  });
  // may be 201 or 409 if re-run in same memory... but memory is fresh each process
  assert(
    created.status === 201 || created.status === 409,
    `create smoke site (${created.status})`,
  );

  if (created.status === 409) {
    await createSite({ id: 'smoke', name: 'Smoke Test', domain: 'smoke.test' }).catch(
      () => undefined,
    );
  }

  const got = await siteGet({
    request: new Request('http://localhost/v1/sites/smoke'),
    params: { id: 'smoke' },
    next: async () => new Response('not used'),
  });
  assert(got.status === 200, 'get smoke site 200');

  const patched = await sitePatch({
    request: new Request('http://localhost/v1/sites/smoke', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Smoke Renamed' }),
    }),
    params: { id: 'smoke' },
    next: async () => new Response('not used'),
  });
  assert(patched.status === 200, 'patch site 200');
  const patchBody = (await patched.json()) as { site: { name: string } };
  assert(patchBody.site.name === 'Smoke Renamed', 'site renamed');

  const extra = await sitesCreate({
    request: new Request('http://localhost/v1/sites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Temp Site', domain: 'temp.test' }),
    }),
    params: {},
    next: async () => new Response('not used'),
  });
  assert(extra.status === 201, 'create auto-id site 201');
  const extraBody = (await extra.json()) as { site: { id: string } };
  const del = await siteDelete({
    request: new Request(`http://localhost/v1/sites/${extraBody.site.id}`, {
      method: 'DELETE',
    }),
    params: { id: extraBody.site.id },
    next: async () => new Response('not used'),
  });
  assert(del.status === 204, 'delete site 204');
}

async function testTrackRealtime(): Promise<void> {
  console.log('\n[track → realtime]');
  const siteId = 'smoke';
  const visitors = [
    {
      id: 'visitor_alpha01',
      country: 'CN',
      referrer: 'https://www.google.com/search?q=kestrel',
      url: 'https://example.com/home',
    },
    {
      id: 'visitor_beta0002',
      country: 'US',
      referrer: '',
      url: 'https://example.com/about',
    },
  ];

  for (const v of visitors) {
    const req = new Request('http://localhost/v1/track', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
        'X-Forwarded-For': '203.0.113.10',
        'x-kestrel-country': v.country,
      },
      body: JSON.stringify({
        siteId,
        eventType: 'pageview',
        url: v.url,
        referrer: v.referrer,
        screenWidth: 390,
        timestamp: Date.now(),
        visitorId: v.id,
      }),
    });
    const res = await trackPost({
      request: req,
      params: {},
      next: async () => new Response('not used'),
    });
    assert(res.status === 204, `track returns 204 for ${v.id}`);
  }

  const badRes = await trackPost({
    request: new Request('http://localhost/v1/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ siteId: 'x' }),
    }),
    params: {},
    next: async () => new Response('not used'),
  });
  assert(badRes.status === 400, 'invalid track returns 400');

  const rt = await realtimeGet({
    request: new Request(`http://localhost/v1/stats/realtime?siteId=${siteId}`),
    params: {},
    next: async () => new Response('not used'),
  });
  assert(rt.status === 200, 'realtime returns 200');
  const body = (await rt.json()) as {
    pvToday: number;
    online: number;
    siteId: string;
  };
  assert(body.siteId === siteId, 'realtime siteId matches');
  assert(body.pvToday === 2, `pvToday=2 (got ${body.pvToday})`);
  assert(body.online === 2, `online=2 (got ${body.online})`);
}

async function testGeo(): Promise<void> {
  console.log('\n[geo map]');
  const fromHeader = resolveClientGeo(
    new Request('http://localhost/', {
      headers: { 'x-kestrel-country': 'jp' },
    }),
  );
  assert(fromHeader.country === 'JP', 'header country normalized to JP');

  const res = await geoGet({
    request: new Request('http://localhost/v1/stats/geo?siteId=smoke'),
    params: {},
    next: async () => new Response('not used'),
  });
  assert(res.status === 200, 'geo returns 200');
  const body = (await res.json()) as {
    countries: Record<string, number>;
    ranking: Array<{ country: string; pv: number }>;
  };
  assert(body.countries.CN === 1, `CN=1 (got ${body.countries.CN})`);
  assert(body.countries.US === 1, `US=1 (got ${body.countries.US})`);
  assert(body.ranking[0]?.pv >= body.ranking[1]?.pv, 'ranking sorted desc');
}

async function testBehaviorDetail(): Promise<void> {
  console.log('\n[behavior / sources / pages / devices]');
  assert(
    classifySource('https://www.google.com/', 'https://example.com/') ===
      'search',
    'google classified as search',
  );
  assert(
    classifySource('', 'https://example.com/') === 'direct',
    'empty referrer is direct',
  );

  const behavior = await behaviorGet({
    request: new Request('http://localhost/v1/stats/behavior?siteId=smoke&limit=10'),
    params: {},
    next: async () => new Response('not used'),
  });
  assert(behavior.status === 200, 'behavior returns 200');
  const bBody = (await behavior.json()) as {
    events: Array<{
      ipHash: string;
      source: string;
      path: string;
      device: { type: string };
      country: string;
    }>;
  };
  assert(bBody.events.length === 2, `behavior events=2 (got ${bBody.events.length})`);
  assert(!!bBody.events[0]?.ipHash, 'event has ipHash (not raw IP)');
  assert(
    bBody.events.some((e) => e.source === 'search'),
    'behavior includes search source',
  );
  assert(
    bBody.events.some((e) => e.source === 'direct'),
    'behavior includes direct source',
  );
  assert(
    bBody.events.every((e) => e.device.type === 'mobile'),
    'iPhone UA parsed as mobile',
  );

  const sources = await sourcesGet({
    request: new Request('http://localhost/v1/stats/sources?siteId=smoke'),
    params: {},
    next: async () => new Response('not used'),
  });
  const sBody = (await sources.json()) as {
    hosts: Record<string, number>;
    ranking: Array<{ host: string; pv: number }>;
  };
  assert(
    (sBody.hosts['www.google.com'] ?? 0) >= 1,
    `google host counted (got ${sBody.hosts['www.google.com']})`,
  );
  assert(
    (sBody.hosts['(direct)'] ?? 0) >= 1,
    `direct host counted (got ${sBody.hosts['(direct)']})`,
  );
  assert(
    sBody.ranking.some((r) => r.host === 'www.google.com'),
    'ranking includes google host',
  );

  const pages = await pagesGet({
    request: new Request('http://localhost/v1/stats/pages?siteId=smoke'),
    params: {},
    next: async () => new Response('not used'),
  });
  const pBody = (await pages.json()) as { pages: Record<string, number> };
  assert(pBody.pages['/home'] === 1, 'page /home counted');
  assert(pBody.pages['/about'] === 1, 'page /about counted');

  const devices = await devicesGet({
    request: new Request('http://localhost/v1/stats/devices?siteId=smoke'),
    params: {},
    next: async () => new Response('not used'),
  });
  const dBody = (await devices.json()) as {
    devices: {
      type: Record<string, number>;
      browser: Record<string, number>;
    };
    ranking: {
      fingerprints: Array<{
        fingerprint: string;
        browser: string;
        version: string;
        pv: number;
      }>;
    };
  };
  assert(dBody.devices.type.mobile === 2, `mobile=2 (got ${dBody.devices.type.mobile})`);
  assert(
    dBody.ranking.fingerprints.length >= 1,
    `fingerprints ranked (got ${dBody.ranking.fingerprints.length})`,
  );
  assert(
    dBody.ranking.fingerprints.every(
      (r) => !!r.fingerprint && !!r.browser && !!r.version,
    ),
    'fingerprint rows include browser + version',
  );
}

async function testTrend(): Promise<void> {
  console.log('\n[trend]');
  const siteId = 'smoke';
  const ymd = new Date().toISOString().slice(0, 10);
  await putDailyAggregate(siteId, ymd, {
    pv: 42,
    uv: 7,
    sources: { search: 3 },
    pages: { '/': 42 },
    countries: { CN: 30, US: 12 },
    devices: { os: {}, browser: {}, type: {} },
  });

  const res = await trendGet({
    request: new Request(
      `http://localhost/v1/stats/trend?siteId=${siteId}&days=1`,
    ),
    params: {},
    next: async () => new Response('not used'),
  });
  assert(res.status === 200, 'trend returns 200');
  const body = (await res.json()) as {
    points: Array<{ date: string; pv: number; uv: number }>;
  };
  const today = body.points.find((p) => p.date === ymd);
  assert(!!today, 'trend includes today');
  assert(today?.pv === 42, `today pv=42 (got ${today?.pv})`);
  assert(today?.uv === 7, `today uv=7 (got ${today?.uv})`);
}

async function testTrackerBudget(): Promise<void> {
  console.log('\n[tracker size]');
  const file = join(root, 'tracking-script/dist/kestrel.js');
  assert(existsSync(file), 'kestrel.js exists (run build:tracker first)');
  if (!existsSync(file)) return;
  const raw = readFileSync(file);
  const gz = gzipSync(raw);
  assert(raw.length < 5 * 1024, `raw < 5KB (${raw.length}B)`);
  assert(gz.length < 5 * 1024, `gzip < 5KB (${gz.length}B)`);
  assert(gz.length < 2048, `gzip comfortably small (${gz.length}B)`);
}

async function main(): Promise<void> {
  console.log('Kestrel smoke tests');
  await testSchema();
  await testParser();
  await testSites();
  await testTrackRealtime();
  await testGeo();
  await testBehaviorDetail();
  await testTrend();
  await testTrackerBudget();

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

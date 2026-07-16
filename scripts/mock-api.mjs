#!/usr/bin/env node
/**
 * Serve .kestrel/mock fixtures as /v1/* for local UI preview.
 * Usage: node scripts/mock-api.mjs
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const mockDir = join(root, '.kestrel', 'mock');
const port = Number(process.env.MOCK_API_PORT || 8088);

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function send(res, status, body, headers = {}) {
  const payload = body === null ? null : JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    ...headers,
  });
  res.end(payload ?? '');
}

function siteFile(siteId, name) {
  return join(mockDir, siteId, `${name}.json`);
}

function loadSites() {
  return readJson(join(mockDir, 'sites.json'));
}

function saveSites(data) {
  writeFileSync(join(mockDir, 'sites.json'), JSON.stringify(data, null, 2));
}

function ensureSiteBundle(site) {
  const dir = join(mockDir, site.id);
  if (existsSync(join(dir, 'realtime.json'))) return;
  mkdirSync(dir, { recursive: true });
  const emptyTrend = {
    siteId: site.id,
    granularity: 'day',
    points: Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - (6 - i));
      return { date: d.toISOString().slice(0, 10), pv: 0, uv: 0 };
    }),
  };
  const stubs = {
    realtime: { siteId: site.id, pvToday: 0, online: 0, ts: Date.now() },
    trend: emptyTrend,
    geo: { siteId: site.id, date: emptyTrend.points.at(-1).date, countries: {}, ranking: [], ts: Date.now() },
    sources: { siteId: site.id, date: emptyTrend.points.at(-1).date, hosts: {}, sources: {}, ranking: [], ts: Date.now() },
    pages: { siteId: site.id, date: emptyTrend.points.at(-1).date, pages: {}, ranking: [], ts: Date.now() },
    devices: {
      siteId: site.id,
      date: emptyTrend.points.at(-1).date,
      devices: { os: {}, browser: {}, type: {} },
      ranking: { os: [], browser: [], type: [], fingerprints: [] },
      ts: Date.now(),
    },
    behavior: {
      siteId: site.id,
      events: [],
      note: 'ipHash is a truncated SHA-256 of client IP; raw IP is never stored',
      ts: Date.now(),
    },
  };
  for (const [k, v] of Object.entries(stubs)) {
    writeFileSync(join(dir, `${k}.json`), JSON.stringify(v, null, 2));
  }
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  if (!chunks.length) return null;
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

if (!existsSync(join(mockDir, 'sites.json'))) {
  console.error('Missing mock data. Run: npm run seed:mock');
  process.exit(1);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://127.0.0.1:${port}`);
    const { pathname } = url;
    const method = req.method || 'GET';

    if (method === 'OPTIONS') {
      return send(res, 204, null);
    }

    if (method === 'POST' && pathname === '/v1/track') {
      return send(res, 204, null);
    }

    if (pathname === '/v1/sites' && method === 'GET') {
      return send(res, 200, loadSites());
    }

    if (pathname === '/v1/sites' && method === 'POST') {
      const body = await readBody(req);
      const id =
        (body?.id || `site_${Date.now().toString(36)}`).toLowerCase();
      const sitesDoc = loadSites();
      if (sitesDoc.sites.some((s) => s.id === id)) {
        return send(res, 409, { error: 'site_exists' });
      }
      const now = Date.now();
      const site = {
        id,
        name: body?.name || id,
        domain: body?.domain || '',
        createdAt: now,
        updatedAt: now,
      };
      sitesDoc.sites.unshift(site);
      sitesDoc.total = sitesDoc.sites.length;
      saveSites(sitesDoc);
      ensureSiteBundle(site);
      return send(res, 201, { site });
    }

    const siteMatch = pathname.match(/^\/v1\/sites\/([^/]+)$/);
    if (siteMatch) {
      const id = decodeURIComponent(siteMatch[1]);
      const sitesDoc = loadSites();
      const idx = sitesDoc.sites.findIndex((s) => s.id === id);
      if (idx < 0) return send(res, 404, { error: 'not_found' });

      if (method === 'GET') {
        return send(res, 200, { site: sitesDoc.sites[idx] });
      }
      if (method === 'PATCH') {
        const body = await readBody(req);
        const cur = sitesDoc.sites[idx];
        const next = {
          ...cur,
          name: body?.name ?? cur.name,
          domain: body?.domain !== undefined ? body.domain : cur.domain,
          updatedAt: Date.now(),
        };
        sitesDoc.sites[idx] = next;
        saveSites(sitesDoc);
        return send(res, 200, { site: next });
      }
      if (method === 'DELETE') {
        sitesDoc.sites.splice(idx, 1);
        sitesDoc.total = sitesDoc.sites.length;
        saveSites(sitesDoc);
        return send(res, 204, null);
      }
    }

    const statsMatch = pathname.match(/^\/v1\/stats\/(realtime|trend|geo|sources|pages|devices|behavior)$/);
    if (method === 'GET' && statsMatch) {
      const kind = statsMatch[1];
      const siteId = url.searchParams.get('siteId');
      if (!siteId) return send(res, 400, { error: 'siteId_required' });
      const file = siteFile(siteId, kind);
      if (!existsSync(file)) return send(res, 404, { error: 'unknown_site' });
      const data = readJson(file);
      if (kind === 'trend') {
        let points = data.points || [];
        const range = url.searchParams.get('range');
        const startDate = url.searchParams.get('startDate');
        const endDate = url.searchParams.get('endDate');
        if (startDate && endDate) {
          points = points.filter((p) => p.date >= startDate && p.date <= endDate);
        } else if (range === 'all') {
          // keep all seeded points
        } else {
          const days = Math.min(
            365,
            Math.max(1, Number(url.searchParams.get('days') ?? '7')),
          );
          points = points.slice(-days);
        }
        data.points = points;
        data.startDate = points[0]?.date ?? null;
        data.endDate = points[points.length - 1]?.date ?? null;
      }
      if (kind === 'pages') {
        const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? '20')));
        data.ranking = (data.ranking || []).slice(0, limit);
      }
      if (kind === 'behavior') {
        const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? '50')));
        data.events = (data.events || []).slice(0, limit);
      }
      return send(res, 200, data);
    }

    send(res, 404, { error: 'not_found', path: pathname });
  } catch (err) {
    console.error(err);
    send(res, 500, { error: 'internal_error', message: String(err) });
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Mock API http://127.0.0.1:${port}  (data: ${mockDir})`);
});

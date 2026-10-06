#!/usr/bin/env node
/**
 * Local stand-in for the edge counter.
 * HTML document requests are counted when Host matches sites.json.
 * GET /v1/track reads the four integers and does not increment.
 * Usage: node scripts/mock-api.mjs
 */
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, existsSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { renderHomepage } from '../tracking-script/scripts/render-home.mjs';
import {
  TRACK_POST_ERROR,
  TRACK_POST_MESSAGE,
  createVisitorId,
  isDocumentNavigation,
  isRequestHostAllowed,
  parseSitesConfig,
  visitorIdFromCookie,
  visitorSetCookie,
} from '@kestrel/shared';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const mockDir = join(root, '.kestrel', 'mock');
const distDir = join(root, 'tracking-script', 'dist');
const port = Number(process.env.MOCK_API_PORT || 8088);
const trackerVersion = process.env.KESTREL_VERSION || '0.1.0';

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

const sites = parseSitesConfig(readJson(join(root, 'sites.json')));

function headerValue(req, name) {
  const value = req.headers[name];
  if (Array.isArray(value)) return value.join(', ');
  return value ? String(value) : '';
}

function sendHtml(res, status, html, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(html);
}

function send(res, status, body, headers = {}) {
  const payload = body === null ? null : JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    ...headers,
  });
  res.end(payload ?? '');
}

function pagePathOf(input) {
  const raw = String(input || '').trim();
  if (!raw) return '/';
  try {
    const u = new URL(raw, 'https://kestrel.local');
    return ((u.pathname || '/') + (u.search || '')).slice(0, 2048);
  } catch {
    return raw.startsWith('/') ? raw.slice(0, 2048) : '/';
  }
}

function pathHash(path) {
  return createHash('sha256').update(path).digest('hex');
}

function emptyCounter() {
  return { spv: {}, suv: {}, ppv: {}, puv: {}, seen: {} };
}

function loadCounter() {
  const path = join(mockDir, 'counts.json');
  if (!existsSync(path)) return emptyCounter();
  return { ...emptyCounter(), ...readJson(path) };
}

function saveCounter(doc) {
  mkdirSync(mockDir, { recursive: true });
  writeFileSync(join(mockDir, 'counts.json'), JSON.stringify(doc));
}

function readNum(value) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function recordVisit(siteId, path, visitorId) {
  const doc = loadCounter();
  const hash = pathHash(pagePathOf(path));
  const site_pv = readNum(doc.spv[siteId]) + 1;
  doc.spv[siteId] = site_pv;
  doc.ppv[siteId] = doc.ppv[siteId] || {};
  const page_pv = readNum(doc.ppv[siteId][hash]) + 1;
  doc.ppv[siteId][hash] = page_pv;

  const seenSite = `${siteId}_${visitorId}`;
  let site_uv = readNum(doc.suv[siteId]);
  if (!doc.seen[seenSite]) {
    doc.seen[seenSite] = 1;
    site_uv += 1;
    doc.suv[siteId] = site_uv;
  }

  const seenPage = `${siteId}_${hash}_${visitorId}`;
  doc.puv[siteId] = doc.puv[siteId] || {};
  let page_uv = readNum(doc.puv[siteId][hash]);
  if (!doc.seen[seenPage]) {
    doc.seen[seenPage] = 1;
    page_uv += 1;
    doc.puv[siteId][hash] = page_uv;
  }

  saveCounter(doc);
  return { site_pv, page_pv, site_uv, page_uv };
}

function readVisit(siteId, path) {
  const doc = loadCounter();
  const site_pv = readNum(doc.spv[siteId]);
  const site_uv = readNum(doc.suv[siteId]);
  if (!path) return { site_pv, page_pv: 0, site_uv, page_uv: 0 };
  const hash = pathHash(pagePathOf(path));
  return {
    site_pv,
    page_pv: readNum(doc.ppv[siteId]?.[hash]),
    site_uv,
    page_uv: readNum(doc.puv[siteId]?.[hash]),
  };
}

function homepageHtml() {
  return renderHomepage(root, trackerVersion);
}

function distAsset(pathname) {
  let rel = pathname;
  try {
    rel = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (!rel.startsWith('/') || rel.includes('\0') || rel.includes('..')) return null;
  const file = resolve(distDir, `.${rel}`);
  if (file !== distDir && !file.startsWith(`${distDir}${sep}`)) return null;
  try {
    if (!statSync(file).isFile()) return null;
  } catch {
    return null;
  }
  return file;
}

function sendAsset(res, file) {
  const types = {
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
    '.map': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
  };
  res.writeHead(200, {
    'Content-Type': types[extname(file).toLowerCase()] || 'application/octet-stream',
    'Cache-Control': 'no-store',
  });
  res.end(readFileSync(file));
}

function handlePage(req, res, url) {
  const method = req.method || 'GET';
  const purpose = headerValue(req, 'sec-purpose') || headerValue(req, 'purpose');
  const document = isDocumentNavigation({
    method,
    pathname: url.pathname,
    accept: headerValue(req, 'accept'),
    secFetchDest: headerValue(req, 'sec-fetch-dest'),
    purpose,
  });
  if (!document) {
    const asset = distAsset(url.pathname);
    if (asset && url.pathname !== '/' && url.pathname !== '/index.html') return sendAsset(res, asset);
    if (method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      return sendHtml(res, 200, homepageHtml());
    }
    return send(res, 404, { error: 'not_found', path: url.pathname });
  }

  const html = homepageHtml();
  const host = headerValue(req, 'host');
  const site = sites.find((item) => isRequestHostAllowed(host, item.domain));
  if (!site) return sendHtml(res, 200, html);

  const existing = visitorIdFromCookie(headerValue(req, 'cookie'));
  const visitorId = existing || createVisitorId();
  recordVisit(site.id, `${url.pathname}${url.search}`, visitorId);
  const headers = {};
  if (!existing) headers['Set-Cookie'] = visitorSetCookie(visitorId, false);
  return sendHtml(res, 200, html, headers);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://127.0.0.1:${port}`);
    const { pathname } = url;
    const method = req.method || 'GET';

    if (method === 'OPTIONS') {
      return send(res, 204, null);
    }

    if (!pathname.startsWith('/v1')) {
      return handlePage(req, res, url);
    }

    if (pathname === '/v1/track' && method === 'GET') {
      const siteId = String(url.searchParams.get('siteId') || '')
        .trim()
        .toLowerCase();
      if (!siteId) return send(res, 400, { error: 'siteId_required' });
      if (!/^[a-z0-9_]+$/.test(siteId)) {
        return send(res, 400, { error: 'invalid_payload' });
      }
      const path = String(url.searchParams.get('path') || '');
      if (path.length > 2048) return send(res, 400, { error: 'invalid_payload' });
      if (!sites.some((site) => site.id === siteId)) {
        return send(res, 404, { error: 'unknown_site' });
      }
      return send(res, 200, readVisit(siteId, path));
    }

    if (pathname === '/v1/track' && method === 'POST') {
      return send(
        res,
        405,
        { error: TRACK_POST_ERROR, message: TRACK_POST_MESSAGE },
        { Allow: 'GET, OPTIONS' },
      );
    }

    send(res, 404, { error: 'not_found', path: pathname });
  } catch (err) {
    console.error(err);
    send(res, 500, { error: 'internal_error', message: String(err) });
  }
});

server.listen(port, '127.0.0.1', () => {
  const listed = sites
    .map((site) => `${site.id}[${site.domain.join(' ') || 'empty'}]`)
    .join(', ');
  console.log(`Mock counter http://127.0.0.1:${port}`);
  console.log(`Homepage http://127.0.0.1:${port}/`);
  console.log(`Sites from sites.json: ${listed}`);
});

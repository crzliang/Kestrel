#!/usr/bin/env node
/**
 * Serve .kestrel/mock fixtures as /v1/* for local UI preview.
 * Usage: node scripts/mock-api.mjs
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pbkdf2Sync, randomBytes, timingSafeEqual, createHmac } from 'node:crypto';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const mockDir = join(root, '.kestrel', 'mock');
const port = Number(process.env.MOCK_API_PORT || 8088);
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14;
const CHALLENGE_TTL_MS = 1000 * 60 * 5;
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

const challenges = new Map();

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
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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

function loadAccounts() {
  const path = join(mockDir, 'accounts.json');
  if (!existsSync(path)) {
    return { accounts: [], total: 0 };
  }
  return readJson(path);
}

function saveAccounts(data) {
  writeFileSync(join(mockDir, 'accounts.json'), JSON.stringify(data, null, 2));
}

function loadSessions() {
  const path = join(mockDir, 'sessions.json');
  if (!existsSync(path)) return { sessions: [] };
  return readJson(path);
}

function saveSessions(data) {
  writeFileSync(join(mockDir, 'sessions.json'), JSON.stringify(data, null, 2));
}

function loadSettings() {
  const path = join(mockDir, 'settings.json');
  if (!existsSync(path)) {
    return { title: 'Kestrel', subtitle: 'Analytics', logoUrl: '' };
  }
  return readJson(path);
}

function saveSettings(data) {
  writeFileSync(join(mockDir, 'settings.json'), JSON.stringify(data, null, 2));
}

function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(password, salt, 100_000, 32, 'sha256');
  return `pbkdf2$100000$${salt.toString('hex')}$${hash.toString('hex')}`;
}

function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iterations = Number(parts[1]);
  const salt = Buffer.from(parts[2], 'hex');
  const expected = Buffer.from(parts[3], 'hex');
  const actual = pbkdf2Sync(password, salt, iterations, expected.length, 'sha256');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function publicAccount(rec) {
  return {
    id: rec.id,
    username: rec.username,
    displayName: rec.displayName,
    role: rec.role,
    totpEnabled: Boolean(rec.totpEnabled),
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt,
  };
}

function base32Encode(buf) {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(input) {
  const cleaned = String(input || '')
    .replace(/=+$/, '')
    .toUpperCase();
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of cleaned) {
    const idx = BASE32.indexOf(ch);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function totpCode(secret, counter = Math.floor(Date.now() / 1000 / 30)) {
  const key = base32Decode(secret);
  const msg = Buffer.alloc(8);
  msg.writeUInt32BE(0, 0);
  msg.writeUInt32BE(counter >>> 0, 4);
  const sig = createHmac('sha1', key).update(msg).digest();
  const offset = sig[sig.length - 1] & 0x0f;
  const bin =
    ((sig[offset] & 0x7f) << 24) |
    ((sig[offset + 1] & 0xff) << 16) |
    ((sig[offset + 2] & 0xff) << 8) |
    (sig[offset + 3] & 0xff);
  return String(bin % 1_000_000).padStart(6, '0');
}

function verifyTotp(secret, code) {
  const cleaned = String(code || '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(cleaned)) return false;
  const step = Math.floor(Date.now() / 1000 / 30);
  for (let i = -1; i <= 1; i++) {
    if (totpCode(secret, step + i) === cleaned) return true;
  }
  return false;
}

function issueSession(res, rec) {
  const token = `tok_${Date.now().toString(36)}_${randomBytes(8).toString('hex')}`;
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const sessions = loadSessions();
  sessions.sessions = sessions.sessions.filter((s) => s.expiresAt >= Date.now());
  sessions.sessions.push({ token, accountId: rec.id, expiresAt });
  saveSessions(sessions);
  return send(res, 200, {
    token,
    account: publicAccount(rec),
    expiresAt,
  });
}

function ensureDefaultAdmin() {
  const doc = loadAccounts();
  if (doc.accounts.length > 0) return doc;
  const now = Date.now();
  const username = (process.env.KESTREL_ADMIN_USERNAME || 'admin')
    .trim()
    .toLowerCase();
  const password = process.env.KESTREL_ADMIN_PASSWORD || 'admin123';
  doc.accounts = [
    {
      id: 'acct_admin',
      username,
      displayName: '管理员',
      role: 'admin',
      totpEnabled: false,
      passwordHash: hashPassword(password),
      createdAt: now,
      updatedAt: now,
    },
  ];
  doc.total = 1;
  saveAccounts(doc);
  return doc;
}

function bearerToken(req) {
  const header = req.headers.authorization || '';
  const m = header.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() || null;
}

function resolveAccount(req) {
  const token = bearerToken(req);
  if (!token) return null;
  const sessions = loadSessions();
  const session = sessions.sessions.find((s) => s.token === token);
  if (!session || session.expiresAt < Date.now()) return null;
  const doc = ensureDefaultAdmin();
  const rec = doc.accounts.find((a) => a.id === session.accountId);
  return rec ? publicAccount(rec) : null;
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
    ips: { siteId: site.id, date: emptyTrend.points.at(-1).date, ips: {}, ranking: [], ts: Date.now() },
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
      note: 'Events include client IP; ipHash is used for rate limiting',
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

ensureDefaultAdmin();

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

    if (pathname === '/v1/auth/login' && method === 'POST') {
      const body = await readBody(req);
      ensureDefaultAdmin();
      const doc = loadAccounts();

      if (body?.challengeToken) {
        const challenge = challenges.get(String(body.challengeToken));
        if (!challenge || challenge.expiresAt < Date.now()) {
          return send(res, 401, { error: 'challenge_expired' });
        }
        const rec = doc.accounts.find((a) => a.id === challenge.accountId);
        if (!rec?.totpEnabled || !rec.totpSecret) {
          return send(res, 401, { error: 'invalid_credentials' });
        }
        if (!verifyTotp(rec.totpSecret, body.totpCode)) {
          return send(res, 401, { error: 'invalid_totp' });
        }
        challenges.delete(String(body.challengeToken));
        return issueSession(res, rec);
      }

      const username = String(body?.username || '')
        .trim()
        .toLowerCase();
      const rec = doc.accounts.find((a) => a.username === username);
      if (!rec || !verifyPassword(String(body?.password || ''), rec.passwordHash)) {
        return send(res, 401, { error: 'invalid_credentials' });
      }

      if (rec.totpEnabled && rec.totpSecret) {
        if (body?.totpCode) {
          if (!verifyTotp(rec.totpSecret, body.totpCode)) {
            return send(res, 401, { error: 'invalid_totp' });
          }
          return issueSession(res, rec);
        }
        const challengeToken = `chal_${Date.now().toString(36)}_${randomBytes(6).toString('hex')}`;
        challenges.set(challengeToken, {
          accountId: rec.id,
          expiresAt: Date.now() + CHALLENGE_TTL_MS,
        });
        return send(res, 200, { requiresTotp: true, challengeToken });
      }

      return issueSession(res, rec);
    }

    if (pathname === '/v1/auth/logout' && method === 'POST') {
      const token = bearerToken(req);
      if (token) {
        const sessions = loadSessions();
        sessions.sessions = sessions.sessions.filter((s) => s.token !== token);
        saveSessions(sessions);
      }
      return send(res, 204, null);
    }

    if (pathname === '/v1/auth/me' && method === 'GET') {
      const account = resolveAccount(req);
      if (!account) return send(res, 401, { error: 'unauthorized' });
      return send(res, 200, { account });
    }

    if (pathname === '/v1/auth/password' && method === 'POST') {
      const account = resolveAccount(req);
      if (!account) return send(res, 401, { error: 'unauthorized' });
      const body = await readBody(req);
      const doc = ensureDefaultAdmin();
      const idx = doc.accounts.findIndex((a) => a.id === account.id);
      if (idx < 0) return send(res, 404, { error: 'not_found' });
      const cur = doc.accounts[idx];
      if (!verifyPassword(String(body?.currentPassword || ''), cur.passwordHash)) {
        return send(res, 401, { error: 'invalid_credentials' });
      }
      const nextPass = String(body?.newPassword || '');
      if (nextPass.length < 6) return send(res, 400, { error: 'invalid_payload' });
      doc.accounts[idx] = {
        ...cur,
        passwordHash: hashPassword(nextPass),
        updatedAt: Date.now(),
      };
      saveAccounts(doc);
      return send(res, 204, null);
    }

    if (pathname === '/v1/auth/totp/setup' && method === 'POST') {
      const account = resolveAccount(req);
      if (!account) return send(res, 401, { error: 'unauthorized' });
      const doc = ensureDefaultAdmin();
      const idx = doc.accounts.findIndex((a) => a.id === account.id);
      if (idx < 0) return send(res, 404, { error: 'not_found' });
      const cur = doc.accounts[idx];
      if (cur.totpEnabled) return send(res, 400, { error: 'totp_already_enabled' });
      const secret = base32Encode(randomBytes(20));
      doc.accounts[idx] = {
        ...cur,
        totpPendingSecret: secret,
        updatedAt: Date.now(),
      };
      saveAccounts(doc);
      const settings = loadSettings();
      const issuer = settings.title || 'Kestrel';
      const label = encodeURIComponent(`${issuer}:${cur.username}`);
      const params = new URLSearchParams({
        secret,
        issuer,
        algorithm: 'SHA1',
        digits: '6',
        period: '30',
      });
      return send(res, 200, {
        secret,
        otpauthUrl: `otpauth://totp/${label}?${params.toString()}`,
      });
    }

    if (pathname === '/v1/auth/totp/confirm' && method === 'POST') {
      const account = resolveAccount(req);
      if (!account) return send(res, 401, { error: 'unauthorized' });
      const body = await readBody(req);
      const doc = ensureDefaultAdmin();
      const idx = doc.accounts.findIndex((a) => a.id === account.id);
      if (idx < 0) return send(res, 404, { error: 'not_found' });
      const cur = doc.accounts[idx];
      if (!cur.totpPendingSecret) {
        return send(res, 400, { error: 'totp_setup_required' });
      }
      if (!verifyTotp(cur.totpPendingSecret, body?.code)) {
        return send(res, 401, { error: 'invalid_totp' });
      }
      doc.accounts[idx] = {
        ...cur,
        totpEnabled: true,
        totpSecret: cur.totpPendingSecret,
        totpPendingSecret: undefined,
        updatedAt: Date.now(),
      };
      saveAccounts(doc);
      return send(res, 200, { account: publicAccount(doc.accounts[idx]) });
    }

    if (pathname === '/v1/auth/totp/disable' && method === 'POST') {
      const account = resolveAccount(req);
      if (!account) return send(res, 401, { error: 'unauthorized' });
      const body = await readBody(req);
      const doc = ensureDefaultAdmin();
      const idx = doc.accounts.findIndex((a) => a.id === account.id);
      if (idx < 0) return send(res, 404, { error: 'not_found' });
      const cur = doc.accounts[idx];
      if (!cur.totpEnabled || !cur.totpSecret) {
        return send(res, 400, { error: 'totp_not_enabled' });
      }
      if (!verifyPassword(String(body?.password || ''), cur.passwordHash)) {
        return send(res, 401, { error: 'invalid_credentials' });
      }
      if (!verifyTotp(cur.totpSecret, body?.code)) {
        return send(res, 401, { error: 'invalid_totp' });
      }
      doc.accounts[idx] = {
        ...cur,
        totpEnabled: false,
        totpSecret: undefined,
        totpPendingSecret: undefined,
        updatedAt: Date.now(),
      };
      saveAccounts(doc);
      return send(res, 200, { account: publicAccount(doc.accounts[idx]) });
    }

    if (pathname === '/v1/settings' && method === 'GET') {
      return send(res, 200, { settings: loadSettings() });
    }

    const isPublic =
      pathname === '/v1/track' ||
      pathname === '/v1/auth/login' ||
      (pathname === '/v1/settings' && method === 'GET');
    if (!isPublic) {
      const account = resolveAccount(req);
      if (!account) return send(res, 401, { error: 'unauthorized' });
    }

    if (pathname === '/v1/settings' && method === 'PATCH') {
      const body = await readBody(req);
      const cur = loadSettings();
      const next = {
        title:
          body?.title !== undefined
            ? String(body.title).trim() || 'Kestrel'
            : cur.title,
        subtitle:
          body?.subtitle !== undefined
            ? String(body.subtitle).trim()
            : cur.subtitle,
        logoUrl:
          body?.logoUrl !== undefined ? String(body.logoUrl).trim() : cur.logoUrl,
        updatedAt: Date.now(),
      };
      saveSettings(next);
      return send(res, 200, { settings: next });
    }

    if (pathname === '/v1/sites' && method === 'GET') {
      return send(res, 200, loadSites());
    }

    if (pathname === '/v1/sites' && method === 'POST') {
      const body = await readBody(req);
      const id = (body?.id || crypto.randomUUID()).toLowerCase();
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

    const statsMatch = pathname.match(/^\/v1\/stats\/(realtime|trend|geo|sources|pages|ips|devices|behavior)$/);
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
      if (kind === 'pages' || kind === 'ips') {
        const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? '20')));
        data.ranking = (data.ranking || []).slice(0, limit);
      }
      if (kind === 'behavior') {
        const limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit') ?? '100')));
        let events = data.events || [];
        const range = url.searchParams.get('range');
        const startDate = url.searchParams.get('startDate');
        const endDate = url.searchParams.get('endDate');
        const eventTs = (e) => e.receivedAt || e.timestamp || 0;

        if (startDate && endDate) {
          const startMs = Date.parse(`${startDate}T00:00:00.000Z`);
          const endMs = Date.parse(`${endDate}T23:59:59.999Z`);
          events = events.filter((e) => {
            const ts = eventTs(e);
            return ts >= startMs && ts <= endMs;
          });
          data.startDate = startDate;
          data.endDate = endDate;
        } else if (range === 'all') {
          data.startDate = null;
          data.endDate = null;
        } else {
          const days = Math.min(
            365,
            Math.max(1, Number(url.searchParams.get('days') ?? '7')),
          );
          const end = new Date();
          end.setUTCHours(23, 59, 59, 999);
          const start = new Date(end.getTime() - (days - 1) * 86_400_000);
          start.setUTCHours(0, 0, 0, 0);
          const startMs = start.getTime();
          const endMs = end.getTime();
          events = events.filter((e) => {
            const ts = eventTs(e);
            return ts >= startMs && ts <= endMs;
          });
          data.startDate = start.toISOString().slice(0, 10);
          data.endDate = end.toISOString().slice(0, 10);
        }

        data.events = events.slice(0, limit);
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
  const user = (process.env.KESTREL_ADMIN_USERNAME || 'admin').trim().toLowerCase();
  console.log(`Mock API http://127.0.0.1:${port}  (data: ${mockDir})`);
  console.log(
    `Default login: ${user} / ${process.env.KESTREL_ADMIN_PASSWORD ? '(from KESTREL_ADMIN_PASSWORD)' : 'admin123'}`,
  );
});

/**
 * Local smoke tests for the page counter.
 * Run: npm test
 */
import { readFileSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CountQuerySchema,
  isRequestHostAllowed,
  normalizeRequestHost,
  parseDomainAllowlist,
  parseSitesConfig,
  sanitizeVisitorId,
  visitorIdFromCookie,
  type Site,
} from '@kestrel/shared';
import { middleware } from '../middleware';
import {
  onRequestGet as trackGet,
  onRequestPost as trackPost,
} from '../edge-functions/v1/track';
import {
  findSiteByHost,
  getSite,
  listSites,
  matchSiteByHost,
} from '../edge-functions/lib/sites';
import type { EventContext } from '../edge-functions/lib/types';

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

const noop = async () => new Response('not used');

function ctx(request: Request, params: Record<string, string> = {}): EventContext {
  return { request, params, next: noop };
}

type Counts = {
  site_pv: number;
  page_pv: number;
  site_uv: number;
  page_uv: number;
};

function isCounts(body: Counts): boolean {
  const keys = Object.keys(body).sort().join(',');
  return (
    keys === 'page_pv,page_uv,site_pv,site_uv' &&
    [body.site_pv, body.page_pv, body.site_uv, body.page_uv].every((n) =>
      Number.isInteger(n),
    )
  );
}

async function readPublic(
  siteId: string,
  path?: string,
  extra?: string,
): Promise<{ status: number; body: Counts & { error?: string } }> {
  const params = new URLSearchParams({ siteId });
  if (path !== undefined) params.set('path', path);
  const res = await trackGet(
    ctx(
      new Request(
        `https://not-the-host.invalid/v1/track?${params.toString()}${extra ?? ''}`,
        { headers: { Host: 'not-the-host.invalid', Accept: 'text/html' } },
      ),
    ),
  );
  const body = (await res.json()) as Counts & { error?: string };
  return { status: res.status, body };
}

async function navigate(options: {
  host: string;
  path: string;
  cookie?: string;
  accept?: string;
  dest?: string;
  method?: string;
  status?: number;
  contentType?: string;
}): Promise<{ status: number; setCookie: string | null; text: string }> {
  const headers = new Headers();
  headers.set('Host', options.host);
  headers.set('Accept', options.accept ?? 'text/html');
  if (options.dest) headers.set('Sec-Fetch-Dest', options.dest);
  if (options.cookie) headers.set('Cookie', options.cookie);
  const request = new Request(`https://not-the-host.invalid${options.path}`, {
    method: options.method ?? 'GET',
    headers,
  });
  const response = await middleware({
    request,
    next: async () =>
      new Response('page', {
        status: options.status ?? 200,
        headers: {
          'Content-Type': options.contentType ?? 'text/html; charset=utf-8',
        },
      }),
  });
  return {
    status: response.status,
    setCookie: response.headers.get('set-cookie'),
    text: await response.text(),
  };
}

function vidFromSetCookie(header: string | null): string | null {
  if (!header) return null;
  const match = header.match(/kestrel_vid=([^;]+)/);
  return match?.[1] ?? null;
}

function sameCounts(a: Counts, b: Counts): boolean {
  return (
    a.site_pv === b.site_pv &&
    a.page_pv === b.page_pv &&
    a.site_uv === b.site_uv &&
    a.page_uv === b.page_uv
  );
}

function sitesFromFile(): Site[] {
  const raw = JSON.parse(readFileSync(join(root, 'sites.json'), 'utf8')) as unknown;
  return parseSitesConfig(raw);
}

function requireConfiguredSites(): { kestrel: Site; www: Site; blog: Site } {
  const sites = listSites();
  const kestrel = sites.find((site) => site.id === 'kestrel');
  const www = sites.find((site) => site.id === 'www');
  const blog = sites.find((site) => site.id === 'blog');
  if (!kestrel || !www || !blog || sites.length !== 3) {
    throw new Error('sites.json 需要且仅需要 kestrel、www、blog 三个站点');
  }
  return { kestrel, www, blog };
}

async function testSchema(): Promise<void> {
  console.log('\n[schema]');
  const ok = CountQuerySchema.safeParse({ siteId: 'Kestrel', path: '/docs?a=1' });
  assert(ok.success && ok.data.siteId === 'kestrel', 'count query lowercases site id');
  assert(ok.success && ok.data.path === '/docs?a=1', 'count query keeps the page path');

  const bad = CountQuerySchema.safeParse({ siteId: 'bad-site', path: '/' });
  assert(!bad.success, 'hyphenated site id rejected');

  const noVisitor = CountQuerySchema.safeParse({
    siteId: 'kestrel',
    path: '/',
    visitorId: 'visitor_abcdefgh',
    url: 'https://evil.example/',
  });
  assert(noVisitor.success, 'extra url and visitorId are not required');
  assert(
    noVisitor.success &&
      !('visitorId' in noVisitor.data) &&
      !('url' in noVisitor.data),
    'count query drops url and visitorId',
  );

  const dashed = sanitizeVisitorId('11111111-2222-3333-4444-555555555555');
  assert(
    dashed === '11111111222233334444555555555555',
    'visitor cookie drops hyphens',
  );
  assert(sanitizeVisitorId('short') === null, 'short visitor cookie rejected');
  assert(sanitizeVisitorId('bad id!!abcd') === null, 'unsafe visitor cookie rejected');
  assert(
    visitorIdFromCookie('other=1; kestrel_vid=abcd-efgh-ijkl') === 'abcdefghijkl',
    'cookie header yields the sanitized visitor id',
  );

  assert(
    normalizeRequestHost('Example.COM.:8443') === 'example.com',
    'request host drops case, port, and trailing dot',
  );
  assert(
    isRequestHostAllowed('WWW.Allow.Test:443', ['www.allow.test']),
    'allowlist match ignores case and port',
  );
  assert(
    !isRequestHostAllowed('evil.allow.test', ['allow.test']),
    'suffix of an allowlisted host is not a match',
  );
  assert(!isRequestHostAllowed('allow.test', []), 'empty allowlist matches nothing');

  const mixedCase = parseDomainAllowlist('Example.COM.');
  assert(
    mixedCase.ok && mixedCase.domains.join() === 'example.com',
    'hostname is lowercased and trailing dot stripped',
  );

  const listed = parseDomainAllowlist('a.example\nwww.a.example, blog.a.example');
  assert(
    listed.ok && listed.domains.join() === 'a.example,www.a.example,blog.a.example',
    'newline and comma lists become hostnames',
  );

  const localHosts = parseDomainAllowlist(['localhost', '127.0.0.1']);
  assert(
    localHosts.ok && localHosts.domains.join() === 'localhost,127.0.0.1',
    'localhost and 127.0.0.1 are valid allowlist entries',
  );

  const emptyList = parseDomainAllowlist('');
  assert(emptyList.ok && emptyList.domains.length === 0, 'empty allowlist parses');

  const wildcard = parseDomainAllowlist('*.example.com');
  assert(!wildcard.ok, 'wildcard hostname rejected');

  const withPort = parseDomainAllowlist('example.com:443');
  assert(!withPort.ok, 'port is not part of an allowlist hostname');

  let duplicate = false;
  try {
    parseSitesConfig({
      sites: [
        { id: 'ab', domain: [] },
        { id: 'AB', domain: [] },
      ],
    });
  } catch {
    duplicate = true;
  }
  assert(duplicate, 'duplicate site id in static config is rejected');

  let wildConfig = false;
  try {
    parseSitesConfig({ sites: [{ id: 'wild', domain: ['*.example.com'] }] });
  } catch {
    wildConfig = true;
  }
  assert(wildConfig, 'wildcard hostname in static config is rejected');

  const first = matchSiteByHost(
    [
      { id: 'aaa', domain: ['shared.test'] },
      { id: 'bbb', domain: ['shared.test'] },
    ],
    'SHARED.TEST',
  );
  assert(first?.id === 'aaa', 'first site in the file wins a shared hostname');
}

async function testStaticConfig(): Promise<void> {
  console.log('\n[static config]');
  const fromFile = sitesFromFile();
  const loaded = listSites();
  assert(
    JSON.stringify(loaded) === JSON.stringify(fromFile),
    'runtime sites match sites.json',
  );

  const { kestrel, www, blog } = requireConfiguredSites();
  assert(
    fromFile.map((site) => `${site.id}:${site.domain.join(',')}`).join('|') ===
      'kestrel:kestrel.crzliang.cn|www:www.crzliang.cn|blog:blog.crzliang.cn',
    'sites.json lists kestrel, www, and blog with their own hosts',
  );
  assert(
    fromFile.findIndex((site) => site.domain.length > 0) === 0 && fromFile[0]?.id === 'kestrel',
    'kestrel is the first site that has a hostname',
  );
  assert(
    getSite(kestrel.id.toUpperCase())?.id === kestrel.id,
    'site id lookup is case-insensitive',
  );
  assert(
    findSiteByHost('kestrel.crzliang.cn')?.id === 'kestrel',
    'Host kestrel.crzliang.cn hits kestrel',
  );
  assert(
    findSiteByHost('www.crzliang.cn')?.id === 'www',
    'Host www.crzliang.cn hits www',
  );
  assert(
    findSiteByHost('blog.crzliang.cn')?.id === 'blog',
    'Host blog.crzliang.cn hits blog',
  );
  assert(
    findSiteByHost('www.crzliang.cn')?.id !== 'kestrel' &&
      findSiteByHost('blog.crzliang.cn')?.id !== 'kestrel',
    'www and blog hosts do not resolve to kestrel',
  );
  assert(findSiteByHost('not-listed.example') === null, 'unknown host matches no site');
  assert(
    new Set([kestrel.domain[0], www.domain[0], blog.domain[0]]).size === 3,
    'the three sites do not share a hostname',
  );

  const fixture = parseSitesConfig({
    sites: [
      { id: 'listed', domain: ['one.fixture.test', 'two.fixture.test'] },
      { id: 'emptyfix', domain: [] },
    ],
  });
  assert(
    matchSiteByHost(fixture, 'two.fixture.test')?.id === 'listed',
    'fixture second hostname resolves to its site',
  );
  assert(
    matchSiteByHost(fixture, 'one.fixture.test')?.id !== 'emptyfix' &&
      matchSiteByHost(fixture, 'not-listed.example') === null,
    'empty allowlist fixture is never chosen by host',
  );
}

async function testCounts(): Promise<void> {
  console.log('\n[counts]');
  const { kestrel } = requireConfiguredSites();
  const siteId = kestrel.id;
  const host = 'kestrel.crzliang.cn';
  assert(kestrel.domain.join() === host, 'count tests use the kestrel hostname');

  const before = await readPublic(siteId, '/home');
  assert(before.status === 200, 'read counts 200');
  assert(isCounts(before.body), 'read body is the four integers');
  assert(
    before.body.site_pv === 0 &&
      before.body.page_pv === 0 &&
      before.body.site_uv === 0 &&
      before.body.page_uv === 0,
    'configured site starts at zero',
  );

  const forged = await trackPost(
    ctx(
      new Request('https://not-the-host.invalid/v1/track', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Host: host,
          Origin: `https://${host}`,
          Accept: 'text/html',
        },
        body: JSON.stringify({
          siteId,
          url: `https://${host}/home`,
          visitorId: 'visitoralpha01',
        }),
      }),
    ),
  );
  const forgedBody = (await forged.json()) as { error?: string; message?: string };
  assert(forged.status === 405, 'forged POST does not count (405)');
  assert(forgedBody.error === 'not_counted', 'forged POST error is not_counted');
  assert(
    typeof forgedBody.message === 'string' && forgedBody.message.includes('不会'),
    'forged POST explains that it does not count',
  );
  const broken = await trackPost(
    ctx(
      new Request('http://localhost/v1/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{',
      }),
    ),
  );
  assert(broken.status === 405, 'invalid JSON POST still does not count');

  const foreign = await navigate({ host: 'not-listed.example', path: '/home' });
  assert(foreign.status === 200 && foreign.text === 'page', 'foreign host still serves the page');
  assert(foreign.setCookie === null, 'foreign host does not set a visitor cookie');
  const afterForeign = await readPublic(siteId, '/home');
  assert(sameCounts(afterForeign.body, before.body), 'foreign host does not change counts');

  const posted = await navigate({
    host,
    path: '/home',
    method: 'POST',
  });
  assert(posted.setCookie === null, 'POST to a page URL does not count');
  const afterPost = await readPublic(siteId, '/home');
  assert(sameCounts(afterPost.body, before.body), 'POST page URL leaves counts at zero');

  const missed = await navigate({
    host,
    path: '/home',
    accept: '*/*',
    contentType: 'application/json',
  });
  assert(missed.setCookie === null, 'non-html response is not a page view');
  const afterMiss = await readPublic(siteId, '/home');
  assert(sameCounts(afterMiss.body, before.body), 'non-html response does not count');

  const redirect = await navigate({
    host,
    path: '/home',
    status: 302,
  });
  assert(redirect.setCookie === null, 'redirect is not a page view');

  const first = await navigate({
    host,
    path: '/home',
    dest: 'document',
  });
  assert(first.text === 'page', 'matching host still returns the page');
  const vid = vidFromSetCookie(first.setCookie);
  assert(vid !== null && /^[A-Za-z0-9_]{8,64}$/.test(vid), 'new visitor cookie is safe');
  assert(first.setCookie?.includes('HttpOnly'), 'visitor cookie is HttpOnly');
  assert(!vid?.includes('-'), 'visitor cookie has no hyphen');

  const counted = await readPublic(siteId, '/home');
  assert(counted.body.site_pv === 1, `Host kestrel.crzliang.cn counts kestrel site_pv=1 (got ${counted.body.site_pv})`);
  assert(counted.body.page_pv === 1, `page_pv=1 (got ${counted.body.page_pv})`);
  assert(counted.body.site_uv === 1, `site_uv=1 (got ${counted.body.site_uv})`);
  assert(counted.body.page_uv === 1, `page_uv=1 (got ${counted.body.page_uv})`);

  const again = await navigate({
    host,
    path: '/home',
    cookie: `kestrel_vid=${vid}`,
  });
  assert(again.setCookie === null, 'known visitor keeps the existing cookie');
  const repeated = await readPublic(siteId, '/home');
  assert(repeated.body.site_pv === 2, `repeat site_pv=2 (got ${repeated.body.site_pv})`);
  assert(repeated.body.page_pv === 2, `repeat page_pv=2 (got ${repeated.body.page_pv})`);
  assert(repeated.body.site_uv === 1, `repeat site_uv stays 1 (got ${repeated.body.site_uv})`);
  assert(repeated.body.page_uv === 1, `repeat page_uv stays 1 (got ${repeated.body.page_uv})`);

  const dashedCookie = await navigate({
    host,
    path: '/home',
    cookie: `kestrel_vid=${vid?.slice(0, 8)}-${vid?.slice(8)}`,
  });
  assert(dashedCookie.setCookie === null, 'hyphenated cookie is the same visitor');
  const afterDash = await readPublic(siteId, '/home');
  assert(afterDash.body.site_pv === 3, 'hyphenated cookie still counts a page view');
  assert(afterDash.body.site_uv === 1, 'hyphenated cookie does not add a visitor');

  const script = await navigate({ host, path: '/kestrel.js' });
  assert(script.setCookie === null, 'kestrel.js is not a page view');
  const asset = await navigate({ host, path: '/assets/app.js' });
  assert(asset.setCookie === null, 'static js is not a page view');
  const apiRead = await navigate({
    host,
    path: `/v1/track?siteId=${siteId}&path=%2Fhome`,
  });
  assert(apiRead.setCookie === null, 'read API is not a page view');

  const other = await navigate({
    host,
    path: '/docs/a-b.html?x=1',
    cookie: `kestrel_vid=${vid}`,
  });
  assert(other.status === 200, 'other page 200');
  const nextPage = await readPublic(siteId, '/docs/a-b.html?x=1');
  assert(nextPage.body.site_pv === 4, `other site_pv=4 (got ${nextPage.body.site_pv})`);
  assert(nextPage.body.page_pv === 1, `other page_pv=1 (got ${nextPage.body.page_pv})`);
  assert(nextPage.body.site_uv === 1, `other site_uv stays 1 (got ${nextPage.body.site_uv})`);
  assert(nextPage.body.page_uv === 1, `other page_uv=1 (got ${nextPage.body.page_uv})`);

  const homeAfter = await readPublic(siteId, '/home');
  assert(homeAfter.body.page_pv === 3, 'home page pv unchanged by the other page');
  assert(homeAfter.body.page_uv === 1, 'home page uv unchanged by the other page');
  assert(homeAfter.body.site_pv === 4, 'site pv includes both pages');

  const peeked = await readPublic(siteId, '/home', '&url=https://secret.example/home');
  assert(peeked.status === 200, 'public read 200');
  assert(isCounts(peeked.body), 'public read body is the four integers');
  assert(sameCounts(peeked.body, homeAfter.body), 'public read matches stored counts');
  const peekedAgain = await readPublic(siteId, '/home');
  assert(sameCounts(peekedAgain.body, peeked.body), 'public read does not increment');

  const missing = await readPublic('missing_site', '/home');
  assert(missing.status === 404, 'unknown site returns 404');
  assert(missing.body.error === 'unknown_site', 'unknown site error code');

  const invalid = await trackGet(
    ctx(new Request('http://localhost/v1/track?siteId=bad-site&path=/home')),
  );
  assert(invalid.status === 400, 'illegal site id returns 400');
}

async function testAllowlist(): Promise<void> {
  console.log('\n[allowlist]');
  const { kestrel, www, blog } = requireConfiguredSites();
  const siteId = www.id;
  const primaryHost = 'www.crzliang.cn';

  assert(
    www.domain.join() === sitesFromFile().find((site) => site.id === siteId)?.domain.join() &&
      www.domain.join() === primaryHost,
    'www allowlist is only www.crzliang.cn',
  );
  assert(blog.domain.join() === 'blog.crzliang.cn', 'blog allowlist is only blog.crzliang.cn');
  assert(
    kestrel.domain.join() === 'kestrel.crzliang.cn',
    'kestrel allowlist is only kestrel.crzliang.cn',
  );

  const fixture = parseSitesConfig({
    sites: [
      { id: 'listed', domain: ['one.fixture.test', 'two.fixture.test'] },
      { id: 'emptyfix', domain: [] },
    ],
  });
  const emptyFix = fixture.find((site) => site.id === 'emptyfix');
  assert(emptyFix?.domain.length === 0, 'empty allowlist fixture stays out of sites.json');
  assert(
    matchSiteByHost(fixture, 'TWO.FIXTURE.TEST:8443')?.id === 'listed',
    'fixture second hostname matches with case and port stripped',
  );
  assert(
    !isRequestHostAllowed('one.fixture.test', emptyFix?.domain ?? []),
    'empty allowlist fixture matches nothing',
  );

  const forged = await trackPost(
    ctx(
      new Request('http://localhost/v1/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId,
          url: `https://${primaryHost}/docs`,
          visitorId: 'visitorallow01',
        }),
      }),
    ),
  );
  assert(forged.status === 405, 'body url on an allowlisted host does not count');
  const stillZero = await readPublic(siteId, '/docs');
  assert(
    stillZero.body.site_pv === 0 && stillZero.body.site_uv === 0,
    'forged body leaves the allowlisted site at zero',
  );

  const kestrelBefore = await readPublic(kestrel.id, '/docs');
  const blogBefore = await readPublic(blog.id, '/docs');

  const wrongHost = await navigate({ host: 'not-listed.example', path: '/docs' });
  assert(wrongHost.setCookie === null, 'host outside the allowlist does not count');
  const afterWrong = await readPublic(siteId, '/docs');
  assert(afterWrong.body.site_pv === 0, 'disallowed host stays at zero');

  const first = await navigate({ host: primaryHost, path: '/docs' });
  const visitor = vidFromSetCookie(first.setCookie);
  assert(visitor !== null, 'allowlisted host sets a visitor cookie');
  const firstCounts = await readPublic(siteId, '/docs');
  assert(
    firstCounts.body.site_pv === 1 && firstCounts.body.page_pv === 1,
    'first allowed document is 1',
  );
  const kestrelAfterWww = await readPublic(kestrel.id, '/docs');
  assert(
    sameCounts(kestrelAfterWww.body, kestrelBefore.body),
    'www.crzliang.cn does not count into kestrel',
  );

  const cased = await navigate({
    host: `${primaryHost.toUpperCase()}.`,
    path: '/docs',
    cookie: `kestrel_vid=${visitor}`,
  });
  assert(cased.setCookie === null, 'case-variant host reuses the visitor');
  const casedCounts = await readPublic(siteId, '/docs');
  assert(casedCounts.body.site_pv === 2, `case-variant site_pv=2 (got ${casedCounts.body.site_pv})`);
  assert(casedCounts.body.page_pv === 2, 'same path still counts after case-variant');
  assert(casedCounts.body.site_uv === 1, 'case-variant does not add another site uv');

  const port = await navigate({ host: `${primaryHost}:8443`, path: '/docs' });
  const otherVisitor = vidFromSetCookie(port.setCookie);
  assert(otherVisitor !== null && otherVisitor !== visitor, 'port host is a new visitor');
  const portCounts = await readPublic(siteId, '/docs');
  assert(portCounts.body.site_pv === 3, `port host site_pv=3 (got ${portCounts.body.site_pv})`);
  assert(portCounts.body.site_uv === 2, 'second visitor increments site uv');
  assert(portCounts.body.page_uv === 2, 'second visitor increments page uv');

  const beforeDeny = await readPublic(siteId, '/docs');
  const denied = await navigate({ host: 'not-listed.example', path: '/docs' });
  assert(denied.setCookie === null, 'foreign hostname is not counted');
  const sibling = await navigate({ host: `evil.${primaryHost}`, path: '/docs' });
  assert(sibling.setCookie === null, 'suffix of an allowlisted host is not counted');
  const afterDeny = await readPublic(siteId, '/docs');
  assert(sameCounts(afterDeny.body, beforeDeny.body), 'rejected hostnames do not change counts');

  const listedAgain = await navigate({
    host: primaryHost,
    path: '/docs',
    cookie: `kestrel_vid=${visitor}`,
  });
  assert(listedAgain.setCookie === null, 'listed host still belongs to www');
  const listedAfter = await readPublic(siteId, '/docs');
  assert(listedAfter.body.site_pv === beforeDeny.body.site_pv + 1, 'www still counts its own host');

  const blogHit = await navigate({ host: 'blog.crzliang.cn', path: '/docs' });
  assert(vidFromSetCookie(blogHit.setCookie) !== null, 'blog host sets a visitor cookie');
  const blogCounts = await readPublic(blog.id, '/docs');
  assert(
    blogCounts.body.site_pv === blogBefore.body.site_pv + 1 && blogCounts.body.page_pv === 1,
    'Host blog.crzliang.cn counts blog',
  );
  const wwwAfterBlog = await readPublic(www.id, '/docs');
  const kestrelAfterBlog = await readPublic(kestrel.id, '/docs');
  assert(sameCounts(wwwAfterBlog.body, listedAfter.body), 'blog host does not count into www');
  assert(
    sameCounts(kestrelAfterBlog.body, kestrelBefore.body),
    'blog host does not count into kestrel',
  );
}

async function testHomepage(): Promise<void> {
  console.log('\n[homepage]');
  const file = join(root, 'tracking-script/dist/index.html');
  assert(existsSync(file), 'index.html is in the deploy directory');
  if (!existsSync(file)) return;
  const html = readFileSync(file, 'utf8');
  const site = sitesFromFile().find((item) => item.domain.length > 0);
  assert(site?.id === 'kestrel', 'homepage site is kestrel');
  for (const key of ['site_pv', 'page_pv', 'site_uv', 'page_uv'] as const) {
    assert(html.includes(`id="kestrel_container_${key}"`), `homepage has container ${key}`);
    assert(html.includes(`id="kestrel_value_${key}"`), `homepage has value ${key}`);
  }
  assert(html.includes('src="/kestrel.js'), 'homepage loads kestrel.js');
  assert(html.includes('data-endpoint="/v1/track"'), 'homepage reads /v1/track');
  assert(
    Boolean(site) && html.includes(`data-site="${site?.id}"`),
    'homepage uses the first site that has a domain',
  );
  assert(!html.includes('%%SITE_ID%%') && !html.includes('%%VERSION%%'), 'homepage placeholders are filled');
  assert(/<h1>\s*Kestrel\s*<\/h1>/.test(html), 'homepage title is visible text');
  assert(
    /<h1>\s*Kestrel\s*<\/h1>[\s\S]*id="kestrel_value_site_pv">/.test(html),
    'count slots sit after the title',
  );
  assert(!/登录|控制台|趋势/.test(html), 'homepage does not mention a console, login, or trends');

  const host = site?.domain[0] ?? '';
  const home = await navigate({ host, path: '/' });
  assert(home.status === 200, 'middleware returns the homepage response');
  assert(home.text === 'page', 'middleware does not replace the homepage body');
  assert(home.setCookie !== null, 'allowlisted request for / is counted');
  const indexFile = await navigate({
    host,
    path: '/index.html',
    cookie: `kestrel_vid=${vidFromSetCookie(home.setCookie)}`,
  });
  assert(indexFile.status === 200, 'middleware does not block /index.html');
  assert(indexFile.text === 'page', 'middleware passes the index.html body through');
  const counted = await readPublic(site?.id ?? '', '/');
  assert(counted.body.site_pv >= 1 && counted.body.page_pv >= 1, 'homepage path is stored');
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
  const source = raw.toString('utf8');
  assert(source.includes('kestrel_value_'), 'script fills count values');
  assert(source.includes('kestrel_container_'), 'script reveals count containers');
  assert(source.includes('site_pv') && source.includes('page_uv'), 'script knows all four fields');
  assert(!source.includes('_kst_vid'), 'script does not store a visitor id');
  assert(!source.includes('visitorId'), 'script does not send visitorId');
  assert(!source.includes('pushState'), 'script does not count client-side routes');
  assert(source.includes('GET'), 'script reads counts with GET');
}

async function main(): Promise<void> {
  console.log('Kestrel smoke tests');
  await testSchema();
  await testStaticConfig();
  await testCounts();
  await testAllowlist();
  await testTrackerBudget();
  await testHomepage();

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

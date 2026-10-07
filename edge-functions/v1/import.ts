import {
  pagePath,
  pagePvKey,
  pageUvKey,
  sha256Hex,
  sitePvKey,
  siteUvKey,
} from '../lib/counter';
import { getSite } from '../lib/sites';
import { kvPutText } from '../lib/storage';
import { corsHeaders, jsonResponse } from '../lib/http';
import type { EventContext } from '../lib/types';

type ImportPage = {
  path?: unknown;
  pagePv?: unknown;
  pageUv?: unknown;
};

type ImportBody = {
  siteId?: unknown;
  sitePv?: unknown;
  siteUv?: unknown;
  pages?: unknown;
};

function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (match) return match[1].trim();
  return request.headers.get('x-kestrel-import-token');
}

function expectedToken(env: Record<string, unknown> | undefined): string | null {
  const value = env?.KESTREL_IMPORT_TOKEN;
  return typeof value === 'string' && value ? value : null;
}

function intOrNull(value: unknown): number | null {
  if (value == null || value === '') return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) return NaN;
  return number;
}

export async function onRequestPost({
  request,
  env,
}: EventContext): Promise<Response> {
  const expected = expectedToken(env);
  if (!expected) {
    return jsonResponse({ error: 'import_disabled' }, 503, corsHeaders);
  }
  if (bearerToken(request) !== expected) {
    return jsonResponse({ error: 'unauthorized' }, 401, corsHeaders);
  }

  let body: ImportBody;
  try {
    body = (await request.json()) as ImportBody;
  } catch {
    return jsonResponse({ error: 'invalid_json' }, 400, corsHeaders);
  }

  const siteId = typeof body.siteId === 'string' ? body.siteId.trim().toLowerCase() : '';
  const site = siteId ? getSite(siteId) : null;
  if (!site) return jsonResponse({ error: 'unknown_site' }, 404, corsHeaders);

  const sitePv = intOrNull(body.sitePv);
  const siteUv = intOrNull(body.siteUv);
  if (Number.isNaN(sitePv) || Number.isNaN(siteUv)) {
    return jsonResponse({ error: 'invalid_numbers' }, 400, corsHeaders);
  }

  const pages = Array.isArray(body.pages) ? (body.pages as ImportPage[]) : [];
  if (pages.length > 1000) {
    return jsonResponse({ error: 'too_many_pages' }, 400, corsHeaders);
  }

  if (sitePv != null) await kvPutText(sitePvKey(site.id), String(sitePv));
  if (siteUv != null) await kvPutText(siteUvKey(site.id), String(siteUv));

  let importedPages = 0;
  for (const page of pages) {
    const rawPath = typeof page.path === 'string' ? page.path.trim() : '';
    if (!rawPath || rawPath.length > 2048) continue;
    const path = pagePath(rawPath);
    const hash = await sha256Hex(path);

    const pagePv = intOrNull(page.pagePv);
    if (Number.isNaN(pagePv)) return jsonResponse({ error: 'invalid_numbers' }, 400, corsHeaders);
    if (pagePv != null) await kvPutText(pagePvKey(site.id, hash), String(pagePv));

    const pageUv = intOrNull(page.pageUv);
    if (Number.isNaN(pageUv)) return jsonResponse({ error: 'invalid_numbers' }, 400, corsHeaders);
    if (pageUv != null) await kvPutText(pageUvKey(site.id, hash), String(pageUv));

    importedPages += 1;
  }

  return jsonResponse(
    { ok: true, siteId: site.id, sitePv, siteUv, importedPages },
    200,
    corsHeaders,
  );
}

export async function onRequestOptions(): Promise<Response> {
  return new Response(null, { status: 204, headers: corsHeaders });
}

import {
  createVisitorId,
  sanitizeVisitorId,
  visitorIdFromCookie,
  visitorSetCookie,
} from '@kestrel/shared';
import { pagePath, recordVisit, sha256Hex } from '../lib/counter';
import { getSite } from '../lib/sites';
import { isAllowedSiteOrigin } from '../lib/origin';
import { corsHeaders, jsonResponse } from '../lib/http';
import type { EventContext } from '../lib/types';

/**
 * Count one page view reported by a browser on an allowlisted site origin.
 * The request must come from a hostname listed for that site, so the page cannot
 * write into another site's counters.
 */
export async function onRequestPost({ request }: EventContext): Promise<Response> {
  const url = new URL(request.url);
  const siteId = (url.searchParams.get('siteId') ?? '').trim().toLowerCase();
  const path = (url.searchParams.get('path') ?? '').trim();

  if (!siteId) return jsonResponse({ error: 'siteId_required' }, 400, corsHeaders);
  if (path.length > 2048) {
    return jsonResponse({ error: 'invalid_payload', details: 'path_too_long' }, 400, corsHeaders);
  }

  const site = getSite(siteId);
  if (!site) return jsonResponse({ error: 'unknown_site' }, 404, corsHeaders);

  if (!isAllowedSiteOrigin(request, site)) {
    return jsonResponse({ error: 'forbidden_origin' }, 403, corsHeaders);
  }

  const provided = sanitizeVisitorId(url.searchParams.get('visitorId') ?? '');
  const existing = visitorIdFromCookie(request.headers.get('cookie'));
  const visitorId = provided ?? existing ?? createVisitorId();
  const counts = await recordVisit(
    site.id,
    await sha256Hex(pagePath(path || '/')),
    visitorId,
  );

  const headers = { ...corsHeaders };
  if (!provided && !existing) {
    headers['Set-Cookie'] = visitorSetCookie(visitorId, url.protocol === 'https:');
  }
  return jsonResponse({ ...counts, visitorId }, 200, headers);
}

export async function onRequestOptions(): Promise<Response> {
  return new Response(null, { status: 204, headers: corsHeaders });
}

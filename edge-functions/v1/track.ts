import {
  CountQuerySchema,
  TRACK_POST_ERROR,
  TRACK_POST_MESSAGE,
} from '@kestrel/shared';
import { pagePath, readCounts, sha256Hex } from '../lib/counter';
import { getSite } from '../lib/sites';
import { corsHeaders, jsonResponse } from '../lib/http';
import type { EventContext } from '../lib/types';

/**
 * Public read of the four integers. Does not increment.
 * The page path comes from the `path` query (pathname + search), never from a url field.
 */
export async function onRequestGet({
  request,
}: EventContext): Promise<Response> {
  const url = new URL(request.url);
  const parsed = CountQuerySchema.safeParse({
    siteId: url.searchParams.get('siteId') ?? '',
    path: url.searchParams.get('path') ?? undefined,
  });
  if (!parsed.success) {
    const siteId = (url.searchParams.get('siteId') ?? '').trim();
    if (!siteId) {
      return jsonResponse({ error: 'siteId_required' }, 400, corsHeaders);
    }
    return jsonResponse(
      { error: 'invalid_payload', details: parsed.error.flatten() },
      400,
      corsHeaders,
    );
  }

  if (!getSite(parsed.data.siteId)) {
    return jsonResponse({ error: 'unknown_site' }, 404, corsHeaders);
  }

  const path = (parsed.data.path ?? '').trim();
  const counts = await readCounts(
    parsed.data.siteId,
    path ? await sha256Hex(pagePath(path)) : null,
  );
  return jsonResponse(counts, 200, corsHeaders);
}

/** Old busuanzi-style write. The body is ignored and nothing is incremented. */
export async function onRequestPost(): Promise<Response> {
  return jsonResponse(
    { error: TRACK_POST_ERROR, message: TRACK_POST_MESSAGE },
    405,
    { ...corsHeaders, Allow: 'GET, OPTIONS' },
  );
}

export async function onRequestOptions(): Promise<Response> {
  return new Response(null, { status: 204, headers: corsHeaders });
}

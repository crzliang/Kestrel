import { corsHeaders, jsonResponse } from '../../lib/http';
import { getRecentEvents } from '../../lib/storage';
import type { EventContext } from '../../lib/types';

export async function onRequestGet({
  request,
}: EventContext): Promise<Response> {
  const url = new URL(request.url);
  const siteId = url.searchParams.get('siteId');
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? '50')));
  if (!siteId) {
    return jsonResponse({ error: 'siteId_required' }, 400, corsHeaders);
  }

  const events = await getRecentEvents(siteId, limit);

  return jsonResponse(
    {
      siteId,
      events,
      note: 'ipHash is a truncated SHA-256 of client IP; raw IP is never stored',
      ts: Date.now(),
    },
    200,
    corsHeaders,
  );
}

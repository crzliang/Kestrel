import { corsHeaders, jsonResponse } from '../../lib/http';
import { kvGetJson, sourceDayKey } from '../../lib/storage';
import type { EventContext } from '../../lib/types';

export async function onRequestGet({
  request,
}: EventContext): Promise<Response> {
  const siteId = new URL(request.url).searchParams.get('siteId');
  if (!siteId) {
    return jsonResponse({ error: 'siteId_required' }, 400, corsHeaders);
  }

  const sources =
    (await kvGetJson<Record<string, number>>(sourceDayKey(siteId))) ?? {};
  const ranking = Object.entries(sources)
    .map(([source, pv]) => ({ source, pv }))
    .sort((a, b) => b.pv - a.pv);

  return jsonResponse(
    { siteId, date: new Date().toISOString().slice(0, 10), sources, ranking, ts: Date.now() },
    200,
    corsHeaders,
  );
}

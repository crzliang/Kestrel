import { corsHeaders, jsonResponse } from '../../lib/http';
import { geoDayKey, kvGetJson } from '../../lib/storage';
import type { EventContext } from '../../lib/types';

export async function onRequestGet({
  request,
}: EventContext): Promise<Response> {
  const siteId = new URL(request.url).searchParams.get('siteId');
  if (!siteId) {
    return jsonResponse({ error: 'siteId_required' }, 400, corsHeaders);
  }

  const countries =
    (await kvGetJson<Record<string, number>>(geoDayKey(siteId))) ?? {};

  const ranking = Object.entries(countries)
    .map(([country, pv]) => ({ country, pv }))
    .sort((a, b) => b.pv - a.pv);

  return jsonResponse(
    {
      siteId,
      date: new Date().toISOString().slice(0, 10),
      countries,
      ranking,
      ts: Date.now(),
    },
    200,
    corsHeaders,
  );
}

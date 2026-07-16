import { corsHeaders, jsonResponse } from '../../lib/http';
import { kvGetJson, pageDayKey } from '../../lib/storage';
import type { EventContext } from '../../lib/types';

export async function onRequestGet({
  request,
}: EventContext): Promise<Response> {
  const url = new URL(request.url);
  const siteId = url.searchParams.get('siteId');
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? '20')));
  if (!siteId) {
    return jsonResponse({ error: 'siteId_required' }, 400, corsHeaders);
  }

  const pages =
    (await kvGetJson<Record<string, number>>(pageDayKey(siteId))) ?? {};
  const ranking = Object.entries(pages)
    .map(([path, pv]) => ({ path, pv }))
    .sort((a, b) => b.pv - a.pv)
    .slice(0, limit);

  return jsonResponse(
    {
      siteId,
      date: new Date().toISOString().slice(0, 10),
      pages,
      ranking,
      ts: Date.now(),
    },
    200,
    corsHeaders,
  );
}

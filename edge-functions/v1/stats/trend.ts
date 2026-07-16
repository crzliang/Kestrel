import type { DailyAggregate } from '@kestrel/shared';
import { corsHeaders, jsonResponse } from '../../lib/http';
import { getDailyAggregate } from '../../lib/storage';
import type { EventContext } from '../../lib/types';

export async function onRequestGet({
  request,
}: EventContext): Promise<Response> {
  const url = new URL(request.url);
  const siteId = url.searchParams.get('siteId');
  const days = Math.min(90, Math.max(1, Number(url.searchParams.get('days') ?? '7')));

  if (!siteId) {
    return jsonResponse({ error: 'siteId_required' }, 400, corsHeaders);
  }

  const points: Array<{ date: string; pv: number; uv: number }> = [];
  const today = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(
      today.getUTCFullYear(),
      today.getUTCMonth(),
      today.getUTCDate() - i,
    ));
    const ymd = d.toISOString().slice(0, 10);
    const agg = await getDailyAggregate<DailyAggregate>(siteId, ymd);
    points.push({
      date: ymd,
      pv: agg?.pv ?? 0,
      uv: agg?.uv ?? 0,
    });
  }

  return jsonResponse(
    { siteId, granularity: 'day', points },
    200,
    corsHeaders,
  );
}

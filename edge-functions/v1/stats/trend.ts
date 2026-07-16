import type { DailyAggregate } from '@kestrel/shared';
import { corsHeaders, jsonResponse } from '../../lib/http';
import { getDailyAggregate } from '../../lib/storage';
import type { EventContext } from '../../lib/types';

function utcYmd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseYmd(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function eachDay(start: Date, end: Date): string[] {
  const out: string[] = [];
  const cur = new Date(start.getTime());
  while (cur.getTime() <= end.getTime()) {
    out.push(utcYmd(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

export async function onRequestGet({
  request,
}: EventContext): Promise<Response> {
  const url = new URL(request.url);
  const siteId = url.searchParams.get('siteId');
  if (!siteId) {
    return jsonResponse({ error: 'siteId_required' }, 400, corsHeaders);
  }

  const range = url.searchParams.get('range');
  const startRaw = url.searchParams.get('startDate');
  const endRaw = url.searchParams.get('endDate');
  const today = new Date();
  const endToday = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  );

  let dates: string[] = [];

  if (startRaw && endRaw) {
    const start = parseYmd(startRaw);
    const end = parseYmd(endRaw);
    if (!start || !end || start > end) {
      return jsonResponse({ error: 'invalid_date_range' }, 400, corsHeaders);
    }
    const maxSpan = 366;
    const span =
      Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
    if (span > maxSpan) {
      return jsonResponse({ error: 'range_too_large' }, 400, corsHeaders);
    }
    dates = eachDay(start, end);
  } else if (range === 'all') {
    const days = 365;
    dates = eachDay(
      new Date(endToday.getTime() - (days - 1) * 86_400_000),
      endToday,
    );
  } else {
    const days = Math.min(
      365,
      Math.max(1, Number(url.searchParams.get('days') ?? '7')),
    );
    dates = eachDay(
      new Date(endToday.getTime() - (days - 1) * 86_400_000),
      endToday,
    );
  }

  const points: Array<{ date: string; pv: number; uv: number }> = [];
  for (const ymd of dates) {
    const agg = await getDailyAggregate<DailyAggregate>(siteId, ymd);
    points.push({
      date: ymd,
      pv: agg?.pv ?? 0,
      uv: agg?.uv ?? 0,
    });
  }

  return jsonResponse(
    {
      siteId,
      granularity: 'day',
      points,
      startDate: dates[0] ?? null,
      endDate: dates[dates.length - 1] ?? null,
    },
    200,
    corsHeaders,
  );
}

import { corsHeaders, jsonResponse } from '../../lib/http';
import { getRecentEvents, type BehaviorEvent } from '../../lib/storage';
import type { EventContext } from '../../lib/types';

function parseYmd(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function eventTs(e: BehaviorEvent): number {
  return e.receivedAt || e.timestamp || 0;
}

function resolveWindow(url: URL): {
  startMs: number | null;
  endMs: number | null;
  startDate: string | null;
  endDate: string | null;
  error?: string;
} {
  const range = url.searchParams.get('range');
  const startRaw = url.searchParams.get('startDate');
  const endRaw = url.searchParams.get('endDate');
  const now = Date.now();
  const endOfToday = new Date();
  endOfToday.setUTCHours(23, 59, 59, 999);

  if (startRaw && endRaw) {
    const start = parseYmd(startRaw);
    const end = parseYmd(endRaw);
    if (!start || !end || start > end) {
      return {
        startMs: null,
        endMs: null,
        startDate: null,
        endDate: null,
        error: 'invalid_date_range',
      };
    }
    const span =
      Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
    if (span > 366) {
      return {
        startMs: null,
        endMs: null,
        startDate: null,
        endDate: null,
        error: 'range_too_large',
      };
    }
    const endMs = new Date(end);
    endMs.setUTCHours(23, 59, 59, 999);
    return {
      startMs: start.getTime(),
      endMs: endMs.getTime(),
      startDate: startRaw,
      endDate: endRaw,
    };
  }

  if (range === 'all') {
    return {
      startMs: null,
      endMs: null,
      startDate: null,
      endDate: null,
    };
  }

  const days = Math.min(
    365,
    Math.max(1, Number(url.searchParams.get('days') ?? '7')),
  );
  const start = new Date(endOfToday.getTime() - (days - 1) * 86_400_000);
  start.setUTCHours(0, 0, 0, 0);
  return {
    startMs: start.getTime(),
    endMs: Math.max(endOfToday.getTime(), now),
    startDate: start.toISOString().slice(0, 10),
    endDate: endOfToday.toISOString().slice(0, 10),
  };
}

export async function onRequestGet({
  request,
}: EventContext): Promise<Response> {
  const url = new URL(request.url);
  const siteId = url.searchParams.get('siteId');
  const limit = Math.min(
    500,
    Math.max(1, Number(url.searchParams.get('limit') ?? '100')),
  );
  if (!siteId) {
    return jsonResponse({ error: 'siteId_required' }, 400, corsHeaders);
  }

  const window = resolveWindow(url);
  if (window.error) {
    return jsonResponse({ error: window.error }, 400, corsHeaders);
  }

  const all = await getRecentEvents(siteId, 500);
  const filtered = all.filter((e) => {
    const ts = eventTs(e);
    if (window.startMs != null && ts < window.startMs) return false;
    if (window.endMs != null && ts > window.endMs) return false;
    return true;
  });

  return jsonResponse(
    {
      siteId,
      events: filtered.slice(0, limit),
      startDate: window.startDate,
      endDate: window.endDate,
      note: 'Events include client IP; filtered from recent buffer by time range',
      ts: Date.now(),
    },
    200,
    corsHeaders,
  );
}

import { corsHeaders, jsonResponse } from '../../lib/http';
import { classifySource } from '../../lib/referrer';
import { kvGetJson, sourceDayKey } from '../../lib/storage';
import type { EventContext } from '../../lib/types';

function channelOf(host: string): string {
  if (!host || host === '(direct)') return 'direct';
  return classifySource(`https://${host}/`, 'https://local.invalid/');
}

export async function onRequestGet({
  request,
}: EventContext): Promise<Response> {
  const siteId = new URL(request.url).searchParams.get('siteId');
  if (!siteId) {
    return jsonResponse({ error: 'siteId_required' }, 400, corsHeaders);
  }

  const hosts =
    (await kvGetJson<Record<string, number>>(sourceDayKey(siteId))) ?? {};
  const ranking = Object.entries(hosts)
    .map(([host, pv]) => ({
      host,
      pv,
      channel: channelOf(host),
    }))
    .sort((a, b) => b.pv - a.pv);

  return jsonResponse(
    {
      siteId,
      date: new Date().toISOString().slice(0, 10),
      hosts,
      sources: hosts,
      ranking,
      ts: Date.now(),
    },
    200,
    corsHeaders,
  );
}

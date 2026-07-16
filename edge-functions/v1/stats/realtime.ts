import { corsHeaders, jsonResponse } from '../../lib/http';
import {
  getKv,
  kvGetSoftTTL,
  kvGetText,
  pvDayKey,
} from '../../lib/storage';
import type { EventContext } from '../../lib/types';

export async function onRequestGet({
  request,
}: EventContext): Promise<Response> {
  const siteId = new URL(request.url).searchParams.get('siteId');
  if (!siteId) {
    return jsonResponse({ error: 'siteId_required' }, 400, corsHeaders);
  }

  const pvToday = Number((await kvGetText(pvDayKey(siteId))) ?? '0');

  let online = 0;
  let cursor: string | undefined;
  const kv = getKv();
  do {
    const page = await kv.list({
      prefix: `online_${siteId}_`,
      limit: 256,
      cursor,
    });
    for (const { key } of page.keys) {
      if (await kvGetSoftTTL(key)) online += 1;
    }
    cursor = page.complete ? undefined : (page.cursor ?? undefined);
  } while (cursor);

  return jsonResponse(
    { siteId, pvToday, online, ts: Date.now() },
    200,
    corsHeaders,
  );
}

import { corsHeaders, jsonResponse } from '../../lib/http';
import { deviceDayKey, kvGetJson } from '../../lib/storage';
import type { EventContext } from '../../lib/types';

type DeviceAgg = {
  os: Record<string, number>;
  browser: Record<string, number>;
  type: Record<string, number>;
};

function toRanking(map: Record<string, number> = {}) {
  return Object.entries(map)
    .map(([name, pv]) => ({ name, pv }))
    .sort((a, b) => b.pv - a.pv);
}

export async function onRequestGet({
  request,
}: EventContext): Promise<Response> {
  const siteId = new URL(request.url).searchParams.get('siteId');
  if (!siteId) {
    return jsonResponse({ error: 'siteId_required' }, 400, corsHeaders);
  }

  const devices = (await kvGetJson<DeviceAgg>(deviceDayKey(siteId))) ?? {
    os: {},
    browser: {},
    type: {},
  };

  return jsonResponse(
    {
      siteId,
      date: new Date().toISOString().slice(0, 10),
      devices: {
        os: devices.os ?? {},
        browser: devices.browser ?? {},
        type: devices.type ?? {},
      },
      ranking: {
        os: toRanking(devices.os),
        browser: toRanking(devices.browser),
        type: toRanking(devices.type),
      },
      ts: Date.now(),
    },
    200,
    corsHeaders,
  );
}

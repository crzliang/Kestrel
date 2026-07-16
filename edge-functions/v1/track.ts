import { TrackEventSchema } from '@kestrel/shared';
import {
  appendRawEvent,
  kvGetJson,
  kvGetSoftTTL,
  kvIncr,
  kvIncrCountry,
  kvIncrFlatField,
  kvPutJson,
  kvPutSoftTTL,
  onlineKey,
  pageDayKey,
  pushRecentEvent,
  pvDayKey,
  rateKey,
  deviceDayKey,
  sourceDayKey,
  ipDayKey,
} from '../lib/storage';
import { parseUserAgent } from '../lib/parser';
import { resolveClientGeo } from '../lib/geo';
import {
  classifySource,
  pagePath,
  referrerHost,
} from '../lib/referrer';
import { assertSiteExists } from '../lib/sites';
import {
  clientIp,
  corsHeaders,
  jsonResponse,
  noContent,
  sha256Short,
} from '../lib/http';
import type { EventContext } from '../lib/types';

export async function onRequestPost({
  request,
}: EventContext): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'invalid_json' }, 400, corsHeaders);
  }

  const parsed = TrackEventSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse(
      { error: 'invalid_payload', details: parsed.error.flatten() },
      400,
      corsHeaders,
    );
  }

  const event = parsed.data;
  try {
    await assertSiteExists(event.siteId);
  } catch (e) {
    const err = e as Error & { status?: number };
    if (err.status === 404) {
      return jsonResponse({ error: 'unknown_site' }, 404, corsHeaders);
    }
    throw e;
  }
  const ip = clientIp(request);
  const ipHash = await sha256Short(ip);
  const hits = (await kvGetSoftTTL<number>(rateKey(event.siteId, ipHash))) ?? 0;
  if (hits > 120) {
    return jsonResponse({ error: 'rate_limited' }, 429, corsHeaders);
  }
  await kvPutSoftTTL(rateKey(event.siteId, ipHash), hits + 1, 120);

  const ua = request.headers.get('user-agent') ?? '';
  const device = parseUserAgent(ua);
  const uaFingerprint = await sha256Short(ua || 'unknown-ua');
  const geo = resolveClientGeo(request);
  const source = classifySource(event.referrer, event.url);
  const refHost = referrerHost(event.referrer);
  const path = pagePath(event.url);
  const receivedAt = Date.now();

  if (event.eventType === 'pageview') {
    await kvIncr(pvDayKey(event.siteId, event.timestamp));
    await kvPutSoftTTL(
      onlineKey(event.siteId, event.visitorId),
      { t: Date.now() },
      300,
    );
    await kvIncrCountry(event.siteId, geo.country, event.timestamp);
    await kvIncrFlatField(
      sourceDayKey(event.siteId, event.timestamp),
      refHost || '(direct)',
    );
    await kvIncrFlatField(pageDayKey(event.siteId, event.timestamp), path);
    await kvIncrFlatField(ipDayKey(event.siteId, event.timestamp), ip);

    const devKey = deviceDayKey(event.siteId, event.timestamp);
    const devices = (await kvGetJson<{
      os: Record<string, number>;
      browser: Record<string, number>;
      type: Record<string, number>;
      fingerprints: Record<
        string,
        { browser: string; version: string; pv: number }
      >;
    }>(devKey)) ?? {
      os: {},
      browser: {},
      type: {},
      fingerprints: {},
    };
    devices.os[device.os] = (devices.os[device.os] ?? 0) + 1;
    devices.browser[device.browser] = (devices.browser[device.browser] ?? 0) + 1;
    devices.type[device.type] = (devices.type[device.type] ?? 0) + 1;
    const fp = devices.fingerprints[uaFingerprint] ?? {
      browser: device.browser,
      version: device.version,
      pv: 0,
    };
    fp.browser = device.browser;
    fp.version = device.version;
    fp.pv += 1;
    devices.fingerprints[uaFingerprint] = fp;
    await kvPutJson(devKey, devices);
  }

  const enriched = {
    timestamp: event.timestamp,
    receivedAt,
    visitorId: event.visitorId,
    eventType: event.eventType,
    path,
    url: event.url,
    referrer: event.referrer,
    referrerHost: refHost,
    source,
    country: geo.country,
    ip,
    ipHash,
    uaFingerprint,
    screenWidth: event.screenWidth,
    device,
  };

  await pushRecentEvent(event.siteId, enriched);
  await appendRawEvent(event.siteId, {
    ...enriched,
    siteId: event.siteId,
    // keep UA for offline re-parse
    ua,
  });

  return noContent(corsHeaders);
}

export async function onRequestOptions(): Promise<Response> {
  return new Response(null, { status: 204, headers: corsHeaders });
}

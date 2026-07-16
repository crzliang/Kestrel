import { CreateSiteSchema } from '@kestrel/shared';
import { corsHeaders, jsonResponse } from '../lib/http';
import { createSite, ensureDemoSite, listSites } from '../lib/sites';
import type { EventContext } from '../lib/types';

export async function onRequestGet(): Promise<Response> {
  const sites = await ensureDemoSite();
  return jsonResponse({ sites, total: sites.length }, 200, corsHeaders);
}

export async function onRequestPost({
  request,
}: EventContext): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'invalid_json' }, 400, corsHeaders);
  }

  const parsed = CreateSiteSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse(
      { error: 'invalid_payload', details: parsed.error.flatten() },
      400,
      corsHeaders,
    );
  }

  try {
    // ensure index exists / demo seeded before create
    await listSites();
    const site = await createSite(parsed.data);
    return jsonResponse({ site }, 201, corsHeaders);
  } catch (e) {
    const err = e as Error & { status?: number };
    if (err.status === 409) {
      return jsonResponse({ error: 'site_exists' }, 409, corsHeaders);
    }
    throw e;
  }
}

export async function onRequestOptions(): Promise<Response> {
  return new Response(null, { status: 204, headers: corsHeaders });
}

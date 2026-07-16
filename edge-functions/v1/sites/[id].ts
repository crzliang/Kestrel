import { UpdateSiteSchema } from '@kestrel/shared';
import { corsHeaders, jsonResponse, noContent } from '../../lib/http';
import { deleteSite, getSite, updateSite } from '../../lib/sites';
import type { EventContext } from '../../lib/types';

export async function onRequestGet({
  params,
}: EventContext): Promise<Response> {
  const id = params.id;
  if (!id) return jsonResponse({ error: 'id_required' }, 400, corsHeaders);
  const site = await getSite(id);
  if (!site) return jsonResponse({ error: 'not_found' }, 404, corsHeaders);
  return jsonResponse({ site }, 200, corsHeaders);
}

export async function onRequestPatch({
  request,
  params,
}: EventContext): Promise<Response> {
  const id = params.id;
  if (!id) return jsonResponse({ error: 'id_required' }, 400, corsHeaders);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'invalid_json' }, 400, corsHeaders);
  }

  const parsed = UpdateSiteSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse(
      { error: 'invalid_payload', details: parsed.error.flatten() },
      400,
      corsHeaders,
    );
  }

  try {
    const site = await updateSite(id, parsed.data);
    return jsonResponse({ site }, 200, corsHeaders);
  } catch (e) {
    const err = e as Error & { status?: number };
    if (err.status === 404) {
      return jsonResponse({ error: 'not_found' }, 404, corsHeaders);
    }
    throw e;
  }
}

export async function onRequestDelete({
  params,
}: EventContext): Promise<Response> {
  const id = params.id;
  if (!id) return jsonResponse({ error: 'id_required' }, 400, corsHeaders);
  try {
    await deleteSite(id);
    return noContent(corsHeaders);
  } catch (e) {
    const err = e as Error & { status?: number };
    if (err.status === 404) {
      return jsonResponse({ error: 'not_found' }, 404, corsHeaders);
    }
    throw e;
  }
}

export async function onRequestOptions(): Promise<Response> {
  return new Response(null, { status: 204, headers: corsHeaders });
}

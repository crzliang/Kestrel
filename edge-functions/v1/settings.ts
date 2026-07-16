import { UpdateSystemSettingsSchema } from '@kestrel/shared';
import { corsHeaders, jsonResponse } from '../lib/http';
import {
  getSystemSettings,
  updateSystemSettings,
} from '../lib/settings';
import type { EventContext } from '../lib/types';

export async function onRequestGet(): Promise<Response> {
  const settings = await getSystemSettings();
  return jsonResponse({ settings }, 200, corsHeaders);
}

export async function onRequestPatch({
  request,
}: EventContext): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'invalid_json' }, 400, corsHeaders);
  }

  const parsed = UpdateSystemSettingsSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse(
      { error: 'invalid_payload', details: parsed.error.flatten() },
      400,
      corsHeaders,
    );
  }

  const settings = await updateSystemSettings(parsed.data);
  return jsonResponse({ settings }, 200, corsHeaders);
}

export async function onRequestOptions(): Promise<Response> {
  return new Response(null, { status: 204, headers: corsHeaders });
}

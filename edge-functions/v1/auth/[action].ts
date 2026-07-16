import { ChangePasswordSchema, LoginSchema } from '@kestrel/shared';
import {
  changePassword,
  extractBearerToken,
  login,
  logout,
  resolveSession,
} from '../../lib/accounts';
import { corsHeaders, jsonResponse, noContent } from '../../lib/http';
import type { EventContext } from '../../lib/types';

export async function onRequestPost({
  request,
  env,
}: EventContext): Promise<Response> {
  const url = new URL(request.url);
  const action = url.pathname.replace(/\/+$/, '').split('/').pop();

  if (action === 'logout') {
    await logout(extractBearerToken(request));
    return noContent(corsHeaders);
  }

  if (action === 'password') {
    const account = await resolveSession(extractBearerToken(request));
    if (!account) {
      return jsonResponse({ error: 'unauthorized' }, 401, corsHeaders);
    }
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: 'invalid_json' }, 400, corsHeaders);
    }
    const parsed = ChangePasswordSchema.safeParse(body);
    if (!parsed.success) {
      return jsonResponse(
        { error: 'invalid_payload', details: parsed.error.flatten() },
        400,
        corsHeaders,
      );
    }
    try {
      await changePassword(
        account.id,
        parsed.data.currentPassword,
        parsed.data.newPassword,
      );
      return noContent(corsHeaders);
    } catch (e) {
      const err = e as Error & { status?: number };
      if (err.status === 401) {
        return jsonResponse({ error: 'invalid_credentials' }, 401, corsHeaders);
      }
      throw e;
    }
  }

  if (action !== 'login') {
    return jsonResponse({ error: 'not_found' }, 404, corsHeaders);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'invalid_json' }, 400, corsHeaders);
  }

  const parsed = LoginSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse(
      { error: 'invalid_payload', details: parsed.error.flatten() },
      400,
      corsHeaders,
    );
  }

  const data = parsed.data;
  if (!data.challengeToken && (!data.username || !data.password)) {
    return jsonResponse({ error: 'invalid_payload' }, 400, corsHeaders);
  }

  try {
    const result = await login(data, env as Record<string, unknown> | undefined);
    return jsonResponse(result, 200, corsHeaders);
  } catch (e) {
    const err = e as Error & { status?: number };
    if (err.status === 401) {
      return jsonResponse(
        { error: err.message || 'invalid_credentials' },
        401,
        corsHeaders,
      );
    }
    throw e;
  }
}

export async function onRequestGet({
  request,
}: EventContext): Promise<Response> {
  const url = new URL(request.url);
  const action = url.pathname.replace(/\/+$/, '').split('/').pop();
  if (action !== 'me') {
    return jsonResponse({ error: 'not_found' }, 404, corsHeaders);
  }

  const account = await resolveSession(extractBearerToken(request));
  if (!account) {
    return jsonResponse({ error: 'unauthorized' }, 401, corsHeaders);
  }
  return jsonResponse({ account }, 200, corsHeaders);
}

export async function onRequestOptions(): Promise<Response> {
  return new Response(null, { status: 204, headers: corsHeaders });
}

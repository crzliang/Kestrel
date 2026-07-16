import {
  TotpConfirmSchema,
  TotpDisableSchema,
} from '@kestrel/shared';
import {
  beginTotpSetup,
  confirmTotpSetup,
  disableTotp,
  extractBearerToken,
  resolveSession,
} from '../../../lib/accounts';
import { getSystemSettings } from '../../../lib/settings';
import { corsHeaders, jsonResponse } from '../../../lib/http';
import type { EventContext } from '../../../lib/types';

export async function onRequestPost({
  request,
  params,
}: EventContext): Promise<Response> {
  const action = params.action || new URL(request.url).pathname.split('/').pop();
  const account = await resolveSession(extractBearerToken(request));
  if (!account) {
    return jsonResponse({ error: 'unauthorized' }, 401, corsHeaders);
  }

  if (action === 'setup') {
    try {
      const settings = await getSystemSettings();
      const result = await beginTotpSetup(account.id, settings.title);
      return jsonResponse(result, 200, corsHeaders);
    } catch (e) {
      const err = e as Error & { status?: number };
      if (err.status === 400) {
        return jsonResponse({ error: err.message }, 400, corsHeaders);
      }
      throw e;
    }
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'invalid_json' }, 400, corsHeaders);
  }

  if (action === 'confirm') {
    const parsed = TotpConfirmSchema.safeParse(body);
    if (!parsed.success) {
      return jsonResponse(
        { error: 'invalid_payload', details: parsed.error.flatten() },
        400,
        corsHeaders,
      );
    }
    try {
      const next = await confirmTotpSetup(account.id, parsed.data.code);
      return jsonResponse({ account: next }, 200, corsHeaders);
    } catch (e) {
      const err = e as Error & { status?: number };
      if (err.status === 401) {
        return jsonResponse({ error: 'invalid_totp' }, 401, corsHeaders);
      }
      if (err.status === 400) {
        return jsonResponse({ error: err.message }, 400, corsHeaders);
      }
      throw e;
    }
  }

  if (action === 'disable') {
    const parsed = TotpDisableSchema.safeParse(body);
    if (!parsed.success) {
      return jsonResponse(
        { error: 'invalid_payload', details: parsed.error.flatten() },
        400,
        corsHeaders,
      );
    }
    try {
      const next = await disableTotp(
        account.id,
        parsed.data.password,
        parsed.data.code,
      );
      return jsonResponse({ account: next }, 200, corsHeaders);
    } catch (e) {
      const err = e as Error & { status?: number };
      if (err.message === 'invalid_totp') {
        return jsonResponse({ error: 'invalid_totp' }, 401, corsHeaders);
      }
      if (err.status === 401) {
        return jsonResponse({ error: 'invalid_credentials' }, 401, corsHeaders);
      }
      if (err.status === 400) {
        return jsonResponse({ error: err.message }, 400, corsHeaders);
      }
      throw e;
    }
  }

  return jsonResponse({ error: 'not_found' }, 404, corsHeaders);
}

export async function onRequestOptions(): Promise<Response> {
  return new Response(null, { status: 204, headers: corsHeaders });
}

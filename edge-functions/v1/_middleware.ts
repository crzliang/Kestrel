import {
  extractBearerToken,
  resolveSession,
} from '../lib/accounts';
import { corsHeaders, jsonResponse } from '../lib/http';
import type { EventContext } from '../lib/types';

function normalizePath(pathname: string): string {
  return pathname.replace(/\/+$/, '') || '/';
}

function isPublicRoute(method: string, pathname: string): boolean {
  if (pathname === '/v1/track' || pathname.startsWith('/v1/track/')) {
    return true;
  }
  if (method === 'POST' && pathname === '/v1/auth/login') return true;
  if (method === 'GET' && pathname === '/v1/settings') return true;
  return false;
}

/**
 * EdgeOne middleware: CORS + OPTIONS + dashboard auth for /v1/*
 * Public: track, login, GET system settings (branding on login screen).
 */
export async function onRequest(context: EventContext): Promise<Response> {
  const { request } = context;
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const pathname = normalizePath(new URL(request.url).pathname);
  if (!isPublicRoute(request.method, pathname)) {
    const account = await resolveSession(extractBearerToken(request));
    if (!account) {
      return jsonResponse({ error: 'unauthorized' }, 401, corsHeaders);
    }
  }

  const response = await context.next();
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(corsHeaders)) {
    headers.set(k, v);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

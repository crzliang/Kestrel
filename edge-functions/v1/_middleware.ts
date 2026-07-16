import type { EventContext } from '../lib/types';
import { corsHeaders } from '../lib/http';

/**
 * EdgeOne middleware: CORS + OPTIONS preflight for /v1/*
 */
export async function onRequest(context: EventContext): Promise<Response> {
  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
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

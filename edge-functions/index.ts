import type { EventContext } from './lib/types';
import { HOME_HTML } from './generated/home-html';
import { recordDocumentVisit, VISIT_HEADER } from './lib/document-visit';

/**
 * Homepage document for `/`.
 * Static index.html is filled from the CDN and never enters project middleware,
 * on a cache hit or a cache miss. This function records the visit itself and
 * marks the response so middleware does not count the same request again.
 */
async function homepage(context: EventContext): Promise<Response> {
  const recorded = await recordDocumentVisit(context.request);
  const headers = new Headers({
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'CDN-Cache-Control': 'no-store',
  });
  if (recorded) {
    headers.set(VISIT_HEADER, '1');
    if (recorded.setCookie) headers.append('Set-Cookie', recorded.setCookie);
  }
  return new Response(HOME_HTML, { status: 200, headers });
}

export const onRequestGet = homepage;
export const onRequest = homepage;

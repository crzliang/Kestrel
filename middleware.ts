import { isDocumentNavigation } from '@kestrel/shared';
import {
  recordDocumentVisit,
  VISIT_HEADER,
} from './edge-functions/lib/document-visit';

/**
 * EdgeOne project middleware. It runs before /v1 functions and the homepage function.
 * A visit is recorded only for an HTML document whose Host is on a site allowlist.
 * Counted HTML is marked uncacheable: a CDN hit never enters this function, so the
 * four numbers would stay put.
 */
type MiddlewareContext = {
  request: Request;
  next: (options?: {
    headers?: Record<string, unknown>;
  }) => Response | Promise<Response>;
};

function isHtmlDocument(response: Response): boolean {
  if (response.status === 304) return true;
  if (response.status !== 200) return false;
  const type = (response.headers.get('content-type') || '').toLowerCase();
  return type.includes('text/html');
}

/** Keep the document off the CDN so the next refresh reaches this middleware again. */
function withCountedHeaders(response: Response, setCookie?: string): Response {
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'private, no-store');
  headers.set('CDN-Cache-Control', 'no-store');
  if (setCookie) headers.append('Set-Cookie', setCookie);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export async function middleware(context: MiddlewareContext): Promise<Response> {
  const { request } = context;
  const response = await Promise.resolve(context.next());
  if (response.headers.get(VISIT_HEADER) === '1') return response;
  const url = new URL(request.url);
  if (
    !isDocumentNavigation({
      method: request.method,
      pathname: url.pathname,
      accept: request.headers.get('accept'),
      secFetchDest: request.headers.get('sec-fetch-dest'),
      purpose:
        request.headers.get('sec-purpose') || request.headers.get('purpose'),
    }) ||
    !isHtmlDocument(response)
  ) {
    return response;
  }

  const recorded = await recordDocumentVisit(request);
  if (!recorded) return response;
  return withCountedHeaders(response, recorded.setCookie ?? undefined);
}

export const config = {
  matcher: ['/', '/:path*'],
};

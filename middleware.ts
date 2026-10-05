import {
  isDocumentNavigation,
  visitorIdFromCookie,
  createVisitorId,
  visitorSetCookie,
} from '@kestrel/shared';
import { pagePath, recordVisit, sha256Hex } from './edge-functions/lib/counter';
import { findSiteByHost } from './edge-functions/lib/sites';

/**
 * EdgeOne project middleware. It runs before static files and /v1 functions.
 * File routes under edge-functions/ do not see HTML: static assets win those conflicts.
 * A visit is recorded only for an HTML document whose Host is on a site allowlist.
 */
type MiddlewareContext = {
  request: Request;
  next: (options?: {
    headers?: Record<string, unknown>;
  }) => Response | Promise<Response>;
};

function arrivalHost(request: Request): string {
  return request.headers.get('host') || new URL(request.url).host;
}

function isHtmlDocument(response: Response): boolean {
  if (response.status === 304) return true;
  if (response.status !== 200) return false;
  const type = (response.headers.get('content-type') || '').toLowerCase();
  return type.includes('text/html');
}

export async function middleware(context: MiddlewareContext): Promise<Response> {
  const { request } = context;
  const response = await Promise.resolve(context.next());
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

  const site = findSiteByHost(arrivalHost(request));
  if (!site) return response;

  const existing = visitorIdFromCookie(request.headers.get('cookie'));
  const visitorId = existing ?? createVisitorId();
  const path = pagePath(`${url.pathname}${url.search}`);
  await recordVisit(site.id, await sha256Hex(path), visitorId);
  if (existing) return response;

  const headers = new Headers(response.headers);
  headers.append(
    'Set-Cookie',
    visitorSetCookie(visitorId, url.protocol === 'https:'),
  );
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export const config = {
  matcher: ['/:path*'],
};

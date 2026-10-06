import {
  createVisitorId,
  isDocumentNavigation,
  visitorIdFromCookie,
  visitorSetCookie,
} from '@kestrel/shared';
import { pagePath, recordVisit, sha256Hex } from './counter';
import { findSiteByHost } from './sites';

/** Set on a response that already recorded this document view. */
export const VISIT_HEADER = 'x-kestrel-visit';

export function requestHost(request: Request): string {
  return request.headers.get('host') || new URL(request.url).host;
}

/**
 * Count one HTML document view when Host matches sites.json.
 * Returns null when this request is not a countable document.
 * setCookie is null for a visitor we already know.
 */
export async function recordDocumentVisit(
  request: Request,
): Promise<{ setCookie: string | null } | null> {
  const url = new URL(request.url);
  if (
    !isDocumentNavigation({
      method: request.method,
      pathname: url.pathname,
      accept: request.headers.get('accept'),
      secFetchDest: request.headers.get('sec-fetch-dest'),
      purpose:
        request.headers.get('sec-purpose') || request.headers.get('purpose'),
    })
  ) {
    return null;
  }
  const site = findSiteByHost(requestHost(request));
  if (!site) return null;
  const existing = visitorIdFromCookie(request.headers.get('cookie'));
  const visitorId = existing ?? createVisitorId();
  const path = pagePath(`${url.pathname}${url.search}`);
  await recordVisit(site.id, await sha256Hex(path), visitorId);
  return {
    setCookie: existing
      ? null
      : visitorSetCookie(visitorId, url.protocol === 'https:'),
  };
}

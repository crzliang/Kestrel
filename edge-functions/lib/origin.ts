import { isRequestHostAllowed, type Site } from '@kestrel/shared';

/** Origin hostname, falling back to Referer when a same-origin GET omits Origin. */
export function requestOriginHost(request: Request): string | null {
  const value = request.headers.get('origin') || request.headers.get('referer');
  if (!value) return null;
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}

export function isAllowedSiteOrigin(request: Request, site: Site): boolean {
  const origin = requestOriginHost(request);
  return origin !== null && isRequestHostAllowed(origin, site.domain);
}

export const VISITOR_COOKIE = 'kestrel_vid';

const VISITOR_ID = /^[A-Za-z0-9_]{8,64}$/;
const VISITOR_RAW = /^[A-Za-z0-9_-]+$/;

const STATIC_FILE =
  /\.(?:js|mjs|cjs|css|map|png|jpe?g|gif|webp|avif|svg|ico|bmp|woff2?|ttf|otf|eot|json|txt|xml|webmanifest|wasm|mp4|webm|mp3|pdf|zip|gz|br)$/i;

export type DocumentSignals = {
  method: string;
  pathname: string;
  accept?: string | null;
  secFetchDest?: string | null;
  purpose?: string | null;
};

function decodedPath(pathname: string): string {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return pathname;
  }
}

/** API routes, the tracker file, and static assets are never page views. */
export function isSkippableAssetPath(pathname: string): boolean {
  const path = decodedPath(pathname);
  if (path === '/v1' || path.startsWith('/v1/')) return true;
  if (/(?:^|\/)kestrel\.js$/i.test(path)) return true;
  return STATIC_FILE.test(path);
}

/**
 * HTML document navigation only.
 * Sec-Fetch-Dest wins when the browser sends it. Otherwise Accept must ask for HTML.
 * Prefetch and non-GET requests are not visits.
 */
export function isDocumentNavigation(input: DocumentSignals): boolean {
  if (input.method.toUpperCase() !== 'GET') return false;
  if (isSkippableAssetPath(input.pathname)) return false;
  const purpose = (input.purpose || '').toLowerCase();
  if (purpose.includes('prefetch')) return false;
  const dest = (input.secFetchDest || '').toLowerCase();
  if (dest) return dest === 'document';
  return (input.accept || '').toLowerCase().includes('text/html');
}

/** Drop hyphens. Anything else outside the KV-safe alphabet is rejected. */
export function sanitizeVisitorId(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || !VISITOR_RAW.test(trimmed)) return null;
  const stripped = trimmed.replace(/-/g, '');
  return VISITOR_ID.test(stripped) ? stripped : null;
}

export function visitorIdFromCookie(
  header: string | null | undefined,
): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() !== VISITOR_COOKIE) continue;
    let value = part.slice(eq + 1).trim();
    try {
      value = decodeURIComponent(value);
    } catch {
      /* keep the raw token */
    }
    return sanitizeVisitorId(value);
  }
  return null;
}

export function createVisitorId(): string {
  const uuid =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}00000000`;
  const id = sanitizeVisitorId(uuid);
  if (id) return id;
  return 'visitorfallback01';
}

/** Host-only cookie. HttpOnly so page scripts cannot choose the UV key. */
export function visitorSetCookie(value: string, secure: boolean): string {
  const parts = [
    `${VISITOR_COOKIE}=${value}`,
    'Path=/',
    'Max-Age=63072000',
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

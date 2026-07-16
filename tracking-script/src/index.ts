type TrackEventType = 'pageview' | 'click' | 'custom';

type TrackPayload = {
  siteId: string;
  eventType: TrackEventType;
  url: string;
  referrer: string;
  screenWidth: number;
  timestamp: number;
  visitorId: string;
};

const STORAGE_KEY = '_kst_vid';
const VERSION = __KESTREL_VERSION__;

function readConfig(): { siteId: string; endpoint: string } {
  const el = document.currentScript as HTMLScriptElement | null;
  const siteId =
    el?.getAttribute('data-site') ||
    (window as Window & { KESTREL_SITE_ID?: string }).KESTREL_SITE_ID ||
    '';
  const endpoint =
    el?.getAttribute('data-endpoint') ||
    (window as Window & { KESTREL_ENDPOINT?: string }).KESTREL_ENDPOINT ||
    '/v1/track';
  return { siteId, endpoint };
}

function visitorId(): string {
  try {
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing && existing.length >= 8) return existing;
    const id =
      (crypto.randomUUID && crypto.randomUUID().replace(/-/g, '')) ||
      `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(STORAGE_KEY, id);
    return id;
  } catch {
    return `anon_${Date.now().toString(36)}`;
  }
}

function send(endpoint: string, payload: TrackPayload): void {
  const body = JSON.stringify(payload);
  if (navigator.sendBeacon) {
    const ok = navigator.sendBeacon(
      endpoint,
      new Blob([body], { type: 'application/json' }),
    );
    if (ok) return;
  }
  void fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
    body,
    keepalive: true,
    mode: 'cors',
    credentials: 'omit',
  });
}

function track(
  siteId: string,
  endpoint: string,
  eventType: TrackEventType,
  extraUrl?: string,
): void {
  if (!siteId) return;
  send(endpoint, {
    siteId,
    eventType,
    url: extraUrl || location.href,
    referrer: document.referrer || '',
    screenWidth: screen.width || 0,
    timestamp: Date.now(),
    visitorId: visitorId(),
  });
}

function boot(): void {
  const { siteId, endpoint } = readConfig();
  if (!siteId) return;

  track(siteId, endpoint, 'pageview');

  // SPA: hook history API lightly
  const wrap = (fn: typeof history.pushState) =>
    function (this: History, ...args: Parameters<typeof history.pushState>) {
      const ret = fn.apply(this, args);
      track(siteId, endpoint, 'pageview');
      return ret;
    };
  history.pushState = wrap(history.pushState);
  history.replaceState = wrap(history.replaceState);
  addEventListener('popstate', () => track(siteId, endpoint, 'pageview'));

  (window as Window & {
    kestrel?: {
      track: (type: TrackEventType, url?: string) => void;
      version: string;
    };
  }).kestrel = {
    track: (type, url) => track(siteId, endpoint, type, url),
    version: VERSION,
  };
}

boot();

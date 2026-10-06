type VisitCounts = {
  site_pv: number;
  page_pv: number;
  site_uv: number;
  page_uv: number;
};

const VERSION = __KESTREL_VERSION__;
const COUNT_KEYS = ['site_pv', 'page_pv', 'site_uv', 'page_uv'] as const;

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

function paint(counts: VisitCounts): void {
  for (const key of COUNT_KEYS) {
    const value = document.getElementById(`kestrel_value_${key}`);
    if (value) value.textContent = String(counts[key] ?? 0);
    const box = document.getElementById(`kestrel_container_${key}`);
    if (box) box.style.display = 'inline';
  }
}

function countsUrl(endpoint: string, siteId: string): string {
  const url = new URL(endpoint, location.href);
  url.searchParams.set('siteId', siteId);
  url.searchParams.set('path', location.pathname + location.search);
  return url.toString();
}

/** Read the four integers. This request must not be treated as a page view. */
function show(siteId: string, endpoint: string): void {
  if (!siteId) return;
  void fetch(countsUrl(endpoint, siteId), {
    method: 'GET',
    mode: 'cors',
    credentials: 'omit',
  })
    .then(async (res) => {
      if (!res.ok) return;
      paint((await res.json()) as VisitCounts);
    })
    .catch(() => undefined);
}

function boot(): void {
  const { siteId, endpoint } = readConfig();
  if (!siteId) return;
  show(siteId, endpoint);
  (window as Window & {
    kestrel?: { track: () => void; version: string };
  }).kestrel = {
    track: () => show(siteId, endpoint),
    version: VERSION,
  };
}

boot();

export type TrafficSource =
  | 'direct'
  | 'search'
  | 'social'
  | 'email'
  | 'referral'
  | 'unknown';

const SEARCH_HOSTS = [
  'google.',
  'bing.',
  'yahoo.',
  'baidu.',
  'duckduckgo.',
  'yandex.',
  'sogou.',
  'so.com',
];

const SOCIAL_HOSTS = [
  'twitter.',
  'x.com',
  'facebook.',
  'fb.com',
  'linkedin.',
  'instagram.',
  't.co',
  'weibo.',
  'zhihu.',
  'reddit.',
  'tiktok.',
  'youtube.',
  'douyin.',
];

function hostOf(raw: string): string {
  if (!raw) return '';
  try {
    return new URL(raw).hostname.toLowerCase();
  } catch {
    return '';
  }
}

export function referrerHost(referrer: string): string {
  return hostOf(referrer);
}

export function classifySource(
  referrer: string,
  pageUrl: string,
): TrafficSource {
  const refHost = hostOf(referrer);
  if (!refHost) return 'direct';

  const pageHost = hostOf(pageUrl);
  if (pageHost && refHost === pageHost) return 'direct';

  if (SEARCH_HOSTS.some((h) => refHost.includes(h))) return 'search';
  if (SOCIAL_HOSTS.some((h) => refHost.includes(h))) return 'social';
  if (refHost.includes('mail.') || refHost.includes('outlook.')) return 'email';
  return 'referral';
}

export function pagePath(url: string): string {
  try {
    const u = new URL(url);
    return (u.pathname || '/') + (u.search || '');
  } catch {
    return url.slice(0, 256) || '/';
  }
}

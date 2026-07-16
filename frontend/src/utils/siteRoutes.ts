import { ALL_SITES_ID, isAllSites } from '../constants/sites';

/** Analysis tab path segments (empty = overview). */
export type AnalysisPage =
  | ''
  | 'behavior'
  | 'sources'
  | 'pages'
  | 'devices'
  | 'map'
  | 'trends';

const ANALYSIS_SET = new Set<string>([
  '',
  'behavior',
  'sources',
  'pages',
  'devices',
  'map',
  'trends',
]);

export function isAnalysisPage(page: string): page is AnalysisPage {
  return ANALYSIS_SET.has(page);
}

/** Build href for a site + analysis tab. */
export function siteHref(siteId: string, page: AnalysisPage | string = ''): string {
  const seg = page.replace(/^\//, '');
  if (isAllSites(siteId)) {
    return seg ? `/${seg}` : '/';
  }
  const id = encodeURIComponent(siteId);
  return seg ? `/s/${id}/${seg}` : `/s/${id}`;
}

export type ParsedSiteLocation = {
  /** null when on admin pages that don't encode a site */
  siteId: string | null;
  page: string;
  admin: boolean;
};

/** Parse site context from the current pathname. */
export function parseSiteLocation(pathname: string): ParsedSiteLocation {
  if (pathname === '/sites' || pathname === '/settings') {
    return { siteId: null, page: pathname.slice(1), admin: true };
  }

  const nested = pathname.match(/^\/s\/([^/]+)(?:\/(.*))?$/);
  if (nested) {
    const siteId = decodeURIComponent(nested[1]!);
    const page = nested[2] ?? '';
    return { siteId, page, admin: false };
  }

  const bare = pathname === '/' ? '' : pathname.replace(/^\//, '');
  return { siteId: ALL_SITES_ID, page: bare, admin: false };
}

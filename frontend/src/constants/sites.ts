/** Sentinel site id for the workspace-wide default board. */
export const ALL_SITES_ID = '__all__';

export function isAllSites(siteId: string | null | undefined): boolean {
  return siteId === ALL_SITES_ID;
}

export const ALL_SITES_LABEL = '默认看板';
export const ALL_SITES_DESC = '全部站点';

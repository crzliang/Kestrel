/** Sentinel site id for the workspace-wide site overview. */
export const ALL_SITES_ID = '__all__';

export function isAllSites(siteId: string | null | undefined): boolean {
  return siteId === ALL_SITES_ID;
}

export const ALL_SITES_LABEL = '站点总览';
export const ALL_SITES_DESC = '全部站点汇总';

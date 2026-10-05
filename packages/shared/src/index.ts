import { z } from 'zod';

const kvToken = /^[A-Za-z0-9_]+$/;

/** Public read of the four counters. This schema never accepts a visitor id or a page URL. */
export const CountQuerySchema = z.object({
  siteId: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(kvToken)
    .transform((value) => value.toLowerCase()),
  path: z.string().max(2048).optional(),
});

export type CountQuery = z.infer<typeof CountQuerySchema>;

export const TRACK_POST_ERROR = 'not_counted';

/** Shown when a client still POSTs the old busuanzi-style payload. */
export const TRACK_POST_MESSAGE =
  'POST /v1/track 不会增加 PV/UV，请求体里的 url 和 visitorId 会被忽略。只有 HTML 文档请求到达本 EdgeOne 项目（根目录 middleware）且 HTTP Host 属于 sites.json 里该站点的域名时才计数。静态资源、/v1 接口和只读请求不计。读取四个整数请用 GET /v1/track?siteId=&path=。';

export const VisitCountsSchema = z.object({
  site_pv: z.number().int().nonnegative(),
  page_pv: z.number().int().nonnegative(),
  site_uv: z.number().int().nonnegative(),
  page_uv: z.number().int().nonnegative(),
});

export type VisitCounts = z.infer<typeof VisitCountsSchema>;

export {
  SiteSchema,
  SitesFileSchema,
  parseSitesConfig,
  type Site,
} from './site.js';

export {
  parseDomainAllowlist,
  domainsFromStored,
  hostnameFromUrl,
  isHostnameAllowed,
  isRequestHostAllowed,
  normalizeHostname,
  normalizeRequestHost,
  type DomainAllowlistResult,
} from './domain.js';

export {
  VISITOR_COOKIE,
  createVisitorId,
  isDocumentNavigation,
  sanitizeVisitorId,
  visitorIdFromCookie,
  visitorSetCookie,
  type DocumentSignals,
} from './visit.js';

/** Extract client geo as ISO region codes, distinguishing CN/HK/MO/TW. */

export type ClientGeo = {
  /** ISO 3166-1 alpha-2 (HK/MO/TW kept separate from mainland CN), or XX */
  country: string;
};

type EoGeo = {
  countryCodeAlpha2?: string;
  countryCodeAlpha3?: string;
  countryName?: string;
  regionName?: string;
  regionCode?: string;
};

type EoRequest = Request & {
  eo?: {
    geo?: EoGeo;
  };
};

const HEADER_CANDIDATES = [
  'eo-client-ip-country',
  'x-country-code',
  'cf-ipcountry',
  'x-vercel-ip-country',
  'x-kestrel-country', // local/smoke override
];

/** Map free-text / aliases → ISO alpha-2 for Greater China regions. */
const NAME_ALIASES: Record<string, string> = {
  CN: 'CN',
  CHN: 'CN',
  CHINA: 'CN',
  'MAINLAND CHINA': 'CN',
  'CHINA MAINLAND': 'CN',
  'PEOPLE\'S REPUBLIC OF CHINA': 'CN',
  PRC: 'CN',
  中国: 'CN',
  中国大陆: 'CN',
  大陆: 'CN',

  HK: 'HK',
  HKG: 'HK',
  'HONG KONG': 'HK',
  HONGKONG: 'HK',
  'HONG KONG (CHINA)': 'HK',
  'HONG KONG, CHINA': 'HK',
  'CHINA HONG KONG': 'HK',
  香港: 'HK',
  中国香港: 'HK',

  MO: 'MO',
  MAC: 'MO',
  MACAO: 'MO',
  MACAU: 'MO',
  'MACAO (CHINA)': 'MO',
  'MACAU (CHINA)': 'MO',
  'MACAO, CHINA': 'MO',
  'MACAU, CHINA': 'MO',
  澳门: 'MO',
  中國澳門: 'MO',
  中国澳门: 'MO',

  TW: 'TW',
  TWN: 'TW',
  TAIWAN: 'TW',
  'TAIWAN (CHINA)': 'TW',
  'TAIWAN, CHINA': 'TW',
  'CHINA TAIWAN': 'TW',
  台湾: 'TW',
  台灣: 'TW',
  中国台湾: 'TW',
  中國台灣: 'TW',
};

function lookupAlias(raw: string): string | null {
  const key = raw.trim().toUpperCase().replace(/\s+/g, ' ');
  if (!key) return null;
  if (NAME_ALIASES[key]) return NAME_ALIASES[key];
  // compact form without spaces/punctuation
  const compact = key.replace(/[\s,()]/g, '');
  if (NAME_ALIASES[compact]) return NAME_ALIASES[compact];
  return null;
}

function normalizeCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const aliased = lookupAlias(trimmed);
  if (aliased) return aliased;

  const upper = trimmed.toUpperCase();
  if (upper === 'UK') return 'GB';
  if (/^[A-Z]{2}$/.test(upper)) return upper;
  return null;
}

/** When country is CN, region fields may still point to HK / MO / TW. */
function refineGreaterChina(
  country: string,
  geo?: EoGeo | null,
): string {
  if (country === 'HK' || country === 'MO' || country === 'TW') {
    return country;
  }

  const regionBlob = [
    geo?.regionName,
    geo?.regionCode,
    geo?.countryName,
  ]
    .filter(Boolean)
    .join(' ');

  if (regionBlob) {
    const fromRegion = lookupAlias(regionBlob);
    if (fromRegion === 'HK' || fromRegion === 'MO' || fromRegion === 'TW') {
      return fromRegion;
    }
    // substring heuristics for mixed labels
    const u = regionBlob.toUpperCase();
    if (/HONG\s*KONG|香港/.test(u)) return 'HK';
    if (/MACAO|MACAU|澳门|澳門/.test(u)) return 'MO';
    if (/TAIWAN|台湾|台灣/.test(u)) return 'TW';
  }

  return country;
}

export function resolveClientGeo(request: Request): ClientGeo {
  const eoGeo = (request as EoRequest).eo?.geo;

  let code =
    normalizeCode(eoGeo?.countryCodeAlpha2) ??
    normalizeCode(eoGeo?.countryCodeAlpha3) ??
    normalizeCode(eoGeo?.countryName);

  if (!code) {
    for (const h of HEADER_CANDIDATES) {
      code = normalizeCode(request.headers.get(h) ?? undefined);
      if (code) break;
    }
  }

  if (!code) {
    return { country: 'XX' };
  }

  return { country: refineGreaterChina(code, eoGeo) };
}

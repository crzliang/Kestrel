/** Extract coarse geo (country only) — no raw IP stored. */

export type ClientGeo = {
  country: string; // ISO 3166-1 alpha-2, or XX unknown
};

type EoRequest = Request & {
  eo?: {
    geo?: {
      countryCodeAlpha2?: string;
      countryCodeAlpha3?: string;
    };
  };
};

const HEADER_CANDIDATES = [
  'eo-client-ip-country',
  'x-country-code',
  'cf-ipcountry',
  'x-vercel-ip-country',
  'x-kestrel-country', // local/smoke override
];

export function resolveClientGeo(request: Request): ClientGeo {
  const eo = (request as EoRequest).eo?.geo?.countryCodeAlpha2;
  if (eo && /^[A-Za-z]{2}$/.test(eo)) {
    return { country: eo.toUpperCase() };
  }

  for (const h of HEADER_CANDIDATES) {
    const v = request.headers.get(h);
    if (v && /^[A-Za-z]{2}$/.test(v.trim())) {
      return { country: v.trim().toUpperCase() };
    }
  }

  return { country: 'XX' };
}

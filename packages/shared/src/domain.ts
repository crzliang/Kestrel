import { z } from 'zod';

const MAX_DOMAINS = 32;
const TOKEN_SPLIT = /[\s,，;；]+/;

export type DomainAllowlistResult =
  | { ok: true; domains: string[] }
  | { ok: false; message: string };

/** Bare hostname: lowercase, no trailing dot, no port, scheme, or path. */
export function normalizeHostname(input: string): string | null {
  let host = input.trim().toLowerCase();
  if (!host) return null;
  host = host.replace(/\.+$/g, '');
  if (!host || host.length > 253) return null;
  if (
    host.includes('://') ||
    host.includes('/') ||
    host.includes(':') ||
    host.includes('*') ||
    host.includes('?') ||
    host.includes('#') ||
    host.includes('@') ||
    /\s/.test(host)
  ) {
    return null;
  }
  const labels = host.split('.');
  const ok = labels.every((label) => {
    if (label.length < 1 || label.length > 63) return false;
    if (label.startsWith('-') || label.endsWith('-')) return false;
    return /^[a-z0-9-]+$/.test(label);
  });
  return ok ? host : null;
}

function splitTokens(value: string): string[] {
  return value
    .split(TOKEN_SPLIT)
    .map((part) => part.trim())
    .filter(Boolean);
}

function collectTokens(value: string | readonly string[]): string[] {
  if (typeof value === 'string') return splitTokens(value);
  return value.flatMap((item) => splitTokens(item));
}

/**
 * Strict allowlist parse for create/update.
 * Empty input is a valid empty list. Any token that is not a bare hostname fails.
 */
export function parseDomainAllowlist(value: unknown): DomainAllowlistResult {
  if (typeof value !== 'string' && !Array.isArray(value)) {
    return { ok: false, message: '域名白名单格式无效' };
  }
  if (Array.isArray(value) && value.some((item) => typeof item !== 'string')) {
    return { ok: false, message: '域名白名单格式无效' };
  }
  const tokens = collectTokens(value as string | readonly string[]);
  const domains: string[] = [];
  for (const token of tokens) {
    const host = normalizeHostname(token);
    if (!host) {
      const shown = token.length > 80 ? `${token.slice(0, 80)}…` : token;
      return {
        ok: false,
        message: `无效主机名：${shown}。只填写主机名，不要带协议、路径、端口或通配符`,
      };
    }
    if (!domains.includes(host)) domains.push(host);
  }
  if (domains.length > MAX_DOMAINS) {
    return { ok: false, message: `最多 ${MAX_DOMAINS} 个主机名` };
  }
  return { ok: true, domains };
}

/** Hostname of an absolute URL. Port is ignored; trailing dots are removed. */
export function hostnameFromUrl(input: string): string | null {
  try {
    const url = new URL(input);
    return normalizeHostname(url.hostname);
  } catch {
    return null;
  }
}

function salvageToken(token: string): string | null {
  const bare = normalizeHostname(token);
  if (bare) return bare;
  if (!token.includes('://')) return null;
  return hostnameFromUrl(token.trim());
}

/** Read a stored allowlist. Legacy single strings and URL-shaped values are coerced. */
export function domainsFromStored(value: unknown): string[] {
  if (typeof value !== 'string' && !Array.isArray(value)) return [];
  if (Array.isArray(value) && value.some((item) => typeof item !== 'string')) {
    return [];
  }
  const domains: string[] = [];
  for (const token of collectTokens(value as string | readonly string[])) {
    const host = salvageToken(token);
    if (host && !domains.includes(host)) domains.push(host);
    if (domains.length >= MAX_DOMAINS) break;
  }
  return domains;
}

/** Exact hostname match. An empty allowlist rejects every URL. */
export function isHostnameAllowed(url: string, allowlist: unknown): boolean {
  const domains = domainsFromStored(allowlist);
  if (domains.length === 0) return false;
  const host = hostnameFromUrl(url);
  return host !== null && domains.includes(host);
}

/**
 * Host header or URL host: lowercase, no trailing dot, port ignored.
 * A full URL is reduced to its hostname so a scheme cannot sneak into the comparison.
 */
export function normalizeRequestHost(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  const candidate = raw.includes('://') ? raw : `http://${raw}`;
  try {
    return normalizeHostname(new URL(candidate).hostname);
  } catch {
    return normalizeHostname(raw);
  }
}

/** Exact match of the request Host against a site allowlist. Empty allowlist matches nothing. */
export function isRequestHostAllowed(host: string, allowlist: unknown): boolean {
  const domains = domainsFromStored(allowlist);
  if (domains.length === 0) return false;
  const normalized = normalizeRequestHost(host);
  return normalized !== null && domains.includes(normalized);
}

export const DomainListField = z
  .union([z.string().max(16_000), z.array(z.string().max(300)).max(MAX_DOMAINS)])
  .transform((value, ctx) => {
    const parsed = parseDomainAllowlist(value);
    if (!parsed.ok) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: parsed.message,
      });
      return z.NEVER;
    }
    return parsed.domains;
  });

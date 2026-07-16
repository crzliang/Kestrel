/** Generate a RFC 4122 UUID for site / data-site. */
export function newSiteUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Extremely old environments — still produce UUID-shaped id.
  const hex = Array.from({ length: 32 }, () =>
    Math.floor(Math.random() * 16).toString(16),
  ).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`;
}

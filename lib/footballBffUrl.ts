/** Loopback BFF. Local `expo start` / the EAS development profile. Not used by release builds. */
export const LOCAL_FOOTBALL_BFF_URL = 'http://127.0.0.1:8787';

/**
 * Committed stand-in for `eas.json` preview/production.
 * Not a live host — replace `<account>` with the subdomain `wrangler deploy` prints.
 */
export const PROD_FOOTBALL_BFF_URL_PLACEHOLDER = 'https://kickfeed-football-bff.<account>.workers.dev';

const UNRESOLVED_BFF_URL = /<account>|<subdomain>|YOUR_ACCOUNT|YOUR_SUBDOMAIN/i;

export function isUnresolvedFootballBffUrl(raw: string): boolean {
  return UNRESOLVED_BFF_URL.test(raw);
}

/** Trim, drop a trailing slash, and ignore the unreplaced workers.dev placeholder. */
export function normalizeFootballBffUrl(raw: string | null | undefined): string | undefined {
  const trimmed = raw?.trim() ?? '';
  if (!trimmed || isUnresolvedFootballBffUrl(trimmed)) return undefined;
  return trimmed.replace(/\/+$/, '');
}

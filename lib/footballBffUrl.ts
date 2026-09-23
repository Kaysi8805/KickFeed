/** Loopback BFF. Local `expo start` / the EAS development profile. Not used by release builds. */
export const LOCAL_FOOTBALL_BFF_URL = 'http://127.0.0.1:8787';

/**
 * Live Worker used by EAS preview and production.
 * Not a secret. An EAS plaintext env var with the same name still overrides it.
 */
export const RELEASE_FOOTBALL_BFF_URL = 'https://kickfeed-football-bff.kaysi8805.workers.dev';

/**
 * Unreplaced stand-in. If this string is still in an env var, treat the BFF as unset
 * so the app stays on mocks instead of calling a host that does not exist.
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

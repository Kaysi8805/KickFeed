/**
 * KickFeed live API-Football coverage (free-tier allowlist).
 * BFF, live adapter, and honesty copy all read this so league ids stay in one place.
 *
 * IDs are API-Football v3 (stable across seasons). FA Cup / other cups are skipped
 * so the ~100 req/day budget stays on domestic league scores.
 */

export const PREMIER_LEAGUE_ID = '39';
export const CHAMPIONSHIP_ID = '40';
/** Slovakia Super Liga / Niké Liga. */
export const SLOVAK_SUPER_LIGA_ID = '332';
/**
 * Spain La Liga (not Bundesliga). Chosen over Bundesliga because KickFeed already
 * has a featured La Liga mock tree (club colors + aliases), and its weekend
 * kickoffs complement England rather than stacking another Saturday 15:30 CET block.
 */
export const LA_LIGA_ID = '140';

export const ENGLAND_LEAGUE_IDS = [PREMIER_LEAGUE_ID, CHAMPIONSHIP_ID] as const;

export const LIVE_LEAGUE_IDS = [
  PREMIER_LEAGUE_ID,
  CHAMPIONSHIP_ID,
  SLOVAK_SUPER_LIGA_ID,
  LA_LIGA_ID,
] as const;

export type LiveLeagueId = (typeof LIVE_LEAGUE_IDS)[number];

export const LIVE_LEAGUE_COUNTRY: Record<LiveLeagueId, string> = {
  [PREMIER_LEAGUE_ID]: 'eng',
  [CHAMPIONSHIP_ID]: 'eng',
  [SLOVAK_SUPER_LIGA_ID]: 'svk',
  [LA_LIGA_ID]: 'esp',
};

export const LIVE_COUNTRY_IDS = ['eng', 'svk', 'esp'] as const;

/** Mock catalog ids that alias onto live league ids. */
export const MOCK_LIVE_LEAGUE_ALIASES = ['epl', 'laliga', 'nikeliga'] as const;

/** Hidden on the live path so we don’t list both `epl` and `39`. FA Cup stays skipped (quota). */
export const MOCK_IDS_HIDDEN_WHEN_LIVE = ['epl', 'facup', 'laliga', 'nikeliga'] as const;

export const LIVE_GEO_LABEL = 'England · Slovakia · La Liga';
export const LIVE_GEO_SHORT = 'England, Slovakia & La Liga';

export const API_FOOTBALL_DAILY_LIMIT = 100;

export const LIVE_LEAGUE_META: ReadonlyArray<{
  id: LiveLeagueId;
  name: string;
  countryId: string;
}> = [
  { id: PREMIER_LEAGUE_ID, name: 'Premier League', countryId: 'eng' },
  { id: CHAMPIONSHIP_ID, name: 'Championship', countryId: 'eng' },
  { id: SLOVAK_SUPER_LIGA_ID, name: 'Niké Liga', countryId: 'svk' },
  { id: LA_LIGA_ID, name: 'La Liga', countryId: 'esp' },
];

const LIVE_LEAGUE_ID_SET = new Set<string>(LIVE_LEAGUE_IDS);
const LIVE_COUNTRY_ID_SET = new Set<string>(LIVE_COUNTRY_IDS);

export function isLiveLeagueId(id: string): boolean {
  return LIVE_LEAGUE_ID_SET.has(id);
}

export function isLiveCountryId(id: string): boolean {
  return LIVE_COUNTRY_ID_SET.has(id);
}

export function isEnglandLiveLeagueId(id: string): boolean {
  return id === PREMIER_LEAGUE_ID || id === CHAMPIONSHIP_ID;
}

export function countryIdForLiveLeague(leagueId: string): string | undefined {
  return LIVE_LEAGUE_COUNTRY[leagueId as LiveLeagueId];
}

export function liveLeagueName(leagueId: string): string {
  return LIVE_LEAGUE_META.find((row) => row.id === leagueId)?.name ?? leagueId;
}

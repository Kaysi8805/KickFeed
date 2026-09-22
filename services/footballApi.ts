/** API-Football (api-sports.io) v3 shapes used by the live adapter. */

export const API_FOOTBALL_BASE = 'https://v3.football.api-sports.io';
export const API_FOOTBALL_SIGNUP = 'https://dashboard.api-football.com/register';
export const API_FOOTBALL_DOCS = 'https://www.api-football.com/documentation-v3';

export {
  CHAMPIONSHIP_ID,
  ENGLAND_LEAGUE_IDS,
  LA_LIGA_ID,
  LIVE_LEAGUE_IDS,
  PREMIER_LEAGUE_ID,
  SLOVAK_SUPER_LIGA_ID,
} from '@/lib/footballCoverage';

export interface ApiEnvelope<T> {
  get?: string;
  errors?: unknown;
  results?: number;
  paging?: { current?: number; total?: number };
  response?: T;
}

export interface ApiTeamRef {
  id: number;
  name: string;
  logo?: string | null;
  code?: string | null;
  country?: string | null;
  winner?: boolean | null;
}

export interface ApiFixture {
  fixture: {
    id: number;
    date: string;
    timestamp?: number;
    referee?: string | null;
    venue?: { id?: number | null; name?: string | null; city?: string | null } | null;
    status: { long?: string | null; short?: string | null; elapsed?: number | null; extra?: number | null };
  };
  league: {
    id: number;
    name: string;
    country?: string | null;
    season?: number;
    round?: string | null;
  };
  teams: { home: ApiTeamRef; away: ApiTeamRef };
  goals: { home: number | null; away: number | null };
  score?: {
    halftime?: { home: number | null; away: number | null };
    fulltime?: { home: number | null; away: number | null };
  };
}

export interface ApiStandingRow {
  rank: number;
  team: ApiTeamRef;
  points: number;
  goalsDiff?: number;
  form?: string | null;
  all: {
    played: number;
    win: number;
    draw: number;
    lose: number;
    goals: { for: number; against: number };
  };
}

export interface ApiStandingsResponse {
  league: {
    id: number;
    name: string;
    season?: number;
    standings: ApiStandingRow[][];
  };
}

export interface ApiTeamResponse {
  team: ApiTeamRef & { code?: string | null; country?: string | null };
  venue?: { name?: string | null } | null;
}

export interface ApiSquadPlayer {
  id: number;
  name: string;
  age?: number | null;
  number?: number | null;
  position?: string | null;
  photo?: string | null;
}

export interface ApiSquadResponse {
  team: ApiTeamRef;
  players: ApiSquadPlayer[];
}

export interface ApiEvent {
  time: { elapsed: number | null; extra?: number | null };
  team: ApiTeamRef;
  player: { id: number | null; name: string | null };
  assist?: { id: number | null; name: string | null } | null;
  type: string;
  detail?: string | null;
}

export interface ApiLineupPlayer {
  player: { id: number; name: string; number?: number | null; pos?: string | null };
}

export interface ApiLineup {
  team: ApiTeamRef;
  formation?: string | null;
  coach?: { id?: number | null; name?: string | null; photo?: string | null } | null;
  startXI?: ApiLineupPlayer[];
  substitutes?: ApiLineupPlayer[];
}

export interface ApiSideCount {
  home?: number | null;
  away?: number | null;
  total?: number | null;
}

export interface ApiSideAverage {
  home?: string | number | null;
  away?: string | number | null;
  total?: string | number | null;
}

/**
 * `GET /teams/statistics?league=&season=&team=` body.
 * The upstream `response` is one object, not an array.
 * Shots and possession are not on this endpoint.
 */
export interface ApiTeamStatistics {
  league?: { id?: number | null; season?: number | null; name?: string | null } | null;
  team?: {
    id?: number | null;
    name?: string | null;
    venue?: { name?: string | null; city?: string | null } | null;
  } | null;
  form?: string | null;
  fixtures?: {
    played?: ApiSideCount | null;
    wins?: ApiSideCount | null;
    draws?: ApiSideCount | null;
    loses?: ApiSideCount | null;
  } | null;
  goals?: {
    for?: { total?: ApiSideCount | null; average?: ApiSideAverage | null } | null;
    against?: { total?: ApiSideCount | null; average?: ApiSideAverage | null } | null;
  } | null;
  clean_sheet?: ApiSideCount | null;
  failed_to_score?: ApiSideCount | null;
  lineups?: Array<{ formation?: string | null; played?: number | null }> | null;
  coach?: { id?: number | null; name?: string | null } | null;
}

export interface ApiPlayerStatistic {
  team: ApiTeamRef;
  league?: { id?: number; name?: string | null; season?: number | null };
  games?: { appearences?: number | null; appearances?: number | null; minutes?: number | null; rating?: string | null };
  goals?: { total?: number | null; assists?: number | null };
  cards?: { yellow?: number | null; red?: number | null };
}

export interface ApiScorer {
  player: { id: number; name: string; nationality?: string | null; photo?: string | null };
  statistics: ApiPlayerStatistic[];
}

/** `GET /players?id=&season=` row. Statistics may span several competitions in that season. */
export interface ApiPlayerSeason {
  player: { id: number; name: string; nationality?: string | null; age?: number | null };
  statistics: ApiPlayerStatistic[];
}

export type FootballQuery = Record<string, string | number | undefined>;

export type FootballHttp = (path: string, params?: FootballQuery) => Promise<unknown>;

export function footballApiKeyFromEnv(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): string | undefined {
  const key = env.EXPO_PUBLIC_FOOTBALL_API_KEY?.trim();
  return key || undefined;
}

/** Optional BFF base URL (no trailing slash). When set, the live adapter talks here instead of API-Football. */
export function footballBffUrlFromEnv(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): string | undefined {
  const raw = env.EXPO_PUBLIC_FOOTBALL_BFF_URL?.trim();
  if (!raw) return undefined;
  return raw.replace(/\/+$/, '');
}

export type FootballHttpOptions = {
  apiKey?: string;
  bffUrl?: string;
  fetchImpl?: typeof fetch;
};

export function footballSeasonFromEnv(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
  now = new Date(),
): number {
  const raw = env.EXPO_PUBLIC_FOOTBALL_SEASON?.trim();
  if (raw && /^\d{4}$/.test(raw)) return Number(raw);
  return europeanSeasonYear(now);
}

/** European domestic season label is the year it starts (Aug 2026 → 2026). */
export function europeanSeasonYear(now = new Date()): number {
  const year = now.getUTCFullYear();
  return now.getUTCMonth() >= 6 ? year : year - 1;
}

export function isoDateUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function fixtureDateWindow(now = new Date(), backDays = 14, aheadDays = 21): { from: string; to: string } {
  const from = new Date(now);
  from.setUTCDate(from.getUTCDate() - backDays);
  const to = new Date(now);
  to.setUTCDate(to.getUTCDate() + aheadDays);
  return { from: isoDateUtc(from), to: isoDateUtc(to) };
}

export function describeApiErrors(errors: unknown): string | null {
  if (errors == null) return null;
  if (Array.isArray(errors)) {
    if (!errors.length) return null;
    return errors.map((e) => String(e)).join('; ');
  }
  if (typeof errors === 'string') return errors.trim() || null;
  if (typeof errors === 'object') {
    const vals = Object.values(errors as Record<string, unknown>).filter((v) => v != null && String(v).trim());
    return vals.length ? vals.map((v) => String(v)).join('; ') : null;
  }
  return null;
}

export function createApiFootballHttp(
  apiKeyOrOpts: string | FootballHttpOptions = '',
  fetchImpl: typeof fetch = fetch,
): FootballHttp {
  const opts: FootballHttpOptions =
    typeof apiKeyOrOpts === 'string' ? { apiKey: apiKeyOrOpts, fetchImpl } : { fetchImpl, ...apiKeyOrOpts };
  const doFetch = opts.fetchImpl ?? fetchImpl;
  const bffUrl = opts.bffUrl?.trim().replace(/\/+$/, '') || undefined;
  const apiKey = opts.apiKey?.trim() ?? '';
  const base = `${bffUrl ?? API_FOOTBALL_BASE}/`;

  return async (path, params) => {
    const url = new URL(path.replace(/^\//, ''), base);
    for (const [key, value] of Object.entries(params ?? {})) {
      if (value == null || value === '') continue;
      url.searchParams.set(key, String(value));
    }
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (!bffUrl) headers['x-apisports-key'] = apiKey;
    const res = await doFetch(url.toString(), { method: 'GET', headers });
    let json: ApiEnvelope<unknown> | undefined;
    try {
      json = (await res.json()) as ApiEnvelope<unknown>;
    } catch {
      json = undefined;
    }
    const apiErr = describeApiErrors(json?.errors);
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        bffUrl
          ? 'Football BFF rejected the request (check FOOTBALL_API_KEY on the server).'
          : 'API-Football rejected the key (check EXPO_PUBLIC_FOOTBALL_API_KEY).',
      );
    }
    if (res.status === 429) {
      throw new Error('API-Football rate limit hit. KickFeed will reuse cache and retry later.');
    }
    if (!res.ok) {
      throw new Error(apiErr || (bffUrl ? `Football BFF HTTP ${res.status}` : `API-Football HTTP ${res.status}`));
    }
    if (apiErr) throw new Error(apiErr);
    return json?.response ?? [];
  };
}

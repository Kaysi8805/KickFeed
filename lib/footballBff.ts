/**
 * Thin API-Football BFF: allowlisted GET proxy + TTL cache.
 * Cloudflare Worker and the local Node server call this Fetch handler.
 * The Expo app does not import this module at runtime.
 */
import {
  API_FOOTBALL_DAILY_LIMIT,
  LIVE_LEAGUE_IDS,
  LIVE_LEAGUE_META,
  isLiveLeagueId,
} from './footballCoverage';
import { TtlCache } from './ttlCache';

export const API_FOOTBALL_ORIGIN = 'https://v3.football.api-sports.io';

export const BFF_ALLOWED_PATHS = [
  '/fixtures',
  '/standings',
  '/players',
  '/players/topscorers',
  '/players/squads',
  '/fixtures/events',
  '/fixtures/lineups',
  '/teams/statistics',
] as const;

/** Paths that must carry an allowlisted `league` query so random competitions cannot burn quota. */
export const BFF_LEAGUE_SCOPED_PATHS = ['/fixtures', '/standings', '/players/topscorers', '/teams/statistics'] as const;

export const BFF_ALLOWED_LEAGUE_IDS = LIVE_LEAGUE_IDS;

export const BFF_TTL_MS = {
  fixturesLive: 45_000,
  fixturesIdle: 5 * 60_000,
  standings: 15 * 60_000,
  scorers: 30 * 60_000,
  squads: 30 * 60_000,
  events: 60_000,
  lineups: 60_000,
  /** `GET /players?id=&season=` — long TTL so a player open does not burn the daily quota. */
  players: 12 * 60 * 60_000,
  /** `GET /teams/statistics?league=&season=&team=` — one origin read per club per day. */
  teamStats: 24 * 60 * 60_000,
} as const;

/**
 * Per-isolate cap. Cloudflare Workers free tier is ~128MB and this map is not
 * shared across isolates (no KV). Eviction prefers stale rows, then long-lived
 * fresh rows, so live fixture TTLs survive a full player/stats browse.
 */
export const BFF_CACHE_LIMITS = {
  maxEntries: 128,
  /** How long a 429/5xx may still reuse a body after its TTL. */
  maxStaleMs: 6 * 60 * 60_000,
} as const;

export type BffQuotaSnapshot = {
  /** Last `x-ratelimit-requests-limit` seen by this isolate. */
  limit: number | null;
  /** Last `x-ratelimit-requests-remaining` (daily) seen by this isolate. */
  remaining: number | null;
  perMinuteLimit: number | null;
  perMinuteRemaining: number | null;
  observedAt: number | null;
};

export function emptyBffQuota(): BffQuotaSnapshot {
  return {
    limit: null,
    remaining: null,
    perMinuteLimit: null,
    perMinuteRemaining: null,
    observedAt: null,
  };
}

export function createFootballBffCache(): TtlCache<string> {
  return new TtlCache<string>({
    maxEntries: BFF_CACHE_LIMITS.maxEntries,
    maxStaleMs: BFF_CACHE_LIMITS.maxStaleMs,
  });
}

const LIVE_FIXTURE_SHORT = new Set(['1H', '2H', 'ET', 'BT', 'P', 'LIVE', 'INT', 'SUSP', 'HT']);

export type FootballBffEnv = {
  apiKey: string;
  fetchImpl?: typeof fetch;
  cache?: TtlCache<string>;
  now?: () => number;
  origin?: string;
  inflight?: Map<string, Promise<UpstreamFetch>>;
  /** Mutable. Defaults to this isolate’s snapshot. Tests can pass their own. */
  quota?: BffQuotaSnapshot;
};

/**
 * Public read API: no cookies, no client API key.
 * `*` is safe only because `Access-Control-Allow-Credentials` is never set.
 * `x-apisports-key` is intentionally not an allowed request header.
 */
const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Accept, Content-Type',
  'Access-Control-Max-Age': '86400',
  'Access-Control-Expose-Headers': 'X-KickFeed-Cache, Cache-Control',
};

type UpstreamFetch = { ok: true; status: number; text: string } | { ok: false; status: number; message: string };

export function normalizeBffPath(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, '') || '/';
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

export function isAllowedBffPath(pathname: string): boolean {
  return (BFF_ALLOWED_PATHS as readonly string[]).includes(normalizeBffPath(pathname));
}

export function isLeagueScopedBffPath(pathname: string): boolean {
  return (BFF_LEAGUE_SCOPED_PATHS as readonly string[]).includes(normalizeBffPath(pathname));
}

export function bffAllowsLeagueParam(league: string | null | undefined): boolean {
  const id = league?.trim() ?? '';
  return id.length > 0 && isLiveLeagueId(id);
}

/**
 * `/players` is allowlisted only as a single-player season read.
 * League-wide, team, search, or page queries would fan out and burn the free tier.
 */
export function bffPlayerSeasonQueryError(params: URLSearchParams): string | null {
  const id = params.get('id')?.trim() ?? '';
  const season = params.get('season')?.trim() ?? '';
  if (!/^[1-9]\d*$/.test(id)) return 'players requires a numeric id';
  if (!/^\d{4}$/.test(season)) return 'players requires a season year';
  for (const key of params.keys()) {
    if (key !== 'id' && key !== 'season') return 'players only allows id and season';
  }
  return null;
}

/**
 * `/teams/statistics` is one club in one covered league.
 * Extra keys (`date`, `page`, a second team) would multiply origin calls.
 */
export function bffTeamStatisticsQueryError(params: URLSearchParams): string | null {
  const league = params.get('league')?.trim() ?? '';
  const season = params.get('season')?.trim() ?? '';
  const team = params.get('team')?.trim() ?? '';
  if (!isLiveLeagueId(league)) return 'teams/statistics requires a covered league';
  if (!/^\d{4}$/.test(season)) return 'teams/statistics requires a season year';
  if (!/^[1-9]\d*$/.test(team)) return 'teams/statistics requires a numeric team';
  for (const key of params.keys()) {
    if (key !== 'league' && key !== 'season' && key !== 'team') {
      return 'teams/statistics only allows league, season, and team';
    }
  }
  return null;
}

export function bffTtlMsForPath(pathname: string): number {
  switch (normalizeBffPath(pathname)) {
    case '/fixtures':
      return BFF_TTL_MS.fixturesIdle;
    case '/standings':
      return BFF_TTL_MS.standings;
    case '/players':
      return BFF_TTL_MS.players;
    case '/players/topscorers':
      return BFF_TTL_MS.scorers;
    case '/players/squads':
      return BFF_TTL_MS.squads;
    case '/fixtures/events':
      return BFF_TTL_MS.events;
    case '/fixtures/lineups':
      return BFF_TTL_MS.lineups;
    case '/teams/statistics':
      return BFF_TTL_MS.teamStats;
    default:
      return BFF_TTL_MS.fixturesIdle;
  }
}

export function fixturesEnvelopeHasLive(body: string): boolean {
  try {
    const json = JSON.parse(body) as { response?: Array<{ fixture?: { status?: { short?: string | null } } }> };
    const rows = Array.isArray(json.response) ? json.response : [];
    return rows.some((row) => LIVE_FIXTURE_SHORT.has((row.fixture?.status?.short ?? '').toUpperCase()));
  } catch {
    return false;
  }
}

export function bffTtlMsForResponse(pathname: string, body: string): number {
  if (normalizeBffPath(pathname) === '/fixtures') {
    return fixturesEnvelopeHasLive(body) ? BFF_TTL_MS.fixturesLive : BFF_TTL_MS.fixturesIdle;
  }
  return bffTtlMsForPath(pathname);
}

function jsonResponse(status: number, body: unknown, extra?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...CORS,
      ...extra,
    },
  });
}

function cacheControlFor(ttlMs: number, hit: 'HIT' | 'MISS' | 'BYPASS' | 'STALE'): string {
  if (hit === 'BYPASS' || hit === 'STALE') return 'no-store';
  return `public, max-age=${Math.max(1, Math.floor(ttlMs / 1000))}`;
}

function cacheHeaders(ttlMs: number, hit: 'HIT' | 'MISS' | 'BYPASS' | 'STALE'): Record<string, string> {
  return {
    'X-KickFeed-Cache': hit,
    'Cache-Control': cacheControlFor(ttlMs, hit),
    'X-Content-Type-Options': 'nosniff',
  };
}

function envelopeResponse(text: string, ttlMs: number, hit: 'HIT' | 'MISS' | 'STALE'): Response {
  return new Response(text, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...CORS,
      ...cacheHeaders(ttlMs, hit),
    },
  });
}

function healthBody(cacheSize: number, keyConfigured: boolean, quota: BffQuotaSnapshot) {
  return {
    ok: true,
    service: 'kickfeed-football-bff',
    keyConfigured,
    coverage: {
      leagues: LIVE_LEAGUE_META.map((row) => ({
        id: row.id,
        name: row.name,
        country: row.countryId,
      })),
    },
    ttlMs: BFF_TTL_MS,
    cacheEntries: cacheSize,
    cache: {
      entries: cacheSize,
      maxEntries: BFF_CACHE_LIMITS.maxEntries,
      maxStaleMs: BFF_CACHE_LIMITS.maxStaleMs,
      scope: 'isolate',
      note: 'In-memory only, per Cloudflare isolate (one Node process locally). Isolates do not share this map. A cold isolate misses and calls API-Football. KV is not used.',
    },
    quota: {
      dailyLimit: API_FOOTBALL_DAILY_LIMIT,
      limit: quota.limit,
      remaining: quota.remaining,
      perMinuteLimit: quota.perMinuteLimit,
      perMinuteRemaining: quota.perMinuteRemaining,
      observedAt: quota.observedAt,
      note: 'Allowlisted leagues only. Fixtures 45s if any row is live, else 5 min. Standings 15 min. Player season 12h (id + season only). Team statistics 24h (league + season + team only, one club per day). 429/5xx reuse stale cache within 6h. limit/remaining are the last API-Football rate-limit headers seen by this isolate, not a global counter. Never put FOOTBALL_API_KEY in Expo or CI.',
    },
  };
}

/** Stable cache key so `league`/`season` order cannot double-spend the daily quota. */
export function canonicalBffSearch(params: URLSearchParams): string {
  const entries = [...params.entries()].filter(([, value]) => value !== '');
  entries.sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])));
  return new URLSearchParams(entries).toString();
}

function headerInt(headers: Headers, name: string): number | null {
  const raw = headers.get(name)?.trim() ?? '';
  if (!/^\d+$/.test(raw)) return null;
  return Number(raw);
}

function noteQuota(headers: Headers, quota: BffQuotaSnapshot, now: number): void {
  const limit = headerInt(headers, 'x-ratelimit-requests-limit');
  const remaining = headerInt(headers, 'x-ratelimit-requests-remaining');
  const perMinuteLimit = headerInt(headers, 'x-ratelimit-limit');
  const perMinuteRemaining = headerInt(headers, 'x-ratelimit-remaining');
  if (limit == null && remaining == null && perMinuteLimit == null && perMinuteRemaining == null) return;
  if (limit != null) quota.limit = limit;
  if (remaining != null) quota.remaining = remaining;
  if (perMinuteLimit != null) quota.perMinuteLimit = perMinuteLimit;
  if (perMinuteRemaining != null) quota.perMinuteRemaining = perMinuteRemaining;
  quota.observedAt = now;
}

async function fetchUpstream(
  key: string,
  inflight: Map<string, Promise<UpstreamFetch>>,
  loader: () => Promise<UpstreamFetch>,
): Promise<UpstreamFetch> {
  const pending = inflight.get(key);
  if (pending) return pending;
  const task = loader().finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, task);
  return task;
}

export async function handleFootballBffRequest(
  request: Request,
  env: FootballBffEnv,
): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (request.method !== 'GET') {
    return jsonResponse(405, { errors: { bff: 'GET only' } });
  }

  const url = new URL(request.url);
  const path = normalizeBffPath(url.pathname);
  const cache = env.cache ?? sharedBffCache();
  const now = env.now ?? Date.now;
  const quota = env.quota ?? sharedBffQuota();
  const keyConfigured = env.apiKey.trim().length > 0;

  if (path === '/' || path === '/health') {
    cache.prune(now());
    return jsonResponse(200, healthBody(cache.size, keyConfigured, quota));
  }

  if (!isAllowedBffPath(path)) {
    return jsonResponse(404, { errors: { bff: 'Unknown path' } });
  }

  if (isLeagueScopedBffPath(path)) {
    const league = url.searchParams.get('league');
    if (!league?.trim()) {
      return jsonResponse(400, { errors: { bff: 'league query param required' } });
    }
    if (!bffAllowsLeagueParam(league)) {
      return jsonResponse(400, {
        errors: { bff: 'League is not in KickFeed live coverage (England, Slovakia Niké Liga, La Liga)' },
      });
    }
  }

  if (path === '/players') {
    const playerError = bffPlayerSeasonQueryError(url.searchParams);
    if (playerError) return jsonResponse(400, { errors: { bff: playerError } });
  }

  if (path === '/teams/statistics') {
    const statsError = bffTeamStatisticsQueryError(url.searchParams);
    if (statsError) return jsonResponse(400, { errors: { bff: statsError } });
  }

  const apiKey = env.apiKey.trim();
  if (!apiKey) {
    return jsonResponse(500, { errors: { bff: 'FOOTBALL_API_KEY is not configured' } });
  }

  const defaultTtl = bffTtlMsForPath(path);
  const search = canonicalBffSearch(url.searchParams);
  const cacheKey = search ? `${path}?${search}` : path;
  const cached = cache.get(cacheKey, now());
  if (cached !== undefined) {
    const remaining = cache.remainingMs(cacheKey, now());
    return envelopeResponse(cached, remaining > 0 ? remaining : defaultTtl, 'HIT');
  }

  const origin = (env.origin ?? API_FOOTBALL_ORIGIN).replace(/\/$/, '');
  const upstream = new URL(`${origin}${path}`);
  if (search) upstream.search = `?${search}`;

  const doFetch = env.fetchImpl ?? fetch;
  const inflight = env.inflight ?? sharedBffInflight();
  const fetched = await fetchUpstream(cacheKey, inflight, async (): Promise<UpstreamFetch> => {
    try {
      const res = await doFetch(upstream.toString(), {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'x-apisports-key': apiKey,
        },
      });
      noteQuota(res.headers, quota, now());
      const text = await res.text();
      if (res.status === 401 || res.status === 403) {
        return { ok: false, status: 502, message: 'API-Football rejected the server key' };
      }
      if (!res.ok) {
        return { ok: false, status: res.status >= 500 ? 502 : res.status, message: `API-Football HTTP ${res.status}` };
      }
      return { ok: true, status: res.status, text };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upstream fetch failed';
      return { ok: false, status: 502, message };
    }
  });

  if (!fetched.ok) {
    const stale = cache.peek(cacheKey);
    const retryable = fetched.status === 429 || fetched.status >= 500;
    if (stale !== undefined && retryable && cache.isWithinStaleWindow(cacheKey, now())) {
      return envelopeResponse(stale, defaultTtl, 'STALE');
    }
    if (fetched.status === 502 && fetched.message === 'API-Football rejected the server key') {
      return jsonResponse(502, { errors: { bff: fetched.message } }, cacheHeaders(defaultTtl, 'BYPASS'));
    }
    return jsonResponse(fetched.status, { errors: { bff: fetched.message } }, cacheHeaders(defaultTtl, 'BYPASS'));
  }

  const ttlMs = bffTtlMsForResponse(path, fetched.text);
  cache.set(cacheKey, fetched.text, ttlMs, now());
  return envelopeResponse(fetched.text, ttlMs, 'MISS');
}

let defaultCache: TtlCache<string> | undefined;
let defaultInflight: Map<string, Promise<UpstreamFetch>> | undefined;
let defaultQuota: BffQuotaSnapshot | undefined;

/**
 * Module state is one Cloudflare isolate (or one local Node process).
 * A second isolate has its own empty cache and will miss until it fetches.
 */
function sharedBffCache(): TtlCache<string> {
  defaultCache ??= createFootballBffCache();
  return defaultCache;
}

function sharedBffQuota(): BffQuotaSnapshot {
  defaultQuota ??= emptyBffQuota();
  return defaultQuota;
}

function sharedBffInflight(): Map<string, Promise<UpstreamFetch>> {
  defaultInflight ??= new Map();
  return defaultInflight;
}

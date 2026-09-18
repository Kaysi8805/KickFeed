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
  '/players/topscorers',
  '/players/squads',
  '/fixtures/events',
  '/fixtures/lineups',
] as const;

/** Paths that must carry an allowlisted `league` query so random competitions cannot burn quota. */
export const BFF_LEAGUE_SCOPED_PATHS = ['/fixtures', '/standings', '/players/topscorers'] as const;

export const BFF_ALLOWED_LEAGUE_IDS = LIVE_LEAGUE_IDS;

export const BFF_TTL_MS = {
  fixturesLive: 45_000,
  fixturesIdle: 5 * 60_000,
  standings: 15 * 60_000,
  scorers: 30 * 60_000,
  squads: 30 * 60_000,
  events: 60_000,
  lineups: 60_000,
} as const;

const LIVE_FIXTURE_SHORT = new Set(['1H', '2H', 'ET', 'BT', 'P', 'LIVE', 'INT', 'SUSP', 'HT']);

export type FootballBffEnv = {
  apiKey: string;
  fetchImpl?: typeof fetch;
  cache?: TtlCache<string>;
  now?: () => number;
  origin?: string;
  inflight?: Map<string, Promise<UpstreamFetch>>;
};

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Accept, Content-Type',
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

export function bffTtlMsForPath(pathname: string): number {
  switch (normalizeBffPath(pathname)) {
    case '/fixtures':
      return BFF_TTL_MS.fixturesIdle;
    case '/standings':
      return BFF_TTL_MS.standings;
    case '/players/topscorers':
      return BFF_TTL_MS.scorers;
    case '/players/squads':
      return BFF_TTL_MS.squads;
    case '/fixtures/events':
      return BFF_TTL_MS.events;
    case '/fixtures/lineups':
      return BFF_TTL_MS.lineups;
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
      ...CORS,
      ...extra,
    },
  });
}

function cacheHeaders(ttlMs: number, hit: 'HIT' | 'MISS' | 'BYPASS' | 'STALE'): Record<string, string> {
  const headers: Record<string, string> = {
    'X-KickFeed-Cache': hit,
  };
  if (hit !== 'BYPASS') {
    headers['Cache-Control'] = `public, max-age=${Math.max(1, Math.floor(ttlMs / 1000))}`;
  }
  return headers;
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

function healthBody(cacheSize: number) {
  return {
    ok: true,
    service: 'kickfeed-football-bff',
    coverage: {
      leagues: LIVE_LEAGUE_META.map((row) => ({
        id: row.id,
        name: row.name,
        country: row.countryId,
      })),
    },
    ttlMs: BFF_TTL_MS,
    cacheEntries: cacheSize,
    quota: {
      dailyLimit: API_FOOTBALL_DAILY_LIMIT,
      note: 'Allowlisted leagues only. Fixtures 45s if any row is live, else 5 min. Standings 15 min. 429/5xx reuse stale cache. Never put FOOTBALL_API_KEY in Expo or CI.',
    },
  };
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

  if (path === '/' || path === '/health') {
    return jsonResponse(200, healthBody(cache.size));
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

  const apiKey = env.apiKey.trim();
  if (!apiKey) {
    return jsonResponse(500, { errors: { bff: 'FOOTBALL_API_KEY is not configured' } });
  }

  const defaultTtl = bffTtlMsForPath(path);
  const cacheKey = `${path}?${url.searchParams.toString()}`;
  const cached = cache.get(cacheKey, now());
  if (cached !== undefined) {
    return envelopeResponse(cached, bffTtlMsForResponse(path, cached), 'HIT');
  }

  const origin = (env.origin ?? API_FOOTBALL_ORIGIN).replace(/\/$/, '');
  const upstream = new URL(`${origin}${path}`);
  url.searchParams.forEach((value, key) => {
    if (value) upstream.searchParams.set(key, value);
  });

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
    if (stale !== undefined && retryable) {
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

function sharedBffCache(): TtlCache<string> {
  defaultCache ??= new TtlCache<string>();
  return defaultCache;
}

function sharedBffInflight(): Map<string, Promise<UpstreamFetch>> {
  defaultInflight ??= new Map();
  return defaultInflight;
}

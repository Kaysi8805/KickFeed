/**
 * Thin API-Football BFF: allowlisted GET proxy + TTL cache.
 * Cloudflare Worker and the local Node server call this Fetch handler.
 * The Expo app does not import this module at runtime.
 */
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

export const BFF_TTL_MS = {
  fixtures: 45_000,
  standings: 5 * 60_000,
  scorers: 15 * 60_000,
  squads: 30 * 60_000,
  events: 45_000,
  lineups: 45_000,
} as const;

export type FootballBffEnv = {
  apiKey: string;
  fetchImpl?: typeof fetch;
  cache?: TtlCache<string>;
  now?: () => number;
  origin?: string;
};

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Accept, Content-Type',
};

export function normalizeBffPath(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, '') || '/';
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

export function isAllowedBffPath(pathname: string): boolean {
  return (BFF_ALLOWED_PATHS as readonly string[]).includes(normalizeBffPath(pathname));
}

export function bffTtlMsForPath(pathname: string): number {
  switch (normalizeBffPath(pathname)) {
    case '/fixtures':
      return BFF_TTL_MS.fixtures;
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
      return BFF_TTL_MS.fixtures;
  }
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

function cacheHeaders(ttlMs: number, hit: 'HIT' | 'MISS' | 'BYPASS'): Record<string, string> {
  const headers: Record<string, string> = {
    'X-KickFeed-Cache': hit,
  };
  if (hit !== 'BYPASS') {
    headers['Cache-Control'] = `public, max-age=${Math.max(1, Math.floor(ttlMs / 1000))}`;
  }
  return headers;
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

  if (path === '/' || path === '/health') {
    return jsonResponse(200, { ok: true, service: 'kickfeed-football-bff' });
  }

  if (!isAllowedBffPath(path)) {
    return jsonResponse(404, { errors: { bff: 'Unknown path' } });
  }

  const apiKey = env.apiKey.trim();
  if (!apiKey) {
    return jsonResponse(500, { errors: { bff: 'FOOTBALL_API_KEY is not configured' } });
  }

  const cache = env.cache ?? sharedBffCache();
  const now = env.now ?? Date.now;
  const ttlMs = bffTtlMsForPath(path);
  const cacheKey = `${path}?${url.searchParams.toString()}`;
  const cached = cache.get(cacheKey, now());
  if (cached !== undefined) {
    return new Response(cached, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        ...CORS,
        ...cacheHeaders(ttlMs, 'HIT'),
      },
    });
  }

  const origin = (env.origin ?? API_FOOTBALL_ORIGIN).replace(/\/$/, '');
  const upstream = new URL(`${origin}${path}`);
  url.searchParams.forEach((value, key) => {
    if (value) upstream.searchParams.set(key, value);
  });

  const doFetch = env.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await doFetch(upstream.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'x-apisports-key': apiKey,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upstream fetch failed';
    return jsonResponse(502, { errors: { bff: message } }, cacheHeaders(ttlMs, 'BYPASS'));
  }

  const text = await res.text();
  if (res.status === 401 || res.status === 403) {
    return jsonResponse(
      502,
      { errors: { bff: 'API-Football rejected the server key' } },
      cacheHeaders(ttlMs, 'BYPASS'),
    );
  }
  if (!res.ok) {
    let body: unknown = { errors: { bff: `API-Football HTTP ${res.status}` } };
    try {
      body = text ? JSON.parse(text) : body;
    } catch {
      /* keep generic envelope */
    }
    return jsonResponse(res.status >= 500 ? 502 : res.status, body, cacheHeaders(ttlMs, 'BYPASS'));
  }

  cache.set(cacheKey, text, ttlMs, now());
  return new Response(text, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...CORS,
      ...cacheHeaders(ttlMs, 'MISS'),
    },
  });
}

let defaultCache: TtlCache<string> | undefined;

function sharedBffCache(): TtlCache<string> {
  defaultCache ??= new TtlCache<string>();
  return defaultCache;
}

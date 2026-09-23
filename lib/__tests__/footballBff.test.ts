import { TtlCache } from '@/lib/ttlCache';
import {
  BFF_CACHE_LIMITS,
  BFF_TTL_MS,
  bffAllowsLeagueParam,
  bffFixtureDetailQueryError,
  bffPlayerSeasonQueryError,
  bffTeamStatisticsQueryError,
  bffTtlMsForPath,
  bffTtlMsForResponse,
  lineupsEnvelopeHasSheet,
  createFootballBffCache,
  emptyBffQuota,
  handleFootballBffRequest,
  isAllowedBffPath,
  isLeagueScopedBffPath,
} from '@/lib/footballBff';
import { describe, expect, it, vi } from 'vitest';

function req(path: string, method = 'GET'): Request {
  return new Request(`https://bff.test${path}`, { method });
}

describe('football BFF allowlist and ttls', () => {
  it('allows only API-Football paths KickFeed already calls', () => {
    expect(isAllowedBffPath('/fixtures')).toBe(true);
    expect(isAllowedBffPath('/standings/')).toBe(true);
    expect(isAllowedBffPath('/players/topscorers')).toBe(true);
    expect(isAllowedBffPath('/players')).toBe(true);
    expect(isAllowedBffPath('/teams/statistics')).toBe(true);
    expect(isAllowedBffPath('/teams/statistics/')).toBe(true);
    expect(isAllowedBffPath('/coachs')).toBe(false);
    expect(isAllowedBffPath('/fixtures/statistics')).toBe(false);
    expect(isAllowedBffPath('/players/topassists')).toBe(false);
    expect(isAllowedBffPath('/odds')).toBe(false);
    expect(isAllowedBffPath('/')).toBe(false);
  });

  it('scopes fixtures/standings/scorers to live coverage leagues', () => {
    expect(isLeagueScopedBffPath('/fixtures')).toBe(true);
    expect(isLeagueScopedBffPath('/teams/statistics')).toBe(true);
    expect(isLeagueScopedBffPath('/players/squads')).toBe(false);
    expect(bffAllowsLeagueParam('39')).toBe(true);
    expect(bffAllowsLeagueParam('332')).toBe(true);
    expect(bffAllowsLeagueParam('140')).toBe(true);
    expect(bffAllowsLeagueParam('2')).toBe(false);
    expect(bffAllowsLeagueParam('78')).toBe(false);
  });

  it('uses short live fixture ttl and longer idle/standings ttl', () => {
    expect(bffTtlMsForPath('/fixtures')).toBe(BFF_TTL_MS.fixturesIdle);
    expect(bffTtlMsForPath('/standings')).toBe(BFF_TTL_MS.standings);
    expect(bffTtlMsForPath('/players/topscorers')).toBe(BFF_TTL_MS.scorers);
    expect(bffTtlMsForPath('/players')).toBe(BFF_TTL_MS.players);
    expect(bffTtlMsForPath('/teams/statistics')).toBe(BFF_TTL_MS.teamStats);
    expect(BFF_TTL_MS.teamStats).toBe(24 * 60 * 60_000);
    expect(BFF_TTL_MS.players).toBeGreaterThanOrEqual(6 * 60 * 60_000);
    expect(BFF_TTL_MS.players).toBeLessThanOrEqual(24 * 60 * 60_000);
    expect(bffTeamStatisticsQueryError(new URLSearchParams('league=39&season=2026&team=40'))).toBeNull();
    expect(bffTeamStatisticsQueryError(new URLSearchParams('league=39&season=2026'))).toMatch(/team/);
    expect(bffTeamStatisticsQueryError(new URLSearchParams('league=39&team=40'))).toMatch(/season/);
    expect(bffTeamStatisticsQueryError(new URLSearchParams('league=2&season=2026&team=40'))).toMatch(/league/);
    expect(bffTeamStatisticsQueryError(new URLSearchParams('league=39&season=2026&team=40&date=2026-01-01'))).toMatch(
      /league, season, and team/,
    );
    expect(bffPlayerSeasonQueryError(new URLSearchParams('id=306&season=2026'))).toBeNull();
    expect(bffPlayerSeasonQueryError(new URLSearchParams('season=2026'))).toMatch(/id/);
    expect(bffPlayerSeasonQueryError(new URLSearchParams('id=306&season=2026&league=39'))).toMatch(/id and season/);
    expect(BFF_TTL_MS.fixturesLive).toBeLessThan(BFF_TTL_MS.fixturesIdle);
    expect(BFF_TTL_MS.fixturesIdle).toBeLessThan(BFF_TTL_MS.standings);
    expect(bffTtlMsForPath('/fixtures/lineups')).toBe(10 * 60_000);
    expect(BFF_TTL_MS.lineupsSheet).toBe(30 * 60_000);
    expect(bffFixtureDetailQueryError('fixtures/lineups', new URLSearchParams('fixture=9001'))).toBeNull();
    expect(bffFixtureDetailQueryError('fixtures/lineups', new URLSearchParams(''))).toMatch(/fixture/);
    expect(bffFixtureDetailQueryError('fixtures/events', new URLSearchParams('fixture=9001&team=40'))).toMatch(
      /only allows fixture/,
    );
    const sheet = JSON.stringify({ response: [{ startXI: [{ player: { id: 1 } }] }] });
    expect(lineupsEnvelopeHasSheet(sheet)).toBe(true);
    expect(lineupsEnvelopeHasSheet(JSON.stringify({ response: [] }))).toBe(false);
    expect(bffTtlMsForResponse('/fixtures/lineups', sheet)).toBe(BFF_TTL_MS.lineupsSheet);
    expect(bffTtlMsForResponse('/fixtures/lineups', '{"response":[]}')).toBe(BFF_TTL_MS.lineups);
  });
});

describe('handleFootballBffRequest', () => {
  it('serves health without an API key or upstream call', async () => {
    const fetchImpl = vi.fn();
    const res = await handleFootballBffRequest(req('/health'), { apiKey: '', fetchImpl });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, service: 'kickfeed-football-bff', keyConfigured: false });
    expect(body.coverage.leagues.map((l: { id: string }) => l.id)).toEqual(['39', '40', '332', '140']);
    expect(body.quota.dailyLimit).toBe(100);
    expect(body.quota.remaining).toBeNull();
    expect(body.cache.scope).toBe('isolate');
    expect(body.cache.maxEntries).toBe(BFF_CACHE_LIMITS.maxEntries);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects unknown paths, methods, and out-of-coverage leagues without hitting API-Football', async () => {
    const fetchImpl = vi.fn();
    const missing = await handleFootballBffRequest(req('/odds'), { apiKey: 'secret', fetchImpl });
    const post = await handleFootballBffRequest(req('/fixtures', 'POST'), { apiKey: 'secret', fetchImpl });
    const ucl = await handleFootballBffRequest(req('/fixtures?league=2&season=2026'), { apiKey: 'secret', fetchImpl });
    const noLeague = await handleFootballBffRequest(req('/standings?season=2026'), { apiKey: 'secret', fetchImpl });
    const squadWide = await handleFootballBffRequest(req('/players?league=39&season=2026'), { apiKey: 'secret', fetchImpl });
    const noSeason = await handleFootballBffRequest(req('/players?id=306'), { apiKey: 'secret', fetchImpl });
    const statsWide = await handleFootballBffRequest(req('/teams/statistics?league=39&season=2026'), {
      apiKey: 'secret',
      fetchImpl,
    });
    const statsUcl = await handleFootballBffRequest(req('/teams/statistics?league=2&season=2026&team=40'), {
      apiKey: 'secret',
      fetchImpl,
    });
    const statsDated = await handleFootballBffRequest(
      req('/teams/statistics?league=39&season=2026&team=40&date=2026-01-01'),
      { apiKey: 'secret', fetchImpl },
    );
    const coach = await handleFootballBffRequest(req('/coachs?team=40'), { apiKey: 'secret', fetchImpl });
    expect(missing.status).toBe(404);
    expect(post.status).toBe(405);
    expect(ucl.status).toBe(400);
    expect(noLeague.status).toBe(400);
    expect(squadWide.status).toBe(400);
    expect(noSeason.status).toBe(400);
    expect(statsWide.status).toBe(400);
    expect(statsUcl.status).toBe(400);
    expect(statsDated.status).toBe(400);
    expect(coach.status).toBe(404);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('proxies allowlisted GETs with the server key and caches the body', async () => {
    const envelope = { response: [{ league: { id: 39 }, fixture: { status: { short: 'FT' } } }] };
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(envelope), { status: 200 }));
    const cache = new TtlCache<string>();
    let now = 1_000;
    const env = {
      apiKey: 'server-secret',
      fetchImpl,
      cache,
      now: () => now,
      origin: 'https://upstream.test',
    };

    const first = await handleFootballBffRequest(req('/fixtures?league=39&season=2026'), env);
    expect(first.status).toBe(200);
    expect(first.headers.get('X-KickFeed-Cache')).toBe('MISS');
    expect(await first.json()).toEqual(envelope);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining('https://upstream.test/fixtures?league=39'),
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ 'x-apisports-key': 'server-secret' }),
      }),
    );

    now += 1_000;
    const second = await handleFootballBffRequest(req('/fixtures?league=39&season=2026'), env);
    expect(second.headers.get('X-KickFeed-Cache')).toBe('HIT');
    expect(await second.json()).toEqual(envelope);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('uses a 45s ttl when any fixture in the envelope is live', async () => {
    const liveBody = JSON.stringify({
      response: [{ league: { id: 332 }, fixture: { status: { short: '2H' } } }],
    });
    expect(bffTtlMsForResponse('/fixtures', liveBody)).toBe(BFF_TTL_MS.fixturesLive);
    const fetchImpl = vi.fn(async () => new Response(liveBody, { status: 200 }));
    const cache = new TtlCache<string>();
    let now = 1_000;
    const env = { apiKey: 'k', fetchImpl, cache, now: () => now, origin: 'https://upstream.test' };
    await handleFootballBffRequest(req('/fixtures?league=332'), env);
    now += 46_000;
    await handleFootballBffRequest(req('/fixtures?league=332'), env);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('serves stale cache on 429 instead of burning another origin call later', async () => {
    const envelope = JSON.stringify({ response: [{ league: { id: 140 } }] });
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(envelope, { status: 200 }))
      .mockResolvedValueOnce(new Response('rate', { status: 429 }));
    const cache = new TtlCache<string>();
    let now = 1_000;
    const env = { apiKey: 'k', fetchImpl, cache, now: () => now, origin: 'https://upstream.test' };
    await handleFootballBffRequest(req('/standings?league=140'), env);
    now += BFF_TTL_MS.standings + 1;
    const stale = await handleFootballBffRequest(req('/standings?league=140'), env);
    expect(stale.status).toBe(200);
    expect(stale.headers.get('X-KickFeed-Cache')).toBe('STALE');
    expect(stale.headers.get('Cache-Control')).toBe('no-store');
    expect(await stale.json()).toEqual({ response: [{ league: { id: 140 } }] });
  });

  it('caches a single-player season read for 12h and coalesces parallel misses', async () => {
    const envelope = { response: [{ player: { id: 306 }, statistics: [] }] };
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fetchImpl = vi.fn(async () => {
      await gate;
      return new Response(JSON.stringify(envelope), { status: 200 });
    });
    const cache = new TtlCache<string>();
    const inflight = new Map();
    let now = 1_000;
    const env = {
      apiKey: 'server-secret',
      fetchImpl,
      cache,
      inflight,
      now: () => now,
      origin: 'https://upstream.test',
    };
    const first = handleFootballBffRequest(req('/players?id=306&season=2026'), env);
    const second = handleFootballBffRequest(req('/players?id=306&season=2026'), env);
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    release();
    const [a, b] = await Promise.all([first, second]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://upstream.test/players?id=306&season=2026',
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-apisports-key': 'server-secret' }),
      }),
    );
    now += 1_000;
    const hit = await handleFootballBffRequest(req('/players?id=306&season=2026'), env);
    expect(hit.headers.get('X-KickFeed-Cache')).toBe('HIT');
    now += BFF_TTL_MS.players;
    const expired = await handleFootballBffRequest(req('/players?id=306&season=2026'), env);
    expect(expired.headers.get('X-KickFeed-Cache')).toBe('MISS');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('caches one team statistics read for 24h and coalesces parallel misses', async () => {
    const envelope = {
      response: {
        team: { id: 40 },
        league: { id: 39, season: 2026 },
        form: 'WWW',
        fixtures: { played: { total: 3 } },
      },
    };
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fetchImpl = vi.fn(async () => {
      await gate;
      return new Response(JSON.stringify(envelope), { status: 200 });
    });
    const cache = new TtlCache<string>();
    const inflight = new Map();
    let now = 1_000;
    const env = {
      apiKey: 'server-secret',
      fetchImpl,
      cache,
      inflight,
      now: () => now,
      origin: 'https://upstream.test',
    };
    const path = '/teams/statistics?league=39&season=2026&team=40';
    const first = handleFootballBffRequest(req(path), env);
    const second = handleFootballBffRequest(req(path), env);
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    release();
    const [a, b] = await Promise.all([first, second]);
    expect(a.headers.get('X-KickFeed-Cache')).toBe('MISS');
    expect(b.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://upstream.test/teams/statistics?league=39&season=2026&team=40',
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-apisports-key': 'server-secret' }),
      }),
    );
    now += 60_000;
    const hit = await handleFootballBffRequest(req(path), env);
    expect(hit.headers.get('X-KickFeed-Cache')).toBe('HIT');
    expect(hit.headers.get('Cache-Control')).toBe(`public, max-age=${24 * 60 * 60 - 60}`);
    now += BFF_TTL_MS.teamStats;
    const expired = await handleFootballBffRequest(req(path), env);
    expect(expired.headers.get('X-KickFeed-Cache')).toBe('MISS');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('does not cache upstream errors and does not echo the key', async () => {
    const fetchImpl = vi.fn(async () => new Response('nope', { status: 401 }));
    const res = await handleFootballBffRequest(req('/standings?league=39'), {
      apiKey: 'super-secret-key',
      fetchImpl,
    });
    expect(res.status).toBe(502);
    const body = await res.text();
    expect(body).not.toContain('super-secret-key');
    expect(res.headers.get('X-KickFeed-Cache')).toBe('BYPASS');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('answers CORS preflight without credentials or the API key header', async () => {
    const fetchImpl = vi.fn();
    const res = await handleFootballBffRequest(req('/fixtures', 'OPTIONS'), { apiKey: 'secret', fetchImpl });
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(res.headers.get('Access-Control-Allow-Credentials')).toBeNull();
    expect(res.headers.get('Access-Control-Allow-Headers') ?? '').not.toMatch(/x-apisports-key/i);
    expect(res.headers.get('Access-Control-Max-Age')).toBe('86400');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('coalesces the same query regardless of parameter order', async () => {
    const envelope = { response: [{ league: { id: 39 } }] };
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fetchImpl = vi.fn(async () => {
      await gate;
      return new Response(JSON.stringify(envelope), { status: 200 });
    });
    const env = {
      apiKey: 'server-secret',
      fetchImpl,
      cache: new TtlCache<string>(),
      inflight: new Map(),
      now: () => 1_000,
      origin: 'https://upstream.test',
    };
    const first = handleFootballBffRequest(req('/fixtures?season=2026&league=39'), env);
    const second = handleFootballBffRequest(req('/fixtures?league=39&season=2026'), env);
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    release();
    await Promise.all([first, second]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://upstream.test/fixtures?league=39&season=2026',
      expect.anything(),
    );
  });

  it('records API-Football quota headers for /health without echoing the key', async () => {
    const quota = emptyBffQuota();
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ response: [] }), {
        status: 200,
        headers: {
          'x-ratelimit-requests-limit': '100',
          'x-ratelimit-requests-remaining': '91',
          'X-RateLimit-Limit': '10',
          'X-RateLimit-Remaining': '9',
        },
      }),
    );
    const env = {
      apiKey: 'server-secret',
      fetchImpl,
      cache: new TtlCache<string>(),
      quota,
      now: () => 5_000,
      origin: 'https://upstream.test',
    };
    await handleFootballBffRequest(req('/fixtures?league=39'), env);
    const health = await handleFootballBffRequest(req('/health'), env);
    expect(health.headers.get('Cache-Control')).toBe('no-store');
    const body = await health.json();
    expect(body.keyConfigured).toBe(true);
    expect(body.quota.limit).toBe(100);
    expect(body.quota.remaining).toBe(91);
    expect(body.quota.perMinuteRemaining).toBe(9);
    expect(body.quota.observedAt).toBe(5_000);
    expect(JSON.stringify(body)).not.toContain('server-secret');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('rejects lineup and event queries that are not one numeric fixture', async () => {
    const fetchImpl = vi.fn();
    const missing = await handleFootballBffRequest(req('/fixtures/lineups'), { apiKey: 'secret', fetchImpl });
    const extra = await handleFootballBffRequest(req('/fixtures/lineups?fixture=9001&type=startXI'), {
      apiKey: 'secret',
      fetchImpl,
    });
    const events = await handleFootballBffRequest(req('/fixtures/events?fixture=abc'), { apiKey: 'secret', fetchImpl });
    expect(missing.status).toBe(400);
    expect(extra.status).toBe(400);
    expect(events.status).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('caches a published lineup sheet longer than an empty response', async () => {
    const sheet = JSON.stringify({
      response: [{ startXI: [{ player: { id: 1, name: 'A' } }], substitutes: [] }],
    });
    const fetchImpl = vi.fn(async () => new Response(sheet, { status: 200 }));
    const res = await handleFootballBffRequest(req('/fixtures/lineups?fixture=9001'), {
      apiKey: 'secret',
      fetchImpl,
      cache: new TtlCache<string>(),
      now: () => 1_000,
      origin: 'https://upstream.test',
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('X-KickFeed-Cache')).toBe('MISS');
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=1800');

    const emptyFetch = vi.fn(async () => new Response(JSON.stringify({ response: [] }), { status: 200 }));
    const empty = await handleFootballBffRequest(req('/fixtures/lineups?fixture=9002'), {
      apiKey: 'secret',
      fetchImpl: emptyFetch,
      cache: new TtlCache<string>(),
      now: () => 1_000,
      origin: 'https://upstream.test',
    });
    expect(empty.headers.get('Cache-Control')).toBe('public, max-age=600');
    expect(emptyFetch).toHaveBeenCalledTimes(1);
  });

  it('caps the shared isolate cache', () => {
    const cache = createFootballBffCache();
    for (let i = 0; i < BFF_CACHE_LIMITS.maxEntries + 5; i += 1) {
      cache.set(`k${i}`, 'x', 60_000, 0);
    }
    expect(cache.size).toBeLessThanOrEqual(BFF_CACHE_LIMITS.maxEntries);
    expect(BFF_CACHE_LIMITS.maxEntries).toBeLessThanOrEqual(256);
  });
});

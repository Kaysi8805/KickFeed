import { TtlCache } from '@/lib/ttlCache';
import {
  BFF_TTL_MS,
  bffAllowsLeagueParam,
  bffPlayerSeasonQueryError,
  bffTtlMsForPath,
  bffTtlMsForResponse,
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
    expect(isAllowedBffPath('/players/topassists')).toBe(false);
    expect(isAllowedBffPath('/odds')).toBe(false);
    expect(isAllowedBffPath('/')).toBe(false);
  });

  it('scopes fixtures/standings/scorers to live coverage leagues', () => {
    expect(isLeagueScopedBffPath('/fixtures')).toBe(true);
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
    expect(BFF_TTL_MS.players).toBeGreaterThanOrEqual(6 * 60 * 60_000);
    expect(BFF_TTL_MS.players).toBeLessThanOrEqual(24 * 60 * 60_000);
    expect(bffPlayerSeasonQueryError(new URLSearchParams('id=306&season=2026'))).toBeNull();
    expect(bffPlayerSeasonQueryError(new URLSearchParams('season=2026'))).toMatch(/id/);
    expect(bffPlayerSeasonQueryError(new URLSearchParams('id=306&season=2026&league=39'))).toMatch(/id and season/);
    expect(BFF_TTL_MS.fixturesLive).toBeLessThan(BFF_TTL_MS.fixturesIdle);
    expect(BFF_TTL_MS.fixturesIdle).toBeLessThan(BFF_TTL_MS.standings);
  });
});

describe('handleFootballBffRequest', () => {
  it('serves health without an API key or upstream call', async () => {
    const fetchImpl = vi.fn();
    const res = await handleFootballBffRequest(req('/health'), { apiKey: '', fetchImpl });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, service: 'kickfeed-football-bff' });
    expect(body.coverage.leagues.map((l: { id: string }) => l.id)).toEqual(['39', '40', '332', '140']);
    expect(body.quota.dailyLimit).toBe(100);
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
    expect(missing.status).toBe(404);
    expect(post.status).toBe(405);
    expect(ucl.status).toBe(400);
    expect(noLeague.status).toBe(400);
    expect(squadWide.status).toBe(400);
    expect(noSeason.status).toBe(400);
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
  });
});

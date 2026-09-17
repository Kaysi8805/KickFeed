import { TtlCache } from '@/lib/ttlCache';
import {
  BFF_TTL_MS,
  bffTtlMsForPath,
  handleFootballBffRequest,
  isAllowedBffPath,
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
    expect(isAllowedBffPath('/odds')).toBe(false);
    expect(isAllowedBffPath('/')).toBe(false);
  });

  it('uses short fixture ttl and longer standings/scorers ttl', () => {
    expect(bffTtlMsForPath('/fixtures')).toBe(BFF_TTL_MS.fixtures);
    expect(bffTtlMsForPath('/standings')).toBe(BFF_TTL_MS.standings);
    expect(bffTtlMsForPath('/players/topscorers')).toBe(BFF_TTL_MS.scorers);
    expect(BFF_TTL_MS.fixtures).toBeLessThan(BFF_TTL_MS.standings);
  });
});

describe('handleFootballBffRequest', () => {
  it('serves health without an API key or upstream call', async () => {
    const fetchImpl = vi.fn();
    const res = await handleFootballBffRequest(req('/health'), { apiKey: '', fetchImpl });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects unknown paths and methods without hitting API-Football', async () => {
    const fetchImpl = vi.fn();
    const missing = await handleFootballBffRequest(req('/odds'), { apiKey: 'secret', fetchImpl });
    const post = await handleFootballBffRequest(req('/fixtures', 'POST'), { apiKey: 'secret', fetchImpl });
    expect(missing.status).toBe(404);
    expect(post.status).toBe(405);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('proxies allowlisted GETs with the server key and caches the body', async () => {
    const envelope = { response: [{ league: { id: 39 } }] };
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

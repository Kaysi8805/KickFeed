import { FOOTBALL_TTL, TtlCache, fixturesTtlMs } from '@/lib/ttlCache';
import { describe, expect, it } from 'vitest';

describe('TtlCache', () => {
  it('returns a value inside the ttl and evicts after', () => {
    const cache = new TtlCache<string>();
    cache.set('fixtures', 'pl', 1_000, 0);
    expect(cache.get('fixtures', 500)).toBe('pl');
    expect(cache.hasFresh('fixtures', 999)).toBe(true);
    expect(cache.peek('fixtures')).toBe('pl');
    expect(cache.get('fixtures', 1_000)).toBeUndefined();
    expect(cache.peek('fixtures')).toBe('pl');
  });

  it('drops long-stale rows and keeps short-ttl fixtures when the cap is hit', () => {
    const cache = new TtlCache<string>({ maxEntries: 2, maxStaleMs: 1_000 });
    cache.set('fixtures', 'live', 1_000, 0);
    cache.set('stats', 'club', 50_000, 0);
    cache.set('player', 'p', 40_000, 0);
    expect(cache.size).toBe(2);
    expect(cache.peek('fixtures')).toBe('live');
    expect(cache.peek('stats')).toBeUndefined();
    expect(cache.get('player', 0)).toBe('p');

    cache.set('old', 'x', 100, 0);
    cache.set('fresh', 'y', 5_000, 500);
    expect(cache.peek('old')).toBeUndefined();
    expect(cache.get('fresh', 500)).toBe('y');
    expect(cache.isWithinStaleWindow('fresh', 500)).toBe(true);

    const bounded = new TtlCache<string>({ maxEntries: 1, maxStaleMs: 1_000 });
    bounded.set('gone', 'z', 100, 0);
    bounded.prune(5_000);
    expect(bounded.peek('gone')).toBeUndefined();
    expect(bounded.remainingMs('missing', 0)).toBe(0);
  });

  it('uses a shorter ttl when any fixture is live', () => {
    expect(fixturesTtlMs(true)).toBe(FOOTBALL_TTL.fixturesLiveMs);
    expect(fixturesTtlMs(false)).toBe(FOOTBALL_TTL.fixturesIdleMs);
    expect(FOOTBALL_TTL.fixturesLiveMs).toBeLessThan(FOOTBALL_TTL.fixturesIdleMs);
  });
});

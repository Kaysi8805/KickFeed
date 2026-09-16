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
  });

  it('uses a shorter ttl when any fixture is live', () => {
    expect(fixturesTtlMs(true)).toBe(FOOTBALL_TTL.fixturesLiveMs);
    expect(fixturesTtlMs(false)).toBe(FOOTBALL_TTL.fixturesIdleMs);
    expect(FOOTBALL_TTL.fixturesLiveMs).toBeLessThan(FOOTBALL_TTL.fixturesIdleMs);
  });
});

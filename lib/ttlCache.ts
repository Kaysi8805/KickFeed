/** In-memory TTL cache for football API responses (fixtures, standings, squads). */
export type TtlCacheOptions = {
  /**
   * When set, `set` evicts until the map is within this size.
   * Stale rows go first, then the longest-lived fresh rows, so a short fixture TTL
   * is kept ahead of a 24h stats blob when an isolate is near its memory cap.
   */
  maxEntries?: number;
  /**
   * Drop entries this long after they expire. Fresh reads ignore them either way;
   * `peek` can still return them inside the window (BFF stale-on-429).
   */
  maxStaleMs?: number;
};

export class TtlCache<V> {
  private readonly store = new Map<string, { value: V; expiresAt: number }>();

  constructor(private readonly options: TtlCacheOptions = {}) {}

  get(key: string, now = Date.now()): V | undefined {
    const hit = this.store.get(key);
    if (!hit || hit.expiresAt <= now) return undefined;
    return hit.value;
  }

  /** Milliseconds until this key expires. `0` when missing or already stale. */
  remainingMs(key: string, now = Date.now()): number {
    const hit = this.store.get(key);
    if (!hit) return 0;
    return Math.max(0, hit.expiresAt - now);
  }

  /** Return a value even if stale; does not evict. Used by the BFF to survive 429s. */
  peek(key: string): V | undefined {
    return this.store.get(key)?.value;
  }

  /** False once `maxStaleMs` has passed after expiry. Unlimited caches stay true while the key exists. */
  isWithinStaleWindow(key: string, now = Date.now()): boolean {
    const hit = this.store.get(key);
    if (!hit) return false;
    const maxStale = this.options.maxStaleMs;
    if (maxStale == null) return true;
    return hit.expiresAt + maxStale > now;
  }

  hasFresh(key: string, now = Date.now()): boolean {
    return this.get(key, now) !== undefined;
  }

  set(key: string, value: V, ttlMs: number, now = Date.now()): void {
    this.prune(now);
    this.store.set(key, { value, expiresAt: now + ttlMs });
    this.evictOverflow(key, now);
  }

  /** Remove entries that are past the stale window. No-op when `maxStaleMs` is unset. */
  prune(now = Date.now()): void {
    const maxStale = this.options.maxStaleMs;
    if (maxStale == null) return;
    for (const [key, entry] of this.store) {
      if (entry.expiresAt + maxStale <= now) this.store.delete(key);
    }
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }

  private evictOverflow(keepKey: string, now: number): void {
    const max = this.options.maxEntries;
    if (max == null || this.store.size <= max) return;
    const ranked = [...this.store.entries()].filter(([key]) => key !== keepKey);
    ranked.sort((a, b) => {
      const aStale = a[1].expiresAt <= now ? 0 : 1;
      const bStale = b[1].expiresAt <= now ? 0 : 1;
      if (aStale !== bStale) return aStale - bStale;
      if (aStale === 0) return a[1].expiresAt - b[1].expiresAt;
      return b[1].expiresAt - a[1].expiresAt;
    });
    while (this.store.size > max && ranked.length > 0) {
      const next = ranked.shift();
      if (next) this.store.delete(next[0]);
    }
  }
}

export const FOOTBALL_TTL = {
  fixturesLiveMs: 45_000,
  fixturesIdleMs: 5 * 60_000,
  standingsMs: 5 * 60_000,
  scorersMs: 15 * 60_000,
  squadMs: 30 * 60_000,
  matchLiveMs: 30_000,
  matchDoneMs: 30 * 60_000,
  /** Player season block. Kept inside the 6–24h window so one open does not refetch all day. */
  playerSeasonMs: 12 * 60 * 60_000,
  /** Team season block. One origin read per club per day when Overview opens. */
  teamStatsMs: 24 * 60 * 60_000,
} as const;

export function fixturesTtlMs(hasLive: boolean): number {
  return hasLive ? FOOTBALL_TTL.fixturesLiveMs : FOOTBALL_TTL.fixturesIdleMs;
}

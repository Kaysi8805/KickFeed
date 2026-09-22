/** In-memory TTL cache for football API responses (fixtures, standings, squads). */
export class TtlCache<V> {
  private readonly store = new Map<string, { value: V; expiresAt: number }>();

  get(key: string, now = Date.now()): V | undefined {
    const hit = this.store.get(key);
    if (!hit || hit.expiresAt <= now) return undefined;
    return hit.value;
  }

  /** Return a value even if stale; does not evict. Used by the BFF to survive 429s. */
  peek(key: string): V | undefined {
    return this.store.get(key)?.value;
  }

  hasFresh(key: string, now = Date.now()): boolean {
    return this.get(key, now) !== undefined;
  }

  set(key: string, value: V, ttlMs: number, now = Date.now()): void {
    this.store.set(key, { value, expiresAt: now + ttlMs });
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
} as const;

export function fixturesTtlMs(hasLive: boolean): number {
  return hasLive ? FOOTBALL_TTL.fixturesLiveMs : FOOTBALL_TTL.fixturesIdleMs;
}

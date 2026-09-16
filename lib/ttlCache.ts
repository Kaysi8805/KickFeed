/** In-memory TTL cache for football API responses (fixtures, standings, squads). */
export class TtlCache<V> {
  private readonly store = new Map<string, { value: V; expiresAt: number }>();

  get(key: string, now = Date.now()): V | undefined {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (hit.expiresAt <= now) {
      this.store.delete(key);
      return undefined;
    }
    return hit.value;
  }

  /** Return a value even if stale; does not evict. */
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
} as const;

export function fixturesTtlMs(hasLive: boolean): number {
  return hasLive ? FOOTBALL_TTL.fixturesLiveMs : FOOTBALL_TTL.fixturesIdleMs;
}

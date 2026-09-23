/**
 * Matches tab date span: local calendar days, same day boundary as `isSameDay`.
 * API-Football still fetches a wider UTC `fixtureDateWindow`; this only filters the list.
 */

import type { Fixture } from '@/data/types';
import { isSameDay } from '@/lib/format';

export const MATCHES_LOOKBACK_DAYS = 5;
export const MATCHES_LOOKAHEAD_DAYS = 10;

export type MatchesListFilter = 'all' | 'live' | 'today' | 'upcoming';

/** Inclusive local dates `YYYY-MM-DD` from today−5 through today+10. */
export function matchesDateWindow(now = new Date()): { from: string; to: string } {
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - MATCHES_LOOKBACK_DAYS);
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate() + MATCHES_LOOKAHEAD_DAYS);
  return { from: localIsoDate(from), to: localIsoDate(to) };
}

export function localIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function kickoffInMatchesWindow(kickoff: string, now = new Date()): boolean {
  const ms = Date.parse(kickoff);
  if (!Number.isFinite(ms)) return false;
  const day = localIsoDate(new Date(ms));
  const { from, to } = matchesDateWindow(now);
  return day >= from && day <= to;
}

/** All filters stay inside the lookback/lookahead. `all` keeps results and upcoming fixtures. */
export function filterMatchesList(
  fixtures: Fixture[],
  filter: MatchesListFilter,
  now = new Date(),
): Fixture[] {
  const inWindow = fixtures.filter((fixture) => kickoffInMatchesWindow(fixture.kickoff, now));
  if (filter === 'all') return inWindow;
  if (filter === 'live') {
    return inWindow.filter((fixture) => fixture.status === 'live' || fixture.status === 'ht');
  }
  if (filter === 'today') return inWindow.filter((fixture) => isSameDay(fixture.kickoff, now));
  return inWindow.filter((fixture) => fixture.status === 'upcoming' && !isSameDay(fixture.kickoff, now));
}

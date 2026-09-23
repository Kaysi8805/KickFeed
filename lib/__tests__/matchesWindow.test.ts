import type { Fixture } from '@/data/types';
import { filterMatchesList, kickoffInMatchesWindow, matchesDateWindow } from '@/lib/matchesWindow';
import { mockFootballProvider } from '@/services/football';
import { describe, expect, it } from 'vitest';

const NOW = new Date(2026, 8, 16, 12, 0, 0);

function atLocalDay(dayOffset: number, hour = 15, minute = 0): string {
  return new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + dayOffset, hour, minute, 0).toISOString();
}

function fx(partial: Partial<Fixture> & Pick<Fixture, 'id' | 'kickoff'>): Fixture {
  return {
    leagueId: 'epl',
    homeTeamId: 'liv',
    awayTeamId: 'ars',
    status: 'upcoming',
    homeScore: 0,
    awayScore: 0,
    events: [],
    venue: 'Anfield',
    ...partial,
  };
}

describe('matchesDateWindow', () => {
  it('spans local today minus 5 through today plus 10, including month edges', () => {
    expect(matchesDateWindow(NOW)).toEqual({ from: '2026-09-11', to: '2026-09-26' });
    expect(matchesDateWindow(new Date(2026, 0, 3, 12, 0, 0))).toEqual({
      from: '2025-12-29',
      to: '2026-01-13',
    });
  });

  it('includes kickoff on the first and last local days and drops the days outside', () => {
    const first = new Date(2026, 8, 11, 0, 0, 0, 0).toISOString();
    const justBefore = new Date(new Date(2026, 8, 11, 0, 0, 0, 0).getTime() - 1).toISOString();
    const last = new Date(2026, 8, 26, 23, 59, 59, 999).toISOString();
    const justAfter = new Date(2026, 8, 27, 0, 0, 0, 0).toISOString();
    expect(kickoffInMatchesWindow(first, NOW)).toBe(true);
    expect(kickoffInMatchesWindow(justBefore, NOW)).toBe(false);
    expect(kickoffInMatchesWindow(last, NOW)).toBe(true);
    expect(kickoffInMatchesWindow(justAfter, NOW)).toBe(false);
    expect(kickoffInMatchesWindow('not-a-date', NOW)).toBe(false);
  });
});

describe('filterMatchesList', () => {
  const finishedLookback = fx({
    id: 'ft-5',
    kickoff: atLocalDay(-5),
    status: 'finished',
    homeScore: 2,
    awayScore: 1,
  });
  const stale = fx({
    id: 'ft-6',
    kickoff: atLocalDay(-6),
    status: 'finished',
    homeScore: 1,
    awayScore: 0,
  });
  const live = fx({ id: 'live', kickoff: atLocalDay(0, 12), status: 'live', minute: 22, homeScore: 1, awayScore: 0 });
  const todayUpcoming = fx({ id: 'today-next', kickoff: atLocalDay(0, 20), status: 'upcoming' });
  const ahead = fx({ id: 'ahead-10', kickoff: atLocalDay(10), status: 'upcoming' });
  const tooFar = fx({ id: 'ahead-11', kickoff: atLocalDay(11), status: 'upcoming' });
  const fixtures = [stale, finishedLookback, live, todayUpcoming, ahead, tooFar];

  it('shows past results and upcoming fixtures inside the window, and nothing outside it', () => {
    const all = filterMatchesList(fixtures, 'all', NOW);
    expect(all.map((fixture) => fixture.id)).toEqual(['ft-5', 'live', 'today-next', 'ahead-10']);
    expect(all.some((fixture) => fixture.status === 'finished')).toBe(true);
    expect(all.some((fixture) => fixture.status === 'upcoming')).toBe(true);
    expect(all.map((fixture) => fixture.id)).not.toContain('ft-6');
    expect(all.map((fixture) => fixture.id)).not.toContain('ahead-11');
  });

  it('keeps Live, Today, and Upcoming inside the same window', () => {
    expect(filterMatchesList(fixtures, 'live', NOW).map((fixture) => fixture.id)).toEqual(['live']);
    expect(filterMatchesList(fixtures, 'today', NOW).map((fixture) => fixture.id)).toEqual(['live', 'today-next']);
    expect(filterMatchesList(fixtures, 'upcoming', NOW).map((fixture) => fixture.id)).toEqual(['ahead-10']);
  });

  it('keeps seeded mock results and upcoming fixtures, which already sit inside the span', () => {
    const catalog = mockFootballProvider.getFixtures();
    const shown = filterMatchesList(catalog, 'all');
    expect(shown.map((fixture) => fixture.id).sort()).toEqual(catalog.map((fixture) => fixture.id).sort());
    expect(shown.some((fixture) => fixture.status === 'finished')).toBe(true);
    expect(shown.some((fixture) => fixture.status === 'upcoming')).toBe(true);
  });
});

import type { Fixture } from '@/data/types';
import {
  filterMatchesOnDay,
  kickoffLocalIso,
  kickoffOnDay,
  matchDayRelation,
  matchDayStrip,
  matchesDateWindow,
  todayMatchDay,
} from '@/lib/matchesWindow';
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

describe('matchDayStrip', () => {
  it('defaults to local today and spans today minus 5 through today plus 10', () => {
    expect(todayMatchDay(NOW)).toBe('2026-09-16');
    expect(matchesDateWindow(NOW)).toEqual({ from: '2026-09-11', to: '2026-09-26' });
    const days = matchDayStrip(NOW);
    expect(days).toHaveLength(16);
    expect(days[0]?.iso).toBe('2026-09-11');
    expect(days[days.length - 1]?.iso).toBe('2026-09-26');
    expect(days.filter((day) => day.relation === 'today').map((day) => day.iso)).toEqual(['2026-09-16']);
    expect(days.find((day) => day.iso === '2026-09-16')?.weekday).toBe('Today');
    expect(days.find((day) => day.iso === '2026-09-15')?.accessibilityLabel).toMatch(/^Yesterday, /);
    expect(days.find((day) => day.iso === '2026-09-17')?.accessibilityLabel).toMatch(/^Tomorrow, /);
  });

  it('crosses month edges on the local calendar', () => {
    const now = new Date(2026, 0, 3, 12, 0, 0);
    expect(matchesDateWindow(now)).toEqual({ from: '2025-12-29', to: '2026-01-13' });
    expect(matchDayRelation('2026-01-03', now)).toBe('today');
    expect(matchDayRelation('2026-01-02', now)).toBe('yesterday');
    expect(matchDayRelation('2026-01-04', now)).toBe('tomorrow');
  });
});

describe('filterMatchesOnDay', () => {
  const yesterdayFt = fx({
    id: 'yday',
    kickoff: atLocalDay(-1, 18),
    status: 'finished',
    homeScore: 2,
    awayScore: 1,
  });
  const todayFinished = fx({
    id: 'today-ft',
    kickoff: atLocalDay(0, 1),
    status: 'finished',
    homeScore: 0,
    awayScore: 0,
  });
  const todayLive = fx({
    id: 'today-live',
    kickoff: atLocalDay(0, 12),
    status: 'live',
    minute: 22,
    homeScore: 1,
    awayScore: 0,
  });
  const todayUpcoming = fx({ id: 'today-next', kickoff: atLocalDay(0, 20), status: 'upcoming' });
  const tomorrow = fx({ id: 'tmrw', kickoff: atLocalDay(1, 15), status: 'upcoming' });
  const outside = fx({ id: 'far', kickoff: atLocalDay(11), status: 'upcoming' });
  const fixtures = [yesterdayFt, todayFinished, todayLive, todayUpcoming, tomorrow, outside];

  it('keeps only kickoffs on the selected local day', () => {
    expect(filterMatchesOnDay(fixtures, '2026-09-15').map((fixture) => fixture.id)).toEqual(['yday']);
    expect(filterMatchesOnDay(fixtures, '2026-09-16').map((fixture) => fixture.id)).toEqual([
      'today-ft',
      'today-live',
      'today-next',
    ]);
    expect(filterMatchesOnDay(fixtures, '2026-09-17').map((fixture) => fixture.id)).toEqual(['tmrw']);
    expect(matchDayStrip(NOW).some((day) => day.iso === '2026-09-27')).toBe(false);
    expect(filterMatchesOnDay(fixtures, '2026-09-27').map((fixture) => fixture.id)).toEqual(['far']);
    expect(filterMatchesOnDay(fixtures, '2026-09-10')).toEqual([]);
    expect(filterMatchesOnDay(fixtures, 'not-a-day')).toEqual([]);
  });

  it('uses the local midnight boundary, including the first and last minute of the day', () => {
    const first = new Date(2026, 8, 16, 0, 0, 0, 0).toISOString();
    const justBefore = new Date(new Date(2026, 8, 16, 0, 0, 0, 0).getTime() - 1).toISOString();
    const last = new Date(2026, 8, 16, 23, 59, 59, 999).toISOString();
    expect(kickoffOnDay(first, '2026-09-16')).toBe(true);
    expect(kickoffOnDay(justBefore, '2026-09-16')).toBe(false);
    expect(kickoffOnDay(justBefore, '2026-09-15')).toBe(true);
    expect(kickoffOnDay(last, '2026-09-16')).toBe(true);
    expect(kickoffLocalIso('not-a-date')).toBeNull();
    expect(kickoffOnDay('not-a-date', '2026-09-16')).toBe(false);
  });

  it('leaves status and scores untouched so a past day cannot invent a result', () => {
    const shown = filterMatchesOnDay(fixtures, '2026-09-15');
    expect(shown[0]).toBe(yesterdayFt);
    expect(shown[0]?.status).toBe('finished');
    expect(shown[0]?.homeScore).toBe(2);
    expect(shown[0]?.awayScore).toBe(1);
    const upcoming = filterMatchesOnDay(fixtures, '2026-09-17')[0];
    expect(upcoming?.status).toBe('upcoming');
    expect(upcoming?.homeScore).toBe(0);
    expect(upcoming?.awayScore).toBe(0);
  });

  it('puts every seeded mock kickoff on a strip day, and selecting that day returns it alone', () => {
    const catalog = mockFootballProvider.getFixtures();
    const strip = new Set(matchDayStrip().map((day) => day.iso));
    expect(catalog.length).toBeGreaterThan(0);
    for (const fixture of catalog) {
      const day = kickoffLocalIso(fixture.kickoff);
      expect(day).not.toBeNull();
      expect(strip.has(day!)).toBe(true);
      const onDay = filterMatchesOnDay(catalog, day!);
      expect(onDay.every((row) => kickoffLocalIso(row.kickoff) === day)).toBe(true);
      expect(onDay.map((row) => row.id)).toContain(fixture.id);
    }
    const today = todayMatchDay();
    const yesterday = matchDayStrip().find((day) => day.relation === 'yesterday')!.iso;
    const tomorrowDay = matchDayStrip().find((day) => day.relation === 'tomorrow')!.iso;
    const todayIds = new Set(filterMatchesOnDay(catalog, today).map((fixture) => fixture.id));
    for (const fixture of filterMatchesOnDay(catalog, yesterday)) {
      expect(todayIds.has(fixture.id)).toBe(false);
    }
    for (const fixture of filterMatchesOnDay(catalog, tomorrowDay)) {
      expect(todayIds.has(fixture.id)).toBe(false);
    }
  });
});

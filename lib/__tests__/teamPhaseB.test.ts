import type { Fixture, Lineup, TeamSeasonStats } from '@/data/types';
import { teams } from '@/data/mocks/catalog';
import { leagueRosters } from '@/data/mocks/catalog';
import { teamStatsFor } from '@/data/mocks/teamStats';
import { cachedCoach, cachedHomeVenue, displayedCoach, presentTeamSeason, seasonStatsHasSignal } from '@/lib/teamPhaseB';
import { describe, expect, it } from 'vitest';

function fx(partial: Partial<Fixture> & Pick<Fixture, 'id' | 'kickoff'>): Fixture {
  return {
    leagueId: '39',
    homeTeamId: '40',
    awayTeamId: '42',
    status: 'finished',
    homeScore: 1,
    awayScore: 0,
    events: [],
    venue: 'Anfield, Liverpool',
    ...partial,
  };
}

const empty = (): Lineup => ({ formation: '—', players: [] });

describe('presentTeamSeason', () => {
  const stats: TeamSeasonStats = {
    teamId: '40',
    leagueId: '39',
    season: 2026,
    form: ['W', 'D', 'L', 'W', 'W', 'D', 'L', 'W', 'W', 'D'],
    played: { home: 10, away: 9, total: 19 },
    wins: { home: 7, away: 4, total: 11 },
    draws: { home: 2, away: 3, total: 5 },
    losses: { home: 1, away: 2, total: 3 },
    goalsForAverage: { total: 1.8 },
    goalsAgainstAverage: { total: 1 },
    cleanSheets: { total: 7 },
    failedToScore: { total: 4 },
    formation: '4-3-3',
  };

  it('shows averages, clean sheets, and home/away records without inventing missing sides', () => {
    expect(presentTeamSeason(stats)).toEqual({
      chips: [
        { label: 'GF/g', value: '1.8' },
        { label: 'GA/g', value: '1.0' },
        { label: 'CS', value: '7' },
        { label: 'Failed', value: '4' },
      ],
      homeRecord: '7-2-1',
      awayRecord: '4-3-2',
      form: ['L', 'W', 'W', 'D', 'L', 'W', 'W', 'D'],
      formation: '4-3-3',
    });
  });

  it('drops a record side when the payload omitted a result', () => {
    const partial: TeamSeasonStats = {
      ...stats,
      wins: { total: 11 },
      goalsForAverage: undefined,
      goalsAgainstAverage: undefined,
      failedToScore: undefined,
      formation: undefined,
      form: [],
    };
    const view = presentTeamSeason(partial);
    expect(view.chips).toEqual([{ label: 'CS', value: '7' }]);
    expect(view.homeRecord).toBeUndefined();
    expect(view.awayRecord).toBeUndefined();
    expect(view.form).toEqual([]);
    expect(view.formation).toBeUndefined();
  });

  it('treats an all-zero presentation as empty', () => {
    const blank = presentTeamSeason({
      teamId: '40',
      leagueId: '39',
      season: 2026,
      form: [],
      played: { home: 0, away: 0, total: 0 },
      wins: { home: 0, away: 0, total: 0 },
      draws: { home: 0, away: 0, total: 0 },
      losses: { home: 0, away: 0, total: 0 },
      goalsForAverage: { total: 0 },
      goalsAgainstAverage: { total: 0 },
      cleanSheets: { total: 0 },
      failedToScore: { total: 0 },
    });
    expect(seasonStatsHasSignal(blank)).toBe(false);
    expect(seasonStatsHasSignal(presentTeamSeason(stats))).toBe(true);
  });
});

describe('cached venue and coach', () => {
  it('uses the most common real home ground and skips placeholders', () => {
    const fixtures = [
      fx({ id: 'a', kickoff: '2026-08-01T15:00:00Z', venue: 'Anfield, Liverpool' }),
      fx({ id: 'b', kickoff: '2026-08-08T15:00:00Z', venue: 'Anfield, Liverpool' }),
      fx({ id: 'c', kickoff: '2026-08-15T15:00:00Z', venue: 'TBD' }),
      fx({ id: 'd', kickoff: '2026-08-22T15:00:00Z', homeTeamId: '42', awayTeamId: '40', venue: 'Emirates Stadium' }),
      fx({ id: 'e', kickoff: '2026-08-29T15:00:00Z', venue: 'Home stadium' }),
    ];
    expect(cachedHomeVenue(fixtures, '40')).toBe('Anfield, Liverpool');
    expect(cachedHomeVenue(fixtures, '42')).toBe('Emirates Stadium');
    expect(cachedHomeVenue([fx({ id: 'z', kickoff: '2026-08-01T15:00:00Z', venue: 'TBD' })], '40')).toBeUndefined();
  });

  it('reads a coach only from a lineup already in hand', () => {
    const older = fx({ id: 'older', kickoff: '2026-08-01T15:00:00Z' });
    const newer = fx({ id: 'newer', kickoff: '2026-09-01T15:00:00Z', homeTeamId: '42', awayTeamId: '40' });
    const coach = cachedCoach([older, newer], '40', (fixture) => {
      if (fixture.id === 'older') return { home: { formation: '4-3-3', players: [], coach: 'Earlier' }, away: empty() };
      if (fixture.id === 'newer') return { home: empty(), away: { formation: '4-3-3', players: [], coach: ' Arne Slot ' } };
      return { home: empty(), away: empty() };
    });
    expect(coach).toBe('Arne Slot');
    expect(cachedCoach([older], '40', () => ({ home: empty(), away: empty() }))).toBeUndefined();
  });

  it('prefers a statistics-payload coach over a cached lineup', () => {
    expect(displayedCoach('Arne Slot', 'Earlier')).toBe('Arne Slot');
    expect(displayedCoach('  ', 'Cached')).toBe('Cached');
    expect(displayedCoach(undefined, ' Cached ')).toBe('Cached');
    expect(displayedCoach(undefined, '  ')).toBeUndefined();
  });
});

describe('mock team stats', () => {
  it('gives every rostered catalog club a consistent season block', () => {
    const rostered = new Set(Object.values(leagueRosters).flat());
    for (const team of teams) {
      if (!rostered.has(team.id)) continue;
      const stats = teamStatsFor(team.id);
      expect(stats, team.id).toBeTruthy();
      const played = stats!.played!;
      const wins = stats!.wins!;
      const draws = stats!.draws!;
      const losses = stats!.losses!;
      expect(wins.home! + wins.away!).toBe(wins.total);
      expect(draws.home! + draws.away!).toBe(draws.total);
      expect(losses.home! + losses.away!).toBe(losses.total);
      expect(wins.home! + draws.home! + losses.home!).toBe(played.home);
      expect(wins.away! + draws.away! + losses.away!).toBe(played.away);
      expect((wins.away ?? 0) >= 0 && (draws.away ?? 0) >= 0 && (losses.away ?? 0) >= 0).toBe(true);
      expect(stats!.cleanSheets!.total!).toBeLessThanOrEqual(played.total!);
      expect(stats!.goalsForAverage?.total).toBeCloseTo(stats!.goalsFor!.total! / played.total!, 1);
      expect(stats!.form.length).toBeGreaterThanOrEqual(5);
      expect(stats!.formation).toBeTruthy();
    }
  });

  it('names grounds for the clubs Expo Go opens first', () => {
    expect(teamStatsFor('liv')?.venue).toBe('Anfield');
    expect(teamStatsFor('ars')?.venue).toBe('Emirates Stadium');
    expect(teamStatsFor('slovan')?.venue).toBe('Tehelné pole');
    expect(teamStatsFor('rma')?.venue).toBe('Santiago Bernabéu');
    expect(teamStatsFor('bar')?.venue).toBe('Camp Nou');
    expect(teamStatsFor('bay')?.venue).toBe('Allianz Arena');
    expect(teamStatsFor('syd')?.venue).toBe('Allianz Stadium');
    expect(teamStatsFor('no-such-club')).toBeUndefined();
  });
});

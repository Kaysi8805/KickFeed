import type { Fixture, Lineup, Scorer, StandingRow } from '@/data/types';
import { lastCachedXi, recentTeamForm, seasonSummary, teamChart } from '@/lib/teamPhaseA';
import { describe, expect, it } from 'vitest';

function fx(partial: Partial<Fixture> & Pick<Fixture, 'id' | 'kickoff' | 'status'>): Fixture {
  return {
    leagueId: 'epl',
    homeTeamId: 'liv',
    awayTeamId: 'ars',
    homeScore: 0,
    awayScore: 0,
    events: [],
    venue: 'Anfield',
    ...partial,
  };
}

const emptyLineup = (): Lineup => ({ formation: '—', players: [] });

describe('recentTeamForm', () => {
  const fixtures: Fixture[] = [
    fx({ id: 'old', kickoff: '2026-08-01T15:00:00Z', status: 'finished', homeScore: 1, awayScore: 0 }),
    fx({ id: 'draw', kickoff: '2026-08-08T15:00:00Z', status: 'finished', homeTeamId: 'ars', awayTeamId: 'liv', homeScore: 1, awayScore: 1 }),
    fx({ id: 'loss', kickoff: '2026-08-15T15:00:00Z', status: 'finished', homeScore: 0, awayScore: 2 }),
    fx({ id: 'win-away', kickoff: '2026-08-22T15:00:00Z', status: 'finished', homeTeamId: 'mci', awayTeamId: 'liv', homeScore: 1, awayScore: 3 }),
    fx({ id: 'latest', kickoff: '2026-08-29T15:00:00Z', status: 'finished', homeScore: 2, awayScore: 2 }),
    fx({ id: 'sixth', kickoff: '2026-09-05T15:00:00Z', status: 'finished', homeScore: 4, awayScore: 0 }),
    fx({ id: 'live', kickoff: '2026-09-12T15:00:00Z', status: 'live', homeScore: 1, awayScore: 0 }),
    fx({ id: 'next', kickoff: '2026-09-19T15:00:00Z', status: 'upcoming', homeScore: 0, awayScore: 0 }),
    fx({ id: 'other', kickoff: '2026-09-05T12:00:00Z', status: 'finished', homeTeamId: 'che', awayTeamId: 'tot', homeScore: 1, awayScore: 0 }),
  ];

  it('keeps the last five finished results for the club, oldest first', () => {
    expect(recentTeamForm(fixtures, 'liv').map((chip) => [chip.fixtureId, chip.result, chip.goalsFor, chip.goalsAgainst])).toEqual([
      ['draw', 'D', 1, 1],
      ['loss', 'L', 0, 2],
      ['win-away', 'W', 3, 1],
      ['latest', 'D', 2, 2],
      ['sixth', 'W', 4, 0],
    ]);
  });

  it('returns an empty strip when nothing is finished', () => {
    expect(recentTeamForm([fx({ id: 'next', kickoff: '2026-09-19T15:00:00Z', status: 'upcoming' })], 'liv')).toEqual([]);
  });
});

describe('seasonSummary', () => {
  it('maps the standings row into P W D L GF GA Pts', () => {
    const row: StandingRow = {
      teamId: 'liv',
      played: 6,
      won: 4,
      drawn: 1,
      lost: 1,
      gf: 12,
      ga: 5,
      points: 13,
      form: ['W', 'D', 'L'],
    };
    expect(seasonSummary(row)).toEqual([
      { label: 'P', value: 6 },
      { label: 'W', value: 4 },
      { label: 'D', value: 1 },
      { label: 'L', value: 1 },
      { label: 'GF', value: 12 },
      { label: 'GA', value: 5 },
      { label: 'Pts', value: 13 },
    ]);
    expect(seasonSummary(undefined)).toBeUndefined();
  });

  it('skips an all-zero standings row instead of a zero grid', () => {
    const empty: StandingRow = {
      teamId: 'liv',
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      gf: 0,
      ga: 0,
      points: 0,
      form: [],
    };
    expect(seasonSummary(empty)).toBeUndefined();
  });
});

describe('teamChart', () => {
  const scorers: Scorer[] = [
    { id: 'a', playerName: 'Salah', playerId: 'p1', teamId: 'liv', goals: 8, assists: 3 },
    { id: 'b', playerName: 'Diaz', playerId: 'p2', teamId: 'liv', goals: 4, assists: 0 },
    { id: 'c', playerName: 'Haaland', playerId: 'p3', teamId: 'mci', goals: 10, assists: 1 },
    { id: 'd', playerName: 'Szoboszlai', playerId: 'p4', teamId: '40', goals: 2, assists: 5 },
  ];

  it('filters the cached scorer list to this club and sorts assists only when present', () => {
    const chart = teamChart(scorers, ['liv', '40']);
    expect(chart.scorers.map((row) => row.playerName)).toEqual(['Salah', 'Diaz', 'Szoboszlai']);
    expect(chart.assists.map((row) => row.playerName)).toEqual(['Szoboszlai', 'Salah']);
  });

  it('omits an assist list when the cached rows have none', () => {
    expect(teamChart([{ id: 'b', playerName: 'Diaz', teamId: 'liv', goals: 4, assists: 0 }], ['liv']).assists).toEqual([]);
  });
});

describe('lastCachedXi', () => {
  const older = fx({ id: 'older', kickoff: '2026-08-01T15:00:00Z', status: 'finished' });
  const newer = fx({ id: 'newer', kickoff: '2026-09-01T15:00:00Z', status: 'finished', homeTeamId: 'ars', awayTeamId: 'liv' });
  const upcoming = fx({ id: 'next', kickoff: '2026-09-12T15:00:00Z', status: 'upcoming' });

  it('uses the newest finished fixture that actually has a cached XI', () => {
    const xi = lastCachedXi([older, newer, upcoming], 'liv', (fixture) => {
      if (fixture.id === 'older') {
        return {
          home: { formation: '4-3-3', players: [{ name: 'Salah', number: 11, pos: 'FW', playerId: 'p1' }] },
          away: emptyLineup(),
        };
      }
      if (fixture.id === 'newer') {
        return {
          home: emptyLineup(),
          away: { formation: '4-2-3-1', players: [{ name: 'Alisson', number: 1, pos: 'GK', playerId: 'p9' }] },
        };
      }
      return { home: emptyLineup(), away: emptyLineup() };
    });
    expect(xi).toMatchObject({ fixtureId: 'newer', formation: '4-2-3-1', players: [expect.objectContaining({ name: 'Alisson' })] });
  });

  it('stays empty when every finished lineup is a cache miss', () => {
    expect(lastCachedXi([older, newer], 'liv', () => ({ home: emptyLineup(), away: emptyLineup() }))).toBeUndefined();
  });
});

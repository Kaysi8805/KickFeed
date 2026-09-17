import { seedMotmVotes, seedPredictions } from '@/data/mocks/engagement';
import type { Fixture, MotmVote, ScorePrediction, User } from '@/data/types';
import {
  LEADERBOARD_TOP_N,
  POINTS_EXACT,
  POINTS_MOTM,
  POINTS_RESULT,
  breakdownLine,
  filterMatchesByLeague,
  finishedMatches,
  leaderboardSource,
  rankLeaderboard,
  scorePredictionPoints,
  shouldPersistLeaderboard,
  uniqueMotmWinner,
} from '@/lib/leaderboard';
import { relatedFixtureIds } from '@/lib/matchSocial';
import { mockFootballProvider } from '@/services/football';
import { describe, expect, it } from 'vitest';

const UUID = '33333333-3333-4333-8333-333333333333';

function match(partial: Partial<Fixture> & Pick<Fixture, 'id' | 'leagueId' | 'homeScore' | 'awayScore'>): Fixture {
  return {
    homeTeamId: 'h',
    awayTeamId: 'a',
    kickoff: '2026-09-01T12:00:00.000Z',
    status: 'finished',
    events: [],
    venue: 'Test',
    ...partial,
  };
}

function pred(matchId: string, userId: string, homeScore: number, awayScore: number): ScorePrediction {
  return {
    matchId,
    userId,
    homeScore,
    awayScore,
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
  };
}

function vote(matchId: string, userId: string, playerKey: string, playerName = playerKey): MotmVote {
  return {
    matchId,
    userId,
    playerKey,
    playerName,
    teamId: 'h',
    createdAt: '2026-09-01T13:00:00.000Z',
  };
}

function fan(id: string, name: string, handle: string): User {
  return {
    id,
    name,
    handle,
    bio: '',
    avatarColor: '#22C55E',
    initials: name.slice(0, 2).toUpperCase(),
    favoriteTeamIds: [],
    favoriteLeagueIds: [],
  };
}

const users = [
  fan('maya', 'Maya Chen', 'mayagoals'),
  fan('omar', 'Omar Haddad', 'madridista_o'),
  fan(UUID, 'Live Fan', 'live_fan'),
];

describe('leaderboard source', () => {
  it('uses local demo ranks unless a supabase session is live', () => {
    expect(leaderboardSource(false, 'demo')).toBe('demo');
    expect(leaderboardSource(false, 'supabase')).toBe('demo');
    expect(leaderboardSource(true, 'demo')).toBe('demo');
    expect(leaderboardSource(true, null)).toBe('demo');
    expect(leaderboardSource(true, 'supabase')).toBe('live');
    expect(shouldPersistLeaderboard(true, 'supabase')).toBe(true);
    expect(shouldPersistLeaderboard(true, 'demo')).toBe(false);
    expect(shouldPersistLeaderboard(false, 'supabase')).toBe(false);
  });
});

describe('prediction points', () => {
  const ft = { homeScore: 2, awayScore: 1 };

  it('awards exact, result, or miss', () => {
    expect(scorePredictionPoints({ homeScore: 2, awayScore: 1 }, ft)).toEqual({
      points: POINTS_EXACT,
      exact: true,
      resultHit: true,
    });
    expect(scorePredictionPoints({ homeScore: 3, awayScore: 0 }, ft)).toEqual({
      points: POINTS_RESULT,
      exact: false,
      resultHit: true,
    });
    expect(scorePredictionPoints({ homeScore: 1, awayScore: 1 }, ft)).toEqual({
      points: 0,
      exact: false,
      resultHit: false,
    });
  });
});

describe('MOTM unique winner', () => {
  it('returns the unique leader and null on a tie', () => {
    expect(uniqueMotmWinner([vote('m1', 'omar', 'p1'), vote('m1', 'luca', 'p1'), vote('m1', 'maya', 'p2')])).toBe('p1');
    expect(uniqueMotmWinner([vote('m1', 'omar', 'p1'), vote('m1', 'luca', 'p2')])).toBeNull();
    expect(uniqueMotmWinner([])).toBeNull();
  });
});

describe('rankLeaderboard', () => {
  const matches = [
    {
      id: 'm-epl',
      leagueId: 'epl',
      relatedIds: ['m-epl', '9001'],
      homeScore: 2,
      awayScore: 1,
    },
    {
      id: 'm-ita',
      leagueId: 'seriea',
      relatedIds: ['m-ita'],
      homeScore: 0,
      awayScore: 1,
    },
  ];

  it('ranks demo ids and supabase uuids on the same board', () => {
    const board = rankLeaderboard({
      predictions: [
        pred('m-epl', 'omar', 2, 1),
        pred('9001', UUID, 2, 0),
        pred('m-epl', 'maya', 1, 1),
        pred('m-ita', 'omar', 0, 1),
      ],
      motmVotes: [vote('m-epl', 'omar', 'salah'), vote('9001', UUID, 'salah'), vote('m-epl', 'maya', 'saka')],
      matches,
      users,
      currentUserId: UUID,
      source: 'live',
    });

    expect(board.top[0]?.userId).toBe('omar');
    expect(board.top[0]?.points).toBe(POINTS_EXACT + POINTS_EXACT + POINTS_MOTM);
    expect(board.top[1]?.userId).toBe(UUID);
    expect(board.top[1]?.points).toBe(POINTS_RESULT + POINTS_MOTM);
    expect(board.current?.userId).toBe(UUID);
    expect(board.current?.rank).toBe(2);
    expect(board.current?.isCurrentUser).toBe(true);
    expect(board.top.some((row) => row.userId === 'maya')).toBe(true);
  });

  it('treats related mock/live match ids as one scored fixture', () => {
    const aliasOnly = rankLeaderboard({
      predictions: [pred('m-epl', 'omar', 2, 1), pred('9001', 'omar', 0, 0)],
      motmVotes: [],
      matches: [matches[0]!],
      users,
      currentUserId: 'omar',
    });
    expect(aliasOnly.current?.scoredMatches).toBe(1);
    expect(aliasOnly.current?.exactCount).toBe(1);
    expect(aliasOnly.current?.points).toBe(POINTS_EXACT);
  });

  it('keeps the current user when they sit outside top N', () => {
    const predictions = [
      pred('m-epl', 'omar', 2, 1),
      pred('m-epl', 'maya', 1, 1),
      pred('m-ita', 'omar', 0, 1),
    ];
    const board = rankLeaderboard({
      predictions,
      motmVotes: [],
      matches,
      users,
      currentUserId: 'maya',
      topN: 1,
    });
    expect(board.top).toHaveLength(1);
    expect(board.top[0]?.userId).toBe('omar');
    expect(board.current?.userId).toBe('maya');
    expect(board.current?.rank).toBeGreaterThan(1);
    expect(board.topN).toBe(1);
  });

  it('filters per league via related league ids', () => {
    const eplOnly = filterMatchesByLeague(matches, 'epl', ['epl', '39']);
    const board = rankLeaderboard({
      predictions: [pred('m-epl', 'omar', 2, 1), pred('m-ita', 'omar', 0, 1)],
      motmVotes: [],
      matches: eplOnly,
      users,
      leagueId: 'epl',
    });
    expect(board.current).toBeNull();
    expect(board.top[0]?.scoredMatches).toBe(1);
    expect(filterMatchesByLeague(matches, '39', ['epl', '39'])).toHaveLength(1);
  });

  it('skips MOTM points when includeMotm is false', () => {
    const withBonus = rankLeaderboard({
      predictions: [pred('m-epl', 'omar', 1, 1)],
      motmVotes: [vote('m-epl', 'omar', 'salah'), vote('m-epl', 'maya', 'salah')],
      matches: [matches[0]!],
      users,
      currentUserId: 'omar',
    });
    const scoresOnly = rankLeaderboard({
      predictions: [pred('m-epl', 'omar', 1, 1)],
      motmVotes: [vote('m-epl', 'omar', 'salah')],
      matches: [matches[0]!],
      users,
      currentUserId: 'omar',
      includeMotm: false,
    });
    expect(withBonus.current?.motmCount).toBe(1);
    expect(scoresOnly.current?.motmCount).toBe(0);
    expect(scoresOnly.current?.points).toBe(0);
  });

  it('builds a short breakdown line', () => {
    expect(
      breakdownLine({ scoredMatches: 2, exactCount: 1, resultCount: 1, motmCount: 1 }),
    ).toBe('2 matches · 1 exact · 1 result · 1 MOTM');
  });
});

describe('finished catalog matches', () => {
  it('collapses alias ids and ignores live/upcoming rows', () => {
    const fixtures: Fixture[] = [
      match({ id: '9001', leagueId: '39', homeScore: 2, awayScore: 1, status: 'finished' }),
      match({ id: 'fx-liv-ars', leagueId: 'epl', homeScore: 2, awayScore: 1, status: 'finished' }),
      match({ id: 'live', leagueId: 'epl', homeScore: 1, awayScore: 0, status: 'live' }),
    ];
    const scored = finishedMatches(fixtures, (id) =>
      id === '9001' || id === 'fx-liv-ars' ? ['9001', 'fx-liv-ars'] : [id],
    );
    expect(scored).toHaveLength(1);
    expect(scored[0]?.relatedIds).toEqual(expect.arrayContaining(['9001', 'fx-liv-ars']));
  });

  it('scores seed community picks on a finished mock fixture', () => {
    const fixture = mockFootballProvider.getFixture('fx-ful-eve');
    expect(fixture?.status).toBe('finished');
    expect(fixture?.homeScore).toBe(2);
    expect(fixture?.awayScore).toBe(1);
    const matches = finishedMatches(mockFootballProvider.getFixtures(), (id) =>
      relatedFixtureIds(mockFootballProvider, id),
    );
    const board = rankLeaderboard({
      predictions: seedPredictions,
      motmVotes: seedMotmVotes,
      matches: filterMatchesByLeague(matches, 'epl', ['epl']),
      users: [
        fan('omar', 'Omar Haddad', 'madridista_o'),
        fan('luca', 'Luca Bianchi', 'luca_inter'),
        fan('sophie', 'Sophie Keller', 'mia_san_mia'),
        fan('jordan', 'Jordan Blake', 'ynwa_jb'),
        fan('diego', 'Diego Vargas', 'mengao'),
        fan('aisha', 'Aisha Okonkwo', 'aisha_on_tour'),
        fan('maya', 'Maya Chen', 'mayagoals'),
      ],
      currentUserId: 'maya',
      leagueId: 'epl',
    });
    expect(board.totalRanked).toBeGreaterThan(0);
    expect(board.current).toBeNull();
    expect(board.top[0]?.points).toBeGreaterThan(0);
    expect(LEADERBOARD_TOP_N).toBe(10);
  });
});

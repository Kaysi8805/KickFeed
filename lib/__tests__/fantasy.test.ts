import { describe, expect, it } from 'vitest';

import type { PlayerPosition, User } from '@/data/types';
import {
  canAddPosition,
  cleanInviteCode,
  deadlineCountdown,
  fantasyEventFetchIds,
  fantasyInviteLink,
  fantasyInviteMessage,
  joinFantasyLeague,
  parseFantasyLeague,
  rankFantasyLeague,
  saveFantasyPick,
  scoreFantasyXi,
  selectGameweek,
  validateXi,
  type FantasyFixtureRef,
  type FantasySlot,
  type FantasySnapshot,
} from '@/lib/fantasy';
import {
  FANTASY_LIVE_COPY,
  FANTASY_NOT_GAMBLING,
  FANTASY_SCORING_RULES,
  FANTASY_SIGN_IN_COPY,
  fantasyDisclaimer,
  fantasyErrorMessage,
} from '@/lib/honesty';
import {
  createRemoteFantasyLeague,
  fetchRemoteFantasy,
  upsertRemoteFantasyPick,
  upsertRemoteFantasyPoints,
  type FantasyClient,
} from '@/services/fantasyRemote';

const NOW = new Date('2026-09-23T12:00:00.000Z');
const ROUND = 'Regular Season - 8';
const MAYA = '11111111-1111-4111-8111-111111111111';
const JORDAN = '22222222-2222-4222-8222-222222222222';

function slot(index: number, pos: PlayerPosition, teamId = `c${index % 4}`): FantasySlot {
  return { pos, playerId: `p${index}`, playerName: `Player ${index}`, teamId, number: index };
}

/** 1 GK, 4 DEF, 4 MID, 2 FWD. Clubs cycle so none has more than 3. */
function validXi(): FantasySlot[] {
  const positions: PlayerPosition[] = ['GK', 'DF', 'DF', 'DF', 'DF', 'MF', 'MF', 'MF', 'MF', 'FW', 'FW'];
  return positions.map((pos, index) => slot(index + 1, pos));
}

function fixture(partial: Partial<FantasyFixtureRef> & Pick<FantasyFixtureRef, 'id' | 'kickoff' | 'status'>): FantasyFixtureRef {
  return {
    leagueId: '39',
    season: 2026,
    round: ROUND,
    homeTeamId: 'h',
    awayTeamId: 'a',
    events: [],
    ...partial,
  };
}

function user(id: string, name: string): User {
  return {
    id,
    name,
    handle: name.toLowerCase(),
    initials: name.slice(0, 2).toUpperCase(),
    avatarColor: '#22C55E',
    bio: '',
    favoriteTeamIds: [],
    favoriteLeagueIds: [],
  };
}

describe('fantasy rounds', () => {
  it('picks the round whose next not-started kickoff is soonest', () => {
    const fixtures = [
      fixture({ id: 'old', round: 'Regular Season - 7', kickoff: '2026-09-20T15:00:00.000Z', status: 'finished' }),
      fixture({ id: 'late', round: 'Regular Season - 9', kickoff: '2026-10-04T15:00:00.000Z', status: 'upcoming' }),
      fixture({ id: 'soon', kickoff: '2026-09-26T14:00:00.000Z', status: 'upcoming' }),
      fixture({ id: 'later-same', kickoff: '2026-09-27T16:00:00.000Z', status: 'upcoming' }),
    ];
    expect(selectGameweek(fixtures, '39', 2026, NOW)).toEqual({
      roundId: ROUND,
      deadlineAt: '2026-09-26T14:00:00.000Z',
      locked: false,
    });
  });

  it('locks at the earliest not-started kickoff and keeps a finished round on screen', () => {
    const open = [fixture({ id: 'a', kickoff: '2026-09-23T12:00:00.000Z', status: 'upcoming' })];
    expect(selectGameweek(open, '39', 2026, NOW)?.locked).toBe(true);
    expect(deadlineCountdown('2026-09-23T12:00:00.000Z', true, NOW)).toMatch(/frozen/i);

    const done = [fixture({ id: 'ft', kickoff: '2026-09-20T15:00:00.000Z', status: 'finished' })];
    expect(selectGameweek(done, '39', 2026, NOW)).toEqual({
      roundId: ROUND,
      deadlineAt: null,
      locked: true,
    });
    expect(selectGameweek(done, '39', 2025, NOW)).toBeNull();
    expect(selectGameweek([fixture({ id: 'x', round: '  ', kickoff: '2026-09-26T14:00:00.000Z', status: 'upcoming' })], '39', 2026, NOW)).toBeNull();
  });

  it('counts down until that kickoff', () => {
    expect(deadlineCountdown('2026-09-24T14:00:00.000Z', false, NOW)).toBe('Locks in 1d 2h');
    expect(deadlineCountdown('2026-09-23T15:40:00.000Z', false, NOW)).toBe('Locks in 3h 40m');
    expect(deadlineCountdown('2026-09-23T12:20:00.000Z', false, NOW)).toBe('Locks in 20m');
  });
});

describe('fantasy XI and scoring', () => {
  it('requires 1 GK, at least 3 DEF, 3 MID, 1 FWD, 11 players, and at most 3 per club', () => {
    expect(validateXi(validXi())).toBeNull();
    const short = validXi().slice(0, 10);
    expect(validateXi(short)).toBe('invalid_xi');
    const thinDefence = validXi().map((row, index) => (index === 1 || index === 2 ? { ...row, pos: 'FW' as const } : row));
    expect(validateXi(thinDefence)).toBe('invalid_xi');
    const stacked = validXi().map((row) => ({ ...row, teamId: 'city' }));
    expect(validateXi(stacked)).toBe('club_cap');
    const duplicate = validXi();
    duplicate[10] = { ...duplicate[0], pos: 'FW' };
    expect(validateXi(duplicate)).toBe('invalid_xi');
  });

  it('refuses a position that would make the remaining slots miss a minimum', () => {
    expect(canAddPosition([], 'GK')).toBe(true);
    const gk = [slot(1, 'GK', 'c0')];
    expect(canAddPosition(gk, 'GK')).toBe(false);
    const heavy = [
      slot(1, 'GK', 'c0'),
      ...Array.from({ length: 6 }, (_, index) => slot(index + 2, 'DF', `c${index % 4}`)),
    ];
    expect(canAddPosition(heavy, 'DF')).toBe(false);
    expect(canAddPosition(heavy, 'MF')).toBe(true);
  });

  it('awards 4 per goal and 3 per assist after full time, and skips own goals and assists without an id', () => {
    const slots = validXi();
    const fixtures = [
      fixture({
        id: 'ft',
        status: 'finished',
        kickoff: '2026-09-20T15:00:00.000Z',
        events: [
          { type: 'goal', playerId: 'p10', assistPlayerId: 'p6' },
          { type: 'goal', playerId: 'p11', assistPlayerId: 'p99' },
          { type: 'goal', playerId: 'p2', ownGoal: true, assistPlayerId: 'p7' },
          { type: 'goal', playerId: 'outsider', assistPlayerId: 'p8', detail: 'Assist: No Id Stored' },
          { type: 'card', playerId: 'p3' },
        ],
      }),
      fixture({
        id: 'live',
        status: 'live',
        kickoff: '2026-09-20T17:00:00.000Z',
        events: [{ type: 'goal', playerId: 'p10' }],
      }),
      fixture({
        id: 'other-round',
        round: 'Regular Season - 7',
        status: 'finished',
        kickoff: '2026-09-13T15:00:00.000Z',
        events: [{ type: 'goal', playerId: 'p10', assistPlayerId: 'p6' }],
      }),
    ];
    const score = scoreFantasyXi(slots, fixtures, ROUND);
    expect(score.goals).toBe(2);
    expect(score.assists).toBe(2);
    expect(score.points).toBe(2 * 4 + 2 * 3);
    expect(score.lines.map((line) => line.playerId)).toEqual(['p10', 'p11', 'p6', 'p8']);
  });

  it('loads at most eight event lists, only for clubs in the XIs, finished first', () => {
    const teams = new Set(['city']);
    const fixtures = [
      fixture({ id: 'up', status: 'upcoming', kickoff: '2026-09-26T15:00:00.000Z', homeTeamId: 'city' }),
      fixture({
        id: 'cached',
        status: 'finished',
        kickoff: '2026-09-20T12:00:00.000Z',
        homeTeamId: 'city',
        events: [{ type: 'goal', playerId: 'p10' }],
      }),
      ...Array.from({ length: 9 }, (_, index) =>
        fixture({
          id: `m${index}`,
          status: index === 0 ? 'live' : 'finished',
          kickoff: `2026-09-20T${String(10 + index).padStart(2, '0')}:00:00.000Z`,
          awayTeamId: 'city',
        }),
      ),
      fixture({ id: 'other', status: 'finished', kickoff: '2026-09-20T19:00:00.000Z', homeTeamId: 'pool' }),
    ];
    const ids = fantasyEventFetchIds(fixtures, ROUND, teams);
    expect(ids).toHaveLength(8);
    expect(ids[0]).toBe('m8');
    expect(ids).not.toContain('up');
    expect(ids).not.toContain('cached');
    expect(ids).not.toContain('other');
    expect(ids).not.toContain('m0');
    expect(fantasyEventFetchIds(fixtures, ROUND, new Set())).toEqual([]);
  });
});

describe('fantasy membership and table', () => {
  const league = {
    id: 'fl_pl',
    name: 'Office XI',
    inviteCode: 'OFF1CE',
    ownerId: MAYA,
    competitionId: '39',
    season: 2026,
    createdAt: NOW.toISOString(),
  };

  function snapshot(extra?: Partial<FantasySnapshot>): FantasySnapshot {
    return {
      leagues: [league],
      members: [
        { leagueId: league.id, userId: MAYA, joinedAt: '2026-09-01T00:00:00.000Z' },
        { leagueId: league.id, userId: JORDAN, joinedAt: '2026-09-02T00:00:00.000Z' },
      ],
      picks: [],
      points: [],
      ...extra,
    };
  }

  it('rejects a bad code, a locked round, and an invalid XI, then saves a valid one', () => {
    const base = snapshot();
    expect(joinFantasyLeague(base, 'ghost', 'OFF1CE', NOW)).toEqual({ ok: false, error: 'not_authenticated' });
    expect(joinFantasyLeague(base, JORDAN, 'off1ce', NOW).ok).toBe(true);
    expect(joinFantasyLeague(base, JORDAN, 'ZZZZZZ', NOW)).toEqual({ ok: false, error: 'league_not_found' });

    expect(saveFantasyPick(base, JORDAN, league.id, ROUND, validXi(), true, NOW)).toEqual({
      ok: false,
      error: 'gameweek_locked',
    });
    expect(saveFantasyPick(base, JORDAN, league.id, ROUND, validXi().slice(0, 10), false, NOW)).toEqual({
      ok: false,
      error: 'invalid_xi',
    });
    const saved = saveFantasyPick(base, JORDAN, league.id, ROUND, validXi(), false, NOW);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.snapshot.picks).toHaveLength(1);
    expect(saved.snapshot.picks[0].roundId).toBe(ROUND);
  });

  it('ranks this round from goals and assists and keeps earlier rounds in the total', () => {
    const xi = validXi();
    const base = snapshot({
      picks: [
        { leagueId: league.id, userId: MAYA, roundId: ROUND, slots: xi, updatedAt: NOW.toISOString() },
        { leagueId: league.id, userId: JORDAN, roundId: ROUND, slots: validXi().map((row) => ({ ...row, playerId: `j${row.playerId}` })), updatedAt: NOW.toISOString() },
      ],
      points: [
        { leagueId: league.id, userId: MAYA, roundId: 'Regular Season - 7', points: 10, goals: 1, assists: 2 },
        { leagueId: league.id, userId: JORDAN, roundId: 'Regular Season - 7', points: 4, goals: 1, assists: 0 },
        { leagueId: league.id, userId: MAYA, roundId: ROUND, points: 99, goals: 9, assists: 9 },
      ],
    });
    const fixtures = [
      fixture({
        id: 'ft',
        status: 'finished',
        kickoff: '2026-09-20T15:00:00.000Z',
        events: [{ type: 'goal', playerId: 'p10', assistPlayerId: 'p6' }],
      }),
    ];
    const table = rankFantasyLeague({
      snapshot: base,
      leagueId: league.id,
      roundId: ROUND,
      fixtures,
      users: [user(MAYA, 'Maya'), user(JORDAN, 'Jordan')],
      currentUserId: MAYA,
    });
    expect(table.map((row) => [row.name, row.gwPoints, row.total, row.rank])).toEqual([
      ['Maya', 7, 17, 1],
      ['Jordan', 0, 4, 2],
    ]);
  });

  it('builds an invite the chat share can send without a url field', () => {
    expect(cleanInviteCode(' off1ce ')).toBe('OFF1CE');
    expect(fantasyInviteLink('OFF1CE')).toBe('kickfeed://fantasy/join?code=OFF1CE');
    const message = fantasyInviteMessage(league);
    expect(message).toMatch(/Premier League 2026\/27/);
    expect(message).toMatch(/OFF1CE/);
    expect(message).toMatch(/Free mini-league\. Not betting\./);
    expect(message.length).toBeLessThanOrEqual(1000);
  });
});

describe('fantasy honesty and remote rows', () => {
  it('says the mini-league is free, scored after full time, and email-only', () => {
    expect(FANTASY_NOT_GAMBLING).toMatch(/no stakes/i);
    expect(FANTASY_NOT_GAMBLING).toMatch(/not a betting or gambling product/i);
    expect(FANTASY_NOT_GAMBLING).toMatch(/free/i);
    expect(FANTASY_SCORING_RULES).toMatch(/4 points/);
    expect(FANTASY_SCORING_RULES).toMatch(/assist is 3/);
    expect(FANTASY_SCORING_RULES).toMatch(/after full time/i);
    expect(FANTASY_SCORING_RULES).not.toMatch(/goals only/i);
    expect(fantasyDisclaimer(false)).toBe(FANTASY_SIGN_IN_COPY);
    expect(fantasyDisclaimer(true)).toBe(FANTASY_LIVE_COPY);
    expect(FANTASY_SIGN_IN_COPY).toMatch(/Demo profiles/i);
    expect(FANTASY_LIVE_COPY).toMatch(/Postgres/i);
    expect(fantasyErrorMessage('club_cap')).toMatch(/3 players/);
    expect(fantasyErrorMessage('relation fantasy_leagues does not exist')).toBe('Couldn’t save that. Try again.');
  });

  it('maps competition, season, round picks, and stored points, and sends the deadline with the XI', async () => {
    const slots = validXi();
    const calls: Array<{ fn: string; args?: Record<string, unknown> }> = [];
    const client: FantasyClient = {
      from: (table: string) => ({
        select: async () => {
          if (table === 'fantasy_leagues') {
            return {
              data: [
                {
                  id: 'fl_abc',
                  name: 'Office XI',
                  invite_code: 'OFF1CE',
                  owner_id: MAYA,
                  competition_id: '39',
                  season: 2026,
                  created_at: '2026-09-18T00:00:00.000Z',
                },
              ],
              error: null,
            };
          }
          if (table === 'fantasy_members') {
            return {
              data: [{ league_id: 'fl_abc', user_id: MAYA, joined_at: '2026-09-18T00:00:00.000Z' }],
              error: null,
            };
          }
          if (table === 'fantasy_picks') {
            return {
              data: [
                {
                  league_id: 'fl_abc',
                  user_id: MAYA,
                  round_id: ROUND,
                  slots,
                  updated_at: '2026-09-18T00:00:00.000Z',
                },
              ],
              error: null,
            };
          }
          if (table === 'fantasy_points') {
            return {
              data: [
                {
                  league_id: 'fl_abc',
                  user_id: MAYA,
                  round_id: 'Regular Season - 7',
                  points: 8,
                  goals: 2,
                  assists: 0,
                },
              ],
              error: null,
            };
          }
          return { data: [], error: null };
        },
      }),
      rpc: async (fn, args) => {
        calls.push({ fn, args });
        if (fn === 'kickfeed_create_fantasy_league') {
          return {
            data: { id: 'fl_new', name: 'Pals', invite_code: 'AB12CD', competition_id: '39', season: 2026 },
            error: null,
          };
        }
        return { data: null, error: null };
      },
    };

    expect(parseFantasyLeague({ id: 'nope', name: 'X', invite_code: 'NEON11', owner_id: MAYA, competition_id: '1', season: 2026 })).toBeNull();
    const remote = await fetchRemoteFantasy(client);
    expect('snapshot' in remote).toBe(true);
    if (!('snapshot' in remote)) return;
    expect(remote.snapshot.leagues[0]).toMatchObject({ inviteCode: 'OFF1CE', competitionId: '39', season: 2026 });
    expect(remote.snapshot.picks[0].roundId).toBe(ROUND);
    expect(remote.snapshot.points[0].points).toBe(8);

    expect(await createRemoteFantasyLeague(client, 'Pals', '999', 2026)).toEqual({ error: 'invalid_competition' });
    expect(await createRemoteFantasyLeague(client, 'Pals', '39', 2026)).toEqual({ league: { id: 'fl_new' } });
    await upsertRemoteFantasyPick(client, 'fl_new', ROUND, slots, '2026-09-26T14:00:00.000Z');
    expect(calls.find((call) => call.fn === 'kickfeed_upsert_fantasy_pick')?.args).toEqual({
      p_league_id: 'fl_new',
      p_round_id: ROUND,
      p_slots: slots,
      p_deadline: '2026-09-26T14:00:00.000Z',
    });
    await upsertRemoteFantasyPoints(client, 'fl_new', ROUND, [{ userId: MAYA, points: 7, goals: 1, assists: 1 }]);
    expect(calls.find((call) => call.fn === 'kickfeed_upsert_fantasy_points')?.args).toMatchObject({
      p_league_id: 'fl_new',
      p_round_id: ROUND,
    });
  });
});

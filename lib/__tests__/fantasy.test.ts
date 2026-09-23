import { describe, expect, it } from 'vitest';

import { demoUsers } from '@/data/mocks/social';
import { seedFixtures } from '@/data/mocks/fixtures';
import { hydrateFixture } from '@/services/football';
import {
  DEMO_FANTASY_CODE,
  DEMO_FANTASY_NAME,
  cleanInviteCode,
  cleanLeagueName,
  createFantasyLeague,
  demoFantasySeed,
  fantasyEventFetchIds,
  fantasyLockLabel,
  gameweekContaining,
  gameweekDeadline,
  isGameweekId,
  joinFantasyLeague,
  orderSlots,
  parseFantasySnapshot,
  rankFantasyLeague,
  saveFantasyPick,
  scoreFantasyXi,
  withDemoSeed,
  type FantasyScoreFixture,
  type FantasySlot,
} from '@/lib/fantasy';
import {
  FANTASY_DEMO_COPY,
  FANTASY_LIVE_COPY,
  FANTASY_NOT_GAMBLING,
  FANTASY_SCORING_RULES,
  fantasyDisclaimer,
  fantasyErrorMessage,
} from '@/lib/honesty';
import {
  createRemoteFantasyLeague,
  fetchRemoteFantasy,
  upsertRemoteFantasyPick,
  type FantasyClient,
} from '@/services/fantasyRemote';

const NOW = new Date('2026-09-23T12:00:00.000Z');

function goal(playerId: string, detail?: string): FantasyScoreFixture['events'][number] {
  return { type: 'goal', playerId, detail };
}

describe('fantasy gameweek', () => {
  it('opens on Friday 00:00 UTC and rolls at the next Friday', () => {
    const wednesday = gameweekContaining(NOW);
    expect(wednesday.id).toBe('2026-09-18');
    expect(wednesday.startsAt).toBe('2026-09-18T00:00:00.000Z');
    expect(wednesday.endsAt).toBe('2026-09-25T00:00:00.000Z');
    expect(isGameweekId(wednesday.id)).toBe(true);
    expect(isGameweekId('2026-09-23')).toBe(false);

    const thursdayNight = gameweekContaining(new Date('2026-09-24T23:00:00.000Z'));
    expect(thursdayNight.id).toBe('2026-09-18');
    expect(gameweekContaining(new Date('2026-09-25T00:00:00.000Z')).id).toBe('2026-09-25');
    expect(gameweekContaining(new Date('2026-09-18T00:00:00.000Z')).id).toBe('2026-09-18');
  });

  it('only asks for missing events on picked clubs, and caps the list', () => {
    const gw = gameweekContaining(NOW);
    const fixtures = [
      {
        id: 'old',
        leagueId: 'epl',
        kickoff: '2026-09-22T12:00:00.000Z',
        status: 'finished' as const,
        homeTeamId: 'liv',
        awayTeamId: 'ars',
        events: [],
      },
      {
        id: 'cached',
        leagueId: 'epl',
        kickoff: '2026-09-23T15:00:00.000Z',
        status: 'live' as const,
        homeTeamId: 'liv',
        awayTeamId: 'mci',
        events: [{ id: 'g' }],
      },
      {
        id: 'other',
        leagueId: 'ucl',
        kickoff: '2026-09-23T19:00:00.000Z',
        status: 'live' as const,
        homeTeamId: 'liv',
        awayTeamId: 'rma',
        events: [],
      },
      {
        id: 'later',
        leagueId: '39',
        kickoff: '2026-09-23T19:00:00.000Z',
        status: 'ht' as const,
        homeTeamId: 'che',
        awayTeamId: 'tot',
        events: [],
      },
      {
        id: 'soon',
        leagueId: '140',
        kickoff: '2026-09-24T19:00:00.000Z',
        status: 'upcoming' as const,
        homeTeamId: 'rma',
        awayTeamId: 'bar',
        events: [],
      },
    ];
    expect(fantasyEventFetchIds(fixtures, new Set(['liv', 'che']), gw)).toEqual(['later', 'old']);
    expect(fantasyEventFetchIds(fixtures, new Set(['liv']), gw, 1)).toEqual(['old']);
    expect(fantasyEventFetchIds(fixtures, new Set(), gw)).toEqual([]);
  });

  it('locks at the first covered kickoff and ignores other competitions', () => {
    const gw = gameweekContaining(NOW);
    const fixtures = [
      { leagueId: 'ucl', kickoff: '2026-09-22T19:00:00.000Z' },
      { leagueId: 'epl', kickoff: '2026-09-23T14:00:00.000Z' },
      { leagueId: '140', kickoff: '2026-09-23T19:00:00.000Z' },
      { leagueId: '39', kickoff: '2026-09-17T19:00:00.000Z' },
    ];
    const before = gameweekDeadline(fixtures, gw, new Date('2026-09-23T13:00:00.000Z'));
    expect(before).toEqual({ deadlineAt: '2026-09-23T14:00:00.000Z', locked: false });
    expect(fantasyLockLabel(before, (iso) => iso)).toMatch(/^Locks at the first covered kickoff/);

    const after = gameweekDeadline(fixtures, gw, new Date('2026-09-23T14:00:00.000Z'));
    expect(after.locked).toBe(true);
    expect(fantasyLockLabel(after, (iso) => iso)).toMatch(/^Locked at the first covered kickoff/);

    const empty = gameweekDeadline([], gw, NOW);
    expect(empty).toEqual({ deadlineAt: null, locked: false });
    expect(fantasyLockLabel(empty, (iso) => iso)).toMatch(/stays open/);
    expect(gameweekDeadline([], gw, new Date('2026-09-25T00:00:00.000Z')).locked).toBe(true);
  });
});

describe('fantasy scoring', () => {
  it('awards 5 points per goal and skips own goals, assists, uncovered leagues, and upcoming matches', () => {
    const gw = gameweekContaining(NOW);
    const seed = demoFantasySeed(NOW);
    const maya = seed.picks.find((pick) => pick.userId === 'maya');
    expect(maya?.slots).toHaveLength(11);
    expect(orderSlots(maya?.slots ?? [])).not.toBeNull();

    const fixtures: FantasyScoreFixture[] = [
      {
        leagueId: 'epl',
        kickoff: '2026-09-23T11:00:00.000Z',
        status: 'live',
        events: [
          goal('p-liv-11'),
          goal('p-liv-10', 'Header from a corner'),
          goal('p-liv-11', 'Own Goal'),
          { type: 'goal', playerId: 'p-liv-9', detail: 'Assist: Salah' },
        ],
      },
      {
        leagueId: 'ucl',
        kickoff: '2026-09-23T11:00:00.000Z',
        status: 'finished',
        events: [goal('p-liv-11')],
      },
      {
        leagueId: 'laliga',
        kickoff: '2026-09-23T11:00:00.000Z',
        status: 'upcoming',
        events: [goal('p-rma-7')],
      },
      {
        leagueId: '39',
        kickoff: '2026-09-26T15:00:00.000Z',
        status: 'finished',
        events: [goal('p-liv-11')],
      },
    ];
    const score = scoreFantasyXi(maya?.slots ?? [], fixtures, gw);
    expect(score.goals).toBe(3);
    expect(score.points).toBe(15);
    expect(score.lines.map((line) => line.playerId).sort()).toEqual(['p-liv-10', 'p-liv-11', 'p-liv-9']);
  });

  it('ranks the seeded Friday XI from catalog goals', () => {
    const gw = gameweekContaining(NOW);
    const snapshot = withDemoSeed({ leagues: [], members: [], picks: [] }, 'sophie', NOW);
    expect(snapshot.leagues[0]).toMatchObject({ name: DEMO_FANTASY_NAME, inviteCode: DEMO_FANTASY_CODE });
    expect(snapshot.members.some((member) => member.userId === 'sophie')).toBe(true);

    const fixtures: FantasyScoreFixture[] = [
      {
        leagueId: 'epl',
        kickoff: NOW.toISOString(),
        status: 'finished',
        events: [goal('p-liv-11'), goal('p-liv-10'), goal('p-mci-9'), goal('p-che-20')],
      },
      {
        leagueId: 'laliga',
        kickoff: NOW.toISOString(),
        status: 'live',
        events: [goal('p-rma-7'), goal('p-rma-5'), goal('p-bar-19')],
      },
    ];
    const table = rankFantasyLeague({
      snapshot,
      leagueId: snapshot.leagues[0].id,
      gameweek: gw,
      fixtures,
      users: demoUsers,
      currentUserId: 'sophie',
    });
    expect(table.map((row) => [row.userId, row.points, row.rank])).toEqual([
      ['omar', 15, 1],
      ['jordan', 10, 2],
      ['maya', 10, 3],
      ['sophie', 0, 4],
    ]);
    expect(table[1].name).toBe('Jordan Blake');
    expect(table[3].hasXi).toBe(false);
    expect(table[3].isCurrentUser).toBe(true);
  });

  it('scores the seeded XIs from the mock catalog, not an empty table', () => {
    const now = new Date('2026-09-23T15:00:00.000Z');
    const gw = gameweekContaining(now);
    const fixtures = seedFixtures.map((seed) => hydrateFixture(seed, now.getTime()));
    const snapshot = demoFantasySeed(now);
    const points = Object.fromEntries(
      snapshot.picks.map((pick) => [pick.userId, scoreFantasyXi(pick.slots, fixtures, gw).points]),
    );
    expect(points.maya + points.jordan + points.omar).toBeGreaterThan(0);
    expect(points.jordan).toBeGreaterThan(0);
    expect(points.omar).toBeGreaterThan(0);
  });
});

describe('fantasy leagues', () => {
  it('creates, joins, and saves one XI until the deadline', () => {
    const created = createFantasyLeague({ leagues: [], members: [], picks: [] }, 'maya', '  Pitch   pals ', NOW, () => 0.1);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.snapshot.leagues[0].name).toBe('Pitch pals');
    expect(created.snapshot.leagues[0].inviteCode).toHaveLength(6);
    expect(cleanLeagueName('x')).toBeNull();
    expect(cleanInviteCode('neon11')).toBe('NEON11');
    expect(cleanInviteCode('no')).toBeNull();

    const joined = joinFantasyLeague(created.snapshot, 'jordan', created.snapshot.leagues[0].inviteCode, NOW);
    expect(joined.ok).toBe(true);
    if (!joined.ok) return;

    const missing = joinFantasyLeague(joined.snapshot, 'omar', 'ZZZZZZ', NOW);
    expect(missing).toEqual({ ok: false, error: 'league_not_found' });

    const gw = gameweekContaining(NOW);
    const seed = demoFantasySeed(NOW);
    const draft = seed.picks[0].slots;
    const locked = saveFantasyPick(joined.snapshot, 'jordan', gw.id, draft, true, NOW);
    expect(locked).toEqual({ ok: false, error: 'gameweek_locked' });

    const saved = saveFantasyPick(joined.snapshot, 'jordan', gw.id, draft, false, NOW);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.snapshot.picks).toHaveLength(1);

    const duplicate = draft.map((slot) => ({ ...slot }));
    duplicate[10] = { ...duplicate[0] } as FantasySlot;
    expect(saveFantasyPick(joined.snapshot, 'jordan', gw.id, duplicate, false, NOW)).toEqual({
      ok: false,
      error: 'invalid_xi',
    });

    const again = parseFantasySnapshot(JSON.parse(JSON.stringify({ schemaVersion: 1, ...saved.snapshot })));
    expect(again.picks[0].userId).toBe('jordan');
    expect(withDemoSeed(again, 'jordan', NOW).picks.find((pick) => pick.userId === 'jordan')?.slots[10].playerId).toBe(
      draft[10].playerId,
    );
  });
});

describe('fantasy honesty and remote rows', () => {
  it('says the mini-league is free and goals-only', () => {
    expect(FANTASY_NOT_GAMBLING).toMatch(/no stakes/i);
    expect(FANTASY_NOT_GAMBLING).toMatch(/not a betting or gambling product/i);
    expect(FANTASY_NOT_GAMBLING).toMatch(/free/i);
    expect(FANTASY_SCORING_RULES).toMatch(/goals only/i);
    expect(FANTASY_SCORING_RULES).toMatch(/assist/i);
    expect(FANTASY_SCORING_RULES).toMatch(/No budget/i);
    expect(fantasyDisclaimer(false)).toBe(FANTASY_DEMO_COPY);
    expect(fantasyDisclaimer(true)).toBe(FANTASY_LIVE_COPY);
    expect(FANTASY_DEMO_COPY).toMatch(/this device/i);
    expect(FANTASY_LIVE_COPY).toMatch(/Postgres/i);
    expect(fantasyErrorMessage('gameweek_locked')).toMatch(/locked/i);
    expect(fantasyErrorMessage('relation fantasy_leagues does not exist')).toBe('Couldn’t save that. Try again.');
  });

  it('maps postgres rows and does not send a client clock on the pick RPC', async () => {
    const slots = demoFantasySeed(NOW).picks[0].slots;
    const calls: Array<{ fn: string; args?: Record<string, unknown> }> = [];
    const client: FantasyClient = {
      from: (table: string) => ({
        select: async () => {
          if (table === 'fantasy_leagues') {
            return {
              data: [
                {
                  id: 'fl_abc',
                  name: 'Friday XI',
                  invite_code: 'NEON11',
                  owner_id: '44444444-4444-4444-8444-444444444444',
                  created_at: '2026-09-18T00:00:00.000Z',
                },
              ],
              error: null,
            };
          }
          if (table === 'fantasy_members') {
            return {
              data: [
                {
                  league_id: 'fl_abc',
                  user_id: '44444444-4444-4444-8444-444444444444',
                  joined_at: '2026-09-18T00:00:00.000Z',
                },
              ],
              error: null,
            };
          }
          if (table === 'fantasy_picks') {
            return {
              data: [
                {
                  user_id: '44444444-4444-4444-8444-444444444444',
                  gameweek_id: '2026-09-18',
                  slots,
                  updated_at: '2026-09-18T00:00:00.000Z',
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
          return { data: { id: 'fl_new', name: 'Pals', invite_code: 'AB12CD' }, error: null };
        }
        return { data: null, error: null };
      },
    };

    const remote = await fetchRemoteFantasy(client);
    expect('snapshot' in remote).toBe(true);
    if (!('snapshot' in remote)) return;
    expect(remote.snapshot.leagues[0].inviteCode).toBe('NEON11');
    expect(remote.snapshot.picks[0].slots).toHaveLength(11);
    expect(remote.snapshot.picks[0].userId).toBe('44444444-4444-4444-8444-444444444444');

    const created = await createRemoteFantasyLeague(client, 'Pals');
    expect(created).toEqual({ league: { id: 'fl_new', name: 'Pals', inviteCode: 'AB12CD' } });
    await upsertRemoteFantasyPick(client, '2026-09-18', slots, '2026-09-23T14:00:00.000Z');
    const upsert = calls.find((call) => call.fn === 'kickfeed_upsert_fantasy_pick');
    expect(upsert?.args).toEqual({
      p_gameweek_id: '2026-09-18',
      p_slots: slots,
      p_deadline: '2026-09-23T14:00:00.000Z',
    });
    expect(upsert?.args).not.toHaveProperty('updated_at');
  });
});

import type { Fixture, Team } from '@/data/types';
import { MAX_DEVICE_ALERTS_PER_SYNC, goalFingerprint, kickoffFingerprint, planFavoriteDeviceAlerts } from '@/lib/favoritePush';
import {
  FAVORITE_KICKOFF_LEAD_MS,
  FAVORITE_KICKOFF_SCHEDULE_HORIZON_MS,
  FAVORITE_KICKOFF_SOON_MS,
  FAVORITE_LIVE_KICKOFF_GRACE_MS,
  type MatchCatalog,
} from '@/lib/matchSocial';
import {
  REMOTE_FETCH_IDLE_MS,
  REMOTE_FETCH_LIVE_MS,
  REMOTE_KICKOFF_HORIZON_MS,
  REMOTE_KICKOFF_LEAD_MS,
  REMOTE_KICKOFF_SOON_MS,
  REMOTE_LIVE_KICKOFF_GRACE_MS,
  REMOTE_MAX_ALERTS_PER_USER,
  REMOTE_PUSH_LEAGUE_IDS,
  alertsForLocalDelivery,
  handoffSchedulesToRemote,
  authorizeDispatch,
  europeanSeasonYear,
  expoMessageForAlert,
  isExpoPushToken,
  leagueNeedsFetch,
  parseBffFixtures,
  parseExpoPushTickets,
  planRemoteFavoritePushes,
  pushFavoriteTeamIds,
  remoteFixtureQuery,
  remoteFixturesUrl,
  remoteMatchStatus,
  runFavoritePushDispatch,
  secretsMatch,
  selectLeaguesToFetch,
  type LeagueCache,
  type PushDispatchStore,
  type RemoteMatch,
  type RemotePushDevice,
  type RemoteSnapshot,
} from '@/lib/remotePush';
import { LIVE_LEAGUE_IDS } from '@/lib/footballCoverage';
import { mapMatchStatus } from '@/services/footballMap';
import { europeanSeasonYear as appSeason, fixtureDateWindow } from '@/services/footballApi';
import { MOCK_FOOTBALL_STATUS } from '@/services/footballTypes';
import { describe, expect, it } from 'vitest';

const TOKEN = 'ExponentPushToken[abcdefghijklmnopqrst]';
const USER = '22222222-2222-4222-8222-222222222222';
const NOW = Date.parse('2026-09-18T15:00:00.000Z');

const liv: Team = {
  id: '40',
  name: 'Liverpool',
  shortName: 'Liverpool',
  code: 'LIV',
  color: '#C8102E',
  accent: '#fff',
  countryId: 'eng',
};
const ars: Team = {
  id: '42',
  name: 'Arsenal',
  shortName: 'Arsenal',
  code: 'ARS',
  color: '#EF0107',
  accent: '#fff',
  countryId: 'eng',
};

function fx(partial: Partial<Fixture> & Pick<Fixture, 'id' | 'status' | 'kickoff'>): Fixture {
  return {
    leagueId: '39',
    homeTeamId: '40',
    awayTeamId: '42',
    homeScore: 0,
    awayScore: 0,
    events: [],
    venue: 'Anfield',
    ...partial,
  };
}

function catalog(fixtures: Fixture[]): MatchCatalog {
  return {
    getFixtures: () => fixtures,
    getFixture: (id) => fixtures.find((row) => row.id === id),
    getTeam: (id) => (id === '40' ? liv : id === '42' ? ars : undefined),
    getPlayer: () => undefined,
    relatedIds: (_kind, id) => [id],
    getStatus: () => MOCK_FOOTBALL_STATUS,
  };
}

function remoteMatch(fixture: Fixture): RemoteMatch {
  const home = fixture.homeTeamId === '40' ? liv : ars;
  const away = fixture.awayTeamId === '42' ? ars : liv;
  return {
    id: fixture.id,
    status: fixture.status,
    kickoff: fixture.kickoff,
    homeTeamId: fixture.homeTeamId,
    awayTeamId: fixture.awayTeamId,
    homeCode: home.code,
    awayCode: away.code,
    homeScore: fixture.homeScore,
    awayScore: fixture.awayScore,
  };
}

function signature(alerts: { action: string; type?: string; matchId?: string; fingerprint: string; at?: number }[]) {
  return alerts.map((alert) => ({
    action: alert.action,
    type: 'type' in alert ? alert.type : undefined,
    matchId: 'matchId' in alert ? alert.matchId : undefined,
    fingerprint: alert.fingerprint,
    at: 'at' in alert ? alert.at : undefined,
  }));
}

describe('remote push locks', () => {
  it('keeps kickoff windows, league ids, and the per-sync cap aligned with the app', () => {
    expect(REMOTE_KICKOFF_SOON_MS).toBe(FAVORITE_KICKOFF_SOON_MS);
    expect(REMOTE_KICKOFF_LEAD_MS).toBe(FAVORITE_KICKOFF_LEAD_MS);
    expect(REMOTE_KICKOFF_HORIZON_MS).toBe(FAVORITE_KICKOFF_SCHEDULE_HORIZON_MS);
    expect(REMOTE_LIVE_KICKOFF_GRACE_MS).toBe(FAVORITE_LIVE_KICKOFF_GRACE_MS);
    expect(REMOTE_MAX_ALERTS_PER_USER).toBe(MAX_DEVICE_ALERTS_PER_SYNC);
    expect([...REMOTE_PUSH_LEAGUE_IDS]).toEqual([...LIVE_LEAGUE_IDS]);
    for (const code of ['NS', '1H', 'HT', 'FT', 'CANC', 'PST', '2H', 'TBD', '']) {
      expect(remoteMatchStatus(code)).toBe(mapMatchStatus(code));
    }
  });

  it('asks the BFF for the same season window the app uses', () => {
    const now = new Date('2026-09-23T12:00:00.000Z');
    expect(europeanSeasonYear(now)).toBe(appSeason(now));
    const query = remoteFixtureQuery(now);
    expect(query).toEqual({ season: appSeason(now), ...fixtureDateWindow(now) });
    expect(remoteFixturesUrl('https://kickfeed-football-bff.kaysi8805.workers.dev/', '39', now)).toBe(
      'https://kickfeed-football-bff.kaysi8805.workers.dev/fixtures?league=39&season=2026&from=2026-09-09&to=2026-10-14',
    );
  });
});

describe('planRemoteFavoritePushes', () => {
  it('matches the on-device planner for kickoff, goals, and cancellations', () => {
    const soon = fx({ id: 'soon', status: 'upcoming', kickoff: new Date(NOW + 20 * 60_000).toISOString() });
    const later = fx({ id: 'later', status: 'upcoming', kickoff: new Date(NOW + 2 * 60 * 60_000).toISOString() });
    const live = fx({
      id: '9001',
      status: 'live',
      kickoff: new Date(NOW - 60_000).toISOString(),
      homeScore: 1,
      awayScore: 0,
    });
    const prefs = { enabled: true, kickoff: true, goals: true };
    const fixtures = [soon, later, live];
    const local = planFavoriteDeviceAlerts({
      userId: USER,
      teamIds: ['40'],
      provider: catalog(fixtures),
      prefs,
      snapshot: { scores: { '9001': { home: 0, away: 0 } }, presented: [], scheduled: {} },
      now: NOW,
    });
    const remote = planRemoteFavoritePushes({
      userId: USER,
      teamIds: ['40'],
      prefs,
      matches: fixtures.map(remoteMatch),
      snapshot: { scores: { '9001': { home: 0, away: 0 } }, presented: [], scheduled: {} },
      now: NOW,
    });
    expect(signature(remote.alerts)).toEqual(signature(local.alerts));
    expect(remote.snapshot.scheduled).toEqual(local.snapshot.scheduled);
    expect(remote.snapshot.presented).toEqual(local.snapshot.presented);
    const goal = remote.alerts.find((alert) => alert.action === 'present' && alert.type === 'goal');
    expect(goal).toMatchObject({
      fingerprint: goalFingerprint(USER, '9001', 1, 0),
      matchId: '9001',
      title: expect.stringMatching(/GOAL/),
    });
    expect(kickoffFingerprint(USER, 'soon')).toBe(`kickoff:${USER}:soon`);
  });

  it('keeps unseen baselines when a league fetch failed', () => {
    const kept = planRemoteFavoritePushes({
      userId: USER,
      teamIds: ['40'],
      prefs: { enabled: true, kickoff: true, goals: true },
      matches: [],
      snapshot: {
        scores: { '9001': { home: 1, away: 0 } },
        presented: [],
        scheduled: { [`kickoff:${USER}:later`]: NOW + 60_000 },
      },
      now: NOW,
      retainUnseen: true,
    });
    expect(kept.snapshot.scores['9001']).toEqual({ home: 1, away: 0 });
    expect(kept.snapshot.scheduled[`kickoff:${USER}:later`]).toBe(NOW + 60_000);
    expect(kept.alerts).toEqual([]);
  });
});

describe('favorite ids and local delivery', () => {
  it('expands club and player-club ids and caps the list', () => {
    const ids = pushFavoriteTeamIds({
      teamIds: ['liv', 'liv'],
      playerIds: ['p1'],
      relatedTeamIds: (id) => (id === 'liv' ? ['liv', '40'] : id === 'ars' ? ['ars', '42'] : [id]),
      teamIdForPlayer: (id) => (id === 'p1' ? 'ars' : undefined),
    });
    expect(ids).toEqual(['liv', '40', 'ars', '42']);
    const many = pushFavoriteTeamIds({
      teamIds: Array.from({ length: 50 }, (_, i) => `t${i}`),
      relatedTeamIds: (id) => [id],
    });
    expect(many).toHaveLength(40);
  });

  it('lets remote delivery own schedules and background banners', () => {
    const alerts = [
      { action: 'schedule' as const, fingerprint: 'kickoff:u:1' },
      { action: 'present' as const, fingerprint: 'goal:u:1:1-0' },
      { action: 'cancel' as const, fingerprint: 'kickoff:u:old' },
    ];
    expect(alertsForLocalDelivery(alerts, { synced: false, appActive: false })).toEqual(alerts);
    expect(alertsForLocalDelivery(alerts, { synced: true, appActive: true }).map((alert) => alert.action)).toEqual([
      'cancel',
      'present',
      'cancel',
    ]);
    expect(alertsForLocalDelivery(alerts, { synced: true, appActive: false }).map((alert) => alert.action)).toEqual([
      'cancel',
      'cancel',
    ]);
  });

  it('cancels an armed local DATE when remote push takes over, and can arm it again later', () => {
    const fp = 'kickoff:u:later';
    const handed = handoffSchedulesToRemote(
      [{ action: 'schedule', fingerprint: fp }],
      { scores: {}, presented: [], scheduled: { [fp]: 50 } },
      true,
    );
    expect(handed.snapshot.scheduled).toEqual({});
    expect(handed.alerts.map((alert) => alert.action)).toEqual(['schedule', 'cancel']);
    const localAgain = handoffSchedulesToRemote(
      [{ action: 'schedule', fingerprint: fp, at: 50 }],
      { scores: {}, presented: [], scheduled: {} },
      false,
    );
    expect(localAgain.alerts).toEqual([{ action: 'schedule', fingerprint: fp, at: 50 }]);
  });
});

describe('BFF fixtures and Expo tickets', () => {
  it('parses a fixtures envelope and skips cancelled rows', () => {
    const matches = parseBffFixtures({
      errors: [],
      response: [
        {
          fixture: { id: 9001, date: '2026-09-18T16:00:00+00:00', status: { short: '1H' } },
          teams: { home: { id: 40, name: 'Liverpool', code: 'LIV' }, away: { id: 42, name: 'Arsenal', code: 'ARS' } },
          goals: { home: 1, away: 0 },
        },
        {
          fixture: { id: 12, date: '2026-09-18T18:00:00+00:00', status: { short: 'CANC' } },
          teams: { home: { id: 1, name: 'A' }, away: { id: 2, name: 'B' } },
          goals: { home: null, away: null },
        },
      ],
    });
    expect(matches).toEqual([
      expect.objectContaining({ id: '9001', status: 'live', homeTeamId: '40', awayCode: 'ARS', homeScore: 1 }),
    ]);
    expect(parseBffFixtures({ errors: { requests: 'limit' }, response: [] })).toEqual([]);
  });

  it('reads DeviceNotRegistered off Expo tickets', () => {
    expect(
      parseExpoPushTickets(
        { data: [{ status: 'ok', id: '1' }, { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } }] },
        [TOKEN, 'ExponentPushToken[otherothertoken12]'],
      ),
    ).toEqual([
      { token: TOKEN, ok: true },
      { token: 'ExponentPushToken[otherothertoken12]', ok: false, error: 'DeviceNotRegistered' },
    ]);
    const message = expoMessageForAlert(TOKEN, {
      action: 'present',
      type: 'kickoff',
      fingerprint: `kickoff:${USER}:9001`,
      matchId: '9001',
      title: 'Kickoff soon — LIV vs ARS',
      body: 'Starts soon. Open the match hub.',
    });
    expect(message.data).toEqual({ matchId: '9001', type: 'kickoff', fingerprint: `kickoff:${USER}:9001` });
    expect(message.channelId).toBe('matches');
    expect(isExpoPushToken('not-a-token')).toBe(false);
  });
});

describe('dispatch auth and quota', () => {
  it('accepts the dispatch secret or a signed-in test, and rejects short secrets', () => {
    expect(secretsMatch('short', 'short')).toBe(false);
    expect(secretsMatch('0123456789abcdef', '0123456789abcdef')).toBe(true);
    expect(secretsMatch('0123456789abcdef', '0123456789abcdee')).toBe(false);
    expect(
      authorizeDispatch({
        dispatchSecret: '0123456789abcdef',
        headerSecret: '0123456789abcdef',
        mode: 'test',
        userId: USER,
      }),
    ).toEqual({ ok: true, mode: 'dispatch' });
    expect(
      authorizeDispatch({
        dispatchSecret: '0123456789abcdef',
        headerSecret: null,
        mode: 'test',
        userId: USER,
      }),
    ).toEqual({ ok: true, mode: 'test', userId: USER });
    expect(
      authorizeDispatch({ dispatchSecret: undefined, headerSecret: null, mode: 'dispatch', userId: null }).ok,
    ).toBe(false);
  });

  it('refetches live leagues sooner than idle ones', () => {
    const idle: LeagueCache = {
      leagueId: '39',
      fetchedAt: NOW - REMOTE_FETCH_IDLE_MS + 1000,
      matches: [remoteMatch(fx({ id: 'later', status: 'upcoming', kickoff: new Date(NOW + 5 * 60 * 60_000).toISOString() }))],
    };
    const live: LeagueCache = {
      leagueId: '140',
      fetchedAt: NOW - REMOTE_FETCH_LIVE_MS - 1,
      matches: [remoteMatch(fx({ id: '9001', status: 'live', kickoff: new Date(NOW - 60_000).toISOString() }))],
    };
    expect(leagueNeedsFetch(idle, NOW)).toBe(false);
    expect(leagueNeedsFetch(live, NOW)).toBe(true);
    expect(leagueNeedsFetch(undefined, NOW)).toBe(true);
    const selected = selectLeaguesToFetch({ now: NOW, leagueIds: ['39', '140'], cache: [idle, live] });
    expect(selected.fetchIds).toEqual(['140']);
    expect(selected.matches.map((match) => match.id)).toEqual(['later']);
  });
});

describe('runFavoritePushDispatch', () => {
  function device(partial: Partial<RemotePushDevice> = {}): RemotePushDevice {
    return {
      id: 'dev-1',
      userId: USER,
      expoPushToken: TOKEN,
      platform: 'ios',
      enabled: true,
      kickoff: true,
      goals: true,
      favoriteTeamIds: ['40'],
      ...partial,
    };
  }

  function store(devices: RemotePushDevice[], cache: LeagueCache[] = []): PushDispatchStore & {
    snapshots: Record<string, RemoteSnapshot>;
    disabled: string[];
  } {
    const snapshots: Record<string, RemoteSnapshot> = {};
    const disabled: string[] = [];
    return {
      snapshots,
      disabled,
      listEnabledDevices: async () => devices.filter((row) => row.enabled),
      loadSnapshots: async (ids) => {
        const out: Record<string, RemoteSnapshot> = {};
        for (const id of ids) {
          const snap = snapshots[id];
          if (snap) out[id] = snap;
        }
        return out;
      },
      saveSnapshot: async (userId, snapshot) => {
        snapshots[userId] = snapshot;
      },
      disableTokens: async (tokens) => {
        disabled.push(...tokens);
      },
      loadFixtureCache: async () => cache,
      saveFixtureCache: async () => undefined,
    };
  }

  function fetchMock(payload: unknown, tickets: unknown = { data: [{ status: 'ok', id: 't' }] }) {
    const calls: string[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      calls.push(url);
      if (url.includes('exp.host')) {
        return new Response(JSON.stringify(tickets), { status: 200 });
      }
      expect(init?.method).toBeUndefined();
      return new Response(JSON.stringify(payload), { status: 200 });
    };
    return { fetchImpl, calls };
  }

  const livePayload = {
    errors: [],
    response: [
      {
        fixture: { id: 9001, date: new Date(NOW - 60_000).toISOString(), status: { short: '1H' } },
        teams: { home: { id: 40, code: 'LIV', name: 'Liverpool' }, away: { id: 42, code: 'ARS', name: 'Arsenal' } },
        goals: { home: 1, away: 0 },
      },
    ],
  };

  it('sends a goal only after a baseline and then suppresses the repeat', async () => {
    const memory = store([device()]);
    const firstFetch = fetchMock(livePayload);
    const first = await runFavoritePushDispatch({
      mode: 'dispatch',
      now: NOW,
      bffUrl: 'https://bff.test',
      season: 2026,
      store: memory,
      fetchImpl: firstFetch.fetchImpl,
      leagueIds: ['39'],
    });
    expect(first.sent).toBe(1);
    expect(firstFetch.calls.some((url) => url.startsWith('https://exp.host/'))).toBe(true);
    expect(memory.snapshots[USER]?.scores['9001']).toEqual({ home: 1, away: 0 });
    expect(memory.snapshots[USER]?.presented.some((fp) => fp.startsWith('kickoff:'))).toBe(true);

    memory.snapshots[USER] = {
      scores: { '9001': { home: 1, away: 0 } },
      presented: [`kickoff:${USER}:9001`],
      scheduled: {},
    };
    const secondPayload = {
      ...livePayload,
      response: [{ ...livePayload.response[0], goals: { home: 2, away: 0 } }],
    };
    const secondFetch = fetchMock(secondPayload);
    const second = await runFavoritePushDispatch({
      mode: 'dispatch',
      now: NOW,
      bffUrl: 'https://bff.test',
      season: 2026,
      store: memory,
      fetchImpl: secondFetch.fetchImpl,
      leagueIds: ['39'],
    });
    expect(second.sent).toBe(1);
    const third = await runFavoritePushDispatch({
      mode: 'dispatch',
      now: NOW,
      bffUrl: 'https://bff.test',
      season: 2026,
      store: memory,
      fetchImpl: fetchMock(secondPayload).fetchImpl,
      leagueIds: ['39'],
    });
    expect(third.sent).toBe(0);
  });

  it('does not call the BFF again while an idle cache is fresh', async () => {
    const cache: LeagueCache[] = [
      {
        leagueId: '39',
        fetchedAt: NOW - 60_000,
        matches: [remoteMatch(fx({ id: 'later', status: 'upcoming', kickoff: new Date(NOW + 3 * 60 * 60_000).toISOString() }))],
      },
    ];
    const memory = store([device()], cache);
    const net = fetchMock({ response: [] });
    const result = await runFavoritePushDispatch({
      mode: 'dispatch',
      now: NOW,
      bffUrl: 'https://bff.test',
      store: memory,
      fetchImpl: net.fetchImpl,
      leagueIds: ['39'],
    });
    expect(result.fetchedLeagues).toEqual([]);
    expect(result.cachedLeagues).toEqual(['39']);
    expect(net.calls.some((url) => url.includes('bff.test'))).toBe(false);
    expect(result.sent).toBe(0);
    expect(memory.snapshots[USER]?.scheduled[`kickoff:${USER}:later`]).toBeTypeOf('number');
  });

  it('disables tokens Expo says are no longer registered', async () => {
    const memory = store([device()]);
    const net = fetchMock(livePayload, {
      data: [{ status: 'error', message: 'DeviceNotRegistered', details: { error: 'DeviceNotRegistered' } }],
    });
    const result = await runFavoritePushDispatch({
      mode: 'dispatch',
      now: NOW,
      bffUrl: 'https://bff.test',
      season: 2026,
      store: memory,
      fetchImpl: net.fetchImpl,
      leagueIds: ['39'],
    });
    expect(result.sent).toBe(0);
    expect(memory.disabled).toEqual([TOKEN]);
  });

  it('sends a remote test only to the signed-in user’s devices', async () => {
    const other = device({
      id: 'dev-2',
      userId: '33333333-3333-4333-8333-333333333333',
      expoPushToken: 'ExponentPushToken[zzzzzzzzzzzzzzzzzz]',
    });
    const memory = store([device(), other]);
    const bodies: unknown[] = [];
    const fetchImpl: typeof fetch = async (_input, init) => {
      bodies.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ data: [{ status: 'ok', id: 't' }] }), { status: 200 });
    };
    const result = await runFavoritePushDispatch({
      mode: 'test',
      testUserId: USER,
      now: NOW,
      bffUrl: 'https://bff.test',
      store: memory,
      fetchImpl,
      leagueIds: ['39'],
    });
    expect(result).toMatchObject({ ok: true, mode: 'test', sent: 1 });
    expect(bodies).toEqual([[expect.objectContaining({ to: TOKEN, data: { type: 'test' } })]]);
    expect(memory.snapshots[USER]).toBeUndefined();
  });

  it('does not advance snapshots when the BFF is down and there is no cache', async () => {
    const memory = store([device()]);
    const fetchImpl: typeof fetch = async () => new Response('nope', { status: 503 });
    const result = await runFavoritePushDispatch({
      mode: 'dispatch',
      now: NOW,
      bffUrl: 'https://bff.test',
      store: memory,
      fetchImpl,
      leagueIds: ['39'],
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('fixtures-unavailable');
    expect(memory.snapshots[USER]).toBeUndefined();
  });
});

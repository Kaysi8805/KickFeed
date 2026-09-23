import type { Fixture, Team } from '@/data/types';
import {
  defaultPushPrefs,
  deviceAlertsCopy,
  emptyPushSnapshot,
  goalFingerprint,
  kickoffFingerprint,
  matchIdFromNotificationData,
  matchIdFromNotificationResponse,
  parsePushStore,
  planFavoriteDeviceAlerts,
} from '@/lib/favoritePush';
import {
  FAVORITE_KICKOFF_LEAD_MS,
  FAVORITE_KICKOFF_SCHEDULE_HORIZON_MS,
  FAVORITE_KICKOFF_SOON_MS,
  type MatchCatalog,
} from '@/lib/matchSocial';
import { MOCK_FOOTBALL_STATUS } from '@/services/footballTypes';
import { describe, expect, it } from 'vitest';

const liv: Team = {
  id: 'liv',
  name: 'Liverpool',
  shortName: 'Liverpool',
  code: 'LIV',
  color: '#C8102E',
  accent: '#fff',
  countryId: 'eng',
};
const ars: Team = {
  id: 'ars',
  name: 'Arsenal',
  shortName: 'Arsenal',
  code: 'ARS',
  color: '#EF0107',
  accent: '#fff',
  countryId: 'eng',
};

function fx(partial: Partial<Fixture> & Pick<Fixture, 'id' | 'status' | 'kickoff'>): Fixture {
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

function catalog(fixtures: Fixture[]): MatchCatalog {
  return {
    getFixtures: () => fixtures,
    getFixture: (id) => fixtures.find((f) => f.id === id),
    getTeam: (id) => (id === 'liv' ? liv : id === 'ars' ? ars : undefined),
    getPlayer: () => undefined,
    relatedIds: (_kind, id) => [id],
    getStatus: () => MOCK_FOOTBALL_STATUS,
  };
}

const NOW = Date.parse('2026-09-18T15:00:00.000Z');
const enabled = { ...defaultPushPrefs(), enabled: true };

describe('deviceAlertsCopy', () => {
  it('stays honest when EAS is missing and on web', () => {
    expect(
      deviceAlertsCopy({
        optedIn: false,
        projectId: undefined,
        permission: 'undetermined',
        token: null,
        platform: 'web',
      }),
    ).toMatch(/web preview/i);
    expect(
      deviceAlertsCopy({
        optedIn: false,
        projectId: undefined,
        permission: 'undetermined',
        token: null,
        platform: 'native',
      }),
    ).toMatch(/EAS projectId/i);
    expect(
      deviceAlertsCopy({
        optedIn: true,
        projectId: undefined,
        permission: 'granted',
        token: null,
        platform: 'native',
      }),
    ).toMatch(/Local match alerts/i);
    expect(
      deviceAlertsCopy({
        optedIn: true,
        projectId: '52a1ee7a-e7db-49c4-bc11-419d316ebd44',
        permission: 'granted',
        token: 'ExponentPushToken[abcdefghijklmnopqrst]',
        platform: 'native',
        remote: 'synced',
      }),
    ).toMatch(/KickFeed closed/i);
    expect(
      deviceAlertsCopy({
        optedIn: true,
        projectId: '52a1ee7a-e7db-49c4-bc11-419d316ebd44',
        permission: 'granted',
        token: 'ExponentPushToken[abcdefghijklmnopqrst]',
        platform: 'native',
        remote: 'demo',
      }),
    ).toMatch(/email sign-in/i);
  });
});

describe('parsePushStore', () => {
  it('returns safe defaults for missing or junk JSON', () => {
    expect(parsePushStore(null).prefs.enabled).toBe(false);
    expect(parsePushStore('nope').snapshot.presented).toEqual([]);
    const parsed = parsePushStore(
      JSON.stringify({
        prefs: { enabled: true, kickoff: false },
        snapshot: { scores: { '9001': { home: 2, away: 1 } }, presented: ['kickoff:maya:9001'], scheduled: { x: 1 } },
      }),
    );
    expect(parsed.prefs).toEqual({ enabled: true, kickoff: false, goals: true });
    expect(parsed.snapshot.scores['9001']).toEqual({ home: 2, away: 1 });
    expect(parsed.token).toBeNull();
    expect(
      parsePushStore(JSON.stringify({ prefs: { enabled: true }, token: 'ExponentPushToken[abcdefghijklmnopqrst]' })).token,
    ).toBe('ExponentPushToken[abcdefghijklmnopqrst]');
    expect(parsePushStore(JSON.stringify({ token: 'not-a-token' })).token).toBeNull();
  });
});

describe('planFavoriteDeviceAlerts', () => {
  it('does not present while disabled but still baselines scores', () => {
    const live = fx({
      id: '9001',
      status: 'live',
      kickoff: new Date(NOW - 60_000).toISOString(),
      homeScore: 2,
      awayScore: 1,
    });
    const first = planFavoriteDeviceAlerts({
      userId: 'maya',
      teamIds: ['liv'],
      provider: catalog([live]),
      prefs: defaultPushPrefs(),
      snapshot: emptyPushSnapshot(),
      now: NOW,
    });
    expect(first.alerts).toEqual([]);
    expect(first.snapshot.scores['9001']).toEqual({ home: 2, away: 1 });

    const later = planFavoriteDeviceAlerts({
      userId: 'maya',
      teamIds: ['liv'],
      provider: catalog([{ ...live, homeScore: 3 }]),
      prefs: enabled,
      snapshot: first.snapshot,
      now: NOW,
    });
    expect(later.alerts.some((a) => a.action === 'present' && a.type === 'goal')).toBe(true);
  });

  it('presents kickoff soon within 30 minutes and schedules further-out favorites', () => {
    const soon = fx({
      id: 'soon',
      status: 'upcoming',
      kickoff: new Date(NOW + 20 * 60_000).toISOString(),
    });
    const later = fx({
      id: 'later',
      status: 'upcoming',
      kickoff: new Date(NOW + 2 * 60 * 60_000).toISOString(),
    });
    const far = fx({
      id: 'far',
      status: 'upcoming',
      kickoff: new Date(NOW + FAVORITE_KICKOFF_SCHEDULE_HORIZON_MS + 60_000).toISOString(),
    });
    const plan = planFavoriteDeviceAlerts({
      userId: 'maya',
      teamIds: ['liv'],
      provider: catalog([soon, later, far]),
      prefs: enabled,
      snapshot: emptyPushSnapshot(),
      now: NOW,
    });
    expect(plan.alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: 'present', type: 'kickoff', matchId: 'soon' }),
        expect.objectContaining({
          action: 'schedule',
          type: 'kickoff',
          matchId: 'later',
          at: Date.parse(later.kickoff) - FAVORITE_KICKOFF_LEAD_MS,
        }),
      ]),
    );
    expect(plan.alerts.some((a) => a.action !== 'cancel' && 'matchId' in a && a.matchId === 'far')).toBe(false);
    expect(FAVORITE_KICKOFF_SOON_MS).toBe(30 * 60_000);
  });

  it('presents live kickoff only inside the 10-minute grace window', () => {
    const live = fx({
      id: '9001',
      status: 'live',
      kickoff: new Date(NOW - 2 * 60_000).toISOString(),
    });
    const plan = planFavoriteDeviceAlerts({
      userId: 'maya',
      teamIds: ['liv'],
      provider: catalog([live]),
      prefs: enabled,
      snapshot: emptyPushSnapshot(),
      now: NOW,
    });
    expect(plan.alerts).toEqual([
      expect.objectContaining({ action: 'present', type: 'kickoff', matchId: '9001', fingerprint: kickoffFingerprint('maya', '9001') }),
    ]);
  });

  it('skips live kickoff after the grace window and does not dump the current score as a goal', () => {
    const live = fx({
      id: '9001',
      status: 'live',
      kickoff: new Date(NOW - 20 * 60_000).toISOString(),
      homeScore: 2,
      awayScore: 1,
      events: [{ id: 'g1', type: 'goal', minute: 12, teamId: 'liv', playerName: 'Salah' }],
    });
    const plan = planFavoriteDeviceAlerts({
      userId: 'maya',
      teamIds: ['liv'],
      provider: catalog([live]),
      prefs: enabled,
      snapshot: emptyPushSnapshot(),
      now: NOW,
    });
    expect(plan.alerts).toEqual([]);
    expect(plan.snapshot.scores['9001']).toEqual({ home: 2, away: 1 });
  });

  it('presents a goal only when the scoreline ticks up after a baseline', () => {
    const kickoff = new Date(NOW - 60_000).toISOString();
    const first = planFavoriteDeviceAlerts({
      userId: 'maya',
      teamIds: ['liv'],
      provider: catalog([fx({ id: '9001', status: 'live', kickoff, homeScore: 1, awayScore: 0 })]),
      prefs: enabled,
      snapshot: emptyPushSnapshot(),
      now: NOW,
    });
    expect(first.alerts.some((a) => a.action === 'present' && a.type === 'goal')).toBe(false);

    const second = planFavoriteDeviceAlerts({
      userId: 'maya',
      teamIds: ['liv'],
      provider: catalog([
        fx({
          id: '9001',
          status: 'live',
          kickoff,
          homeScore: 2,
          awayScore: 0,
          events: [{ id: 'g2', type: 'goal', minute: 34, teamId: 'liv', playerName: 'Salah' }],
        }),
      ]),
      prefs: enabled,
      snapshot: first.snapshot,
      now: NOW,
    });
    const goal = second.alerts.find((a) => a.action === 'present' && a.type === 'goal');
    expect(goal).toMatchObject({
      title: expect.stringMatching(/GOAL/),
      body: expect.stringMatching(/Salah/),
      fingerprint: goalFingerprint('maya', '9001', 2, 0),
    });

    const again = planFavoriteDeviceAlerts({
      userId: 'maya',
      teamIds: ['liv'],
      provider: catalog([fx({ id: '9001', status: 'live', kickoff, homeScore: 2, awayScore: 0 })]),
      prefs: enabled,
      snapshot: second.snapshot,
      now: NOW,
    });
    expect(again.alerts.some((a) => a.action === 'present' && a.type === 'goal')).toBe(false);
  });

  it('ignores non-favorite clubs and cancels stale schedules when alerts are turned off', () => {
    const later = fx({
      id: 'later',
      status: 'upcoming',
      kickoff: new Date(NOW + 2 * 60 * 60_000).toISOString(),
    });
    const other = fx({
      id: 'mci',
      status: 'live',
      kickoff: new Date(NOW - 60_000).toISOString(),
      homeTeamId: 'mci',
      awayTeamId: 'che',
    });
    const scheduled = planFavoriteDeviceAlerts({
      userId: 'maya',
      teamIds: ['liv'],
      provider: catalog([later, other]),
      prefs: enabled,
      snapshot: emptyPushSnapshot(),
      now: NOW,
    });
    expect(scheduled.alerts.some((a) => a.action !== 'cancel' && 'matchId' in a && a.matchId === 'mci')).toBe(false);
    expect(scheduled.snapshot.scheduled[kickoffFingerprint('maya', 'later')]).toBeDefined();

    const off = planFavoriteDeviceAlerts({
      userId: 'maya',
      teamIds: ['liv'],
      provider: catalog([later]),
      prefs: defaultPushPrefs(),
      snapshot: scheduled.snapshot,
      now: NOW,
    });
    expect(off.alerts).toEqual([expect.objectContaining({ action: 'cancel', fingerprint: kickoffFingerprint('maya', 'later') })]);
    expect(off.snapshot.scheduled).toEqual({});
  });

  it('cancels a pending T−15 DATE when the same match later enters the 30-minute soon window', () => {
    const kickoff = new Date(NOW + 2 * 60 * 60_000).toISOString();
    const fixture = fx({ id: 'later', status: 'upcoming', kickoff });
    const first = planFavoriteDeviceAlerts({
      userId: 'maya',
      teamIds: ['liv'],
      provider: catalog([fixture]),
      prefs: enabled,
      snapshot: emptyPushSnapshot(),
      now: NOW,
    });
    const fp = kickoffFingerprint('maya', 'later');
    expect(first.alerts).toEqual([
      expect.objectContaining({ action: 'schedule', type: 'kickoff', matchId: 'later', fingerprint: fp }),
    ]);
    expect(first.snapshot.scheduled[fp]).toBe(Date.parse(kickoff) - FAVORITE_KICKOFF_LEAD_MS);

    const soonNow = NOW + 2 * 60 * 60_000 - 20 * 60_000;
    const second = planFavoriteDeviceAlerts({
      userId: 'maya',
      teamIds: ['liv'],
      provider: catalog([fixture]),
      prefs: enabled,
      snapshot: first.snapshot,
      now: soonNow,
    });
    expect(second.alerts.map((a) => a.action)).toEqual(['cancel', 'present']);
    expect(second.alerts[0]).toEqual({ action: 'cancel', fingerprint: fp });
    expect(second.alerts[1]).toMatchObject({
      action: 'present',
      type: 'kickoff',
      matchId: 'later',
      fingerprint: fp,
    });
    expect(second.snapshot.scheduled[fp]).toBeUndefined();
    expect(second.snapshot.presented).toContain(fp);
  });
});

describe('notification tap payload', () => {
  it('reads matchId from Expo notification data and ignores blanks', () => {
    expect(matchIdFromNotificationData({ matchId: '9001' })).toBe('9001');
    expect(matchIdFromNotificationData({ matchId: '  ' })).toBeUndefined();
    expect(matchIdFromNotificationData(null)).toBeUndefined();
    expect(
      matchIdFromNotificationResponse({
        notification: { request: { content: { data: { matchId: 'fx-liv-ars' } } } },
      }),
    ).toBe('fx-liv-ars');
  });
});

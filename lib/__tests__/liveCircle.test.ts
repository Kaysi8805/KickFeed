import { describe, expect, it } from 'vitest';

import {
  LIVE_CIRCLE_EMPTY,
  LIVE_CIRCLE_IDLE_MS,
  LIVE_CIRCLE_PUSH_DEBOUNCE_MS,
  LIVE_CIRCLE_SETTING_BODY,
  isLiveCircleDebounced,
  isPresenceFresh,
  liveCircleChatTarget,
  liveCircleFixtureLabel,
  liveCirclePushBody,
  liveCircleRoute,
  planLiveCirclePushes,
  visibleLiveCircleFriends,
  type LiveCirclePerson,
} from '@/lib/liveCircle';

const NOW = Date.parse('2026-09-23T18:00:00.000Z');

function person(patch: Partial<LiveCirclePerson> & Pick<LiveCirclePerson, 'userId'>): LiveCirclePerson {
  return {
    fixtureId: '9001',
    displayName: patch.userId,
    handle: patch.userId,
    initials: 'AA',
    avatarColor: '#22C55E',
    heartbeatAt: new Date(NOW - 30_000).toISOString(),
    optedIn: true,
    ...patch,
  };
}

describe('live circle idle', () => {
  it('keeps a heartbeat inside five minutes and drops the next one', () => {
    const fresh = new Date(NOW - (LIVE_CIRCLE_IDLE_MS - 1)).toISOString();
    const idle = new Date(NOW - LIVE_CIRCLE_IDLE_MS).toISOString();
    expect(isPresenceFresh(fresh, NOW)).toBe(true);
    expect(isPresenceFresh(idle, NOW)).toBe(false);
    expect(isPresenceFresh('not-a-date', NOW)).toBe(false);
  });
});

describe('visible live circle friends', () => {
  const rows = [
    person({ userId: 'maya', displayName: 'Maya' }),
    person({ userId: 'omar', displayName: 'Omar' }),
    person({ userId: 'stranger', displayName: 'Stranger' }),
    person({ userId: 'jordan', displayName: 'Jordan', optedIn: false }),
    person({ userId: 'luca', displayName: 'Luca', heartbeatAt: new Date(NOW - LIVE_CIRCLE_IDLE_MS - 1).toISOString() }),
    person({ userId: 'sophie', displayName: 'Sophie', fixtureId: 'other' }),
  ];

  it('shows opted-in friends on this fixture and hides self, strangers, idle, and opted-out', () => {
    const visible = visibleLiveCircleFriends({
      viewerId: 'maya',
      fixtureId: '9001',
      now: NOW,
      friendIds: ['omar', 'jordan', 'luca', 'sophie'],
      hiddenIds: [],
      rows,
    });
    expect(visible.map((row) => row.userId)).toEqual(['omar']);
  });

  it('hides a blocked friend and anyone who is not a friend', () => {
    const visible = visibleLiveCircleFriends({
      viewerId: 'maya',
      fixtureId: '9001',
      now: NOW,
      friendIds: ['omar'],
      hiddenIds: ['omar'],
      rows,
    });
    expect(visible).toEqual([]);
  });

  it('trusts server rows for friendship but still drops self, blocks, and stale heartbeats', () => {
    const visible = visibleLiveCircleFriends({
      viewerId: 'maya',
      fixtureId: '9001',
      now: NOW,
      friendIds: [],
      hiddenIds: ['stranger'],
      serverTrusted: true,
      rows,
    });
    expect(visible.map((row) => row.userId)).toEqual(['omar']);
  });
});

describe('live circle chat', () => {
  const groups = [
    { id: 'grp-wide', memberIds: ['maya', 'omar', 'jordan', 'luca'], createdAt: '2026-09-23T12:00:00.000Z' },
    { id: 'grp-tight', memberIds: ['maya', 'omar', 'jordan'], createdAt: '2026-09-20T12:00:00.000Z' },
  ];

  it('opens an existing 1:1 before a group', () => {
    const target = liveCircleChatTarget({
      viewerId: 'maya',
      peerId: 'omar',
      hasDirectThread: true,
      groups,
    });
    expect(target).toEqual({ kind: 'direct', peerId: 'omar' });
    expect(target && liveCircleRoute(target)).toBe('/messages/omar');
  });

  it('opens the smallest existing group when there is no 1:1 yet', () => {
    const target = liveCircleChatTarget({
      viewerId: 'maya',
      peerId: 'omar',
      hasDirectThread: false,
      groups,
    });
    expect(target).toEqual({ kind: 'group', groupId: 'grp-tight' });
    expect(target && liveCircleRoute(target)).toBe('/messages/group/grp-tight');
  });

  it('falls through to a new 1:1 when nothing binds the pair', () => {
    expect(
      liveCircleChatTarget({
        viewerId: 'maya',
        peerId: 'aisha',
        hasDirectThread: false,
        groups,
      }),
    ).toEqual({ kind: 'direct', peerId: 'aisha' });
    expect(liveCircleChatTarget({ viewerId: 'maya', peerId: 'maya', hasDirectThread: false, groups })).toBeNull();
  });
});

describe('live circle push', () => {
  it('names the friend and the fixture', () => {
    expect(liveCircleFixtureLabel('Arsenal', 'Spurs')).toBe('Arsenal–Spurs');
    expect(liveCirclePushBody('Omar', 'Arsenal–Spurs')).toBe('Omar is live on Arsenal–Spurs');
    expect(LIVE_CIRCLE_SETTING_BODY).toMatch(/Friends can see when you are on a match/);
    expect(LIVE_CIRCLE_SETTING_BODY).toMatch(/Off unless you turn it on/);
    expect(LIVE_CIRCLE_EMPTY).toBe('Be the first friend here');
  });

  it('notifies a favorited opted-in friend once, and skips viewers, strangers, and opted-out fans', () => {
    const base = {
      actorId: 'maya',
      actorOptedIn: true,
      actorName: 'Maya',
      fixtureId: '9001',
      fixtureLabel: 'Arsenal–Spurs',
      now: NOW,
    };
    const friend = {
      userId: 'omar',
      optedIn: true,
      friend: true,
      blocked: false,
      favorited: true,
      viewing: false,
      pushEnabled: true,
      token: 'ExponentPushToken[aaaaaaaaaaaa]',
      lastNotifiedAt: null,
    };
    const planned = planLiveCirclePushes({
      ...base,
      candidates: [
        friend,
        { ...friend, userId: 'viewer', viewing: true, favorited: true },
        { ...friend, userId: 'stranger', friend: false },
        { ...friend, userId: 'quiet', optedIn: false },
        { ...friend, userId: 'blocked', blocked: true },
        { ...friend, userId: 'nofav', favorited: false, viewing: false },
        { ...friend, userId: 'maya' },
      ],
    });
    expect(planned.map((row) => row.userId)).toEqual(['omar']);
    expect(planned[0]?.body).toBe('Maya is live on Arsenal–Spurs');
    expect(planned[0]?.matchId).toBe('9001');

    expect(isLiveCircleDebounced(NOW - 1000, NOW)).toBe(true);
    expect(isLiveCircleDebounced(NOW - LIVE_CIRCLE_PUSH_DEBOUNCE_MS, NOW)).toBe(false);
    const again = planLiveCirclePushes({
      ...base,
      candidates: [{ ...friend, lastNotifiedAt: NOW - 1000 }],
    });
    expect(again).toEqual([]);
    expect(planLiveCirclePushes({ ...base, actorOptedIn: false, candidates: [friend] })).toEqual([]);
  });
});

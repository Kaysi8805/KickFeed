import { describe, expect, it } from 'vitest';

import { liveCircleEnabledFor, noteFriendLive, setLiveCircleEnabled, signInDemo } from '@/services/appState';
import { defaults } from '@/services/appState';
import {
  asLiveCircleClient,
  clearDemoPresence,
  parseRemoteLiveCircle,
  readDemoPresence,
  resetDemoPresenceForTests,
  touchRemoteLiveCircle,
  writeDemoPresence,
} from '@/services/liveCircle';
import { visibleLiveCircleFriends } from '@/lib/liveCircle';

const UUID = '11111111-1111-4111-8111-111111111111';

describe('live circle opt-in state', () => {
  it('stays off until the fan turns it on', () => {
    const signed = signInDemo(defaults(), 'maya');
    expect(liveCircleEnabledFor(signed, 'maya')).toBe(false);
    const on = setLiveCircleEnabled(signed, true);
    expect(liveCircleEnabledFor(on, 'maya')).toBe(true);
    expect(liveCircleEnabledFor(setLiveCircleEnabled(on, false), 'maya')).toBe(false);
  });

  it('debounces the in-app notice', () => {
    const now = Date.parse('2026-09-23T18:00:00.000Z');
    const signed = setLiveCircleEnabled(signInDemo(defaults(), 'maya'), true);
    const first = noteFriendLive(
      signed,
      { actorId: 'omar', actorName: 'Omar', fixtureId: '9001', fixtureLabel: 'Arsenal–Spurs' },
      now,
    );
    expect(first.fresh).toBe(true);
    expect(first.state.notifications[0]?.body).toBe('Omar is live on Arsenal–Spurs');
    expect(first.state.notifications[0]?.type).toBe('live_circle');
    expect(first.state.notifications[0]?.matchId).toBe('9001');
    const second = noteFriendLive(
      first.state,
      { actorId: 'omar', actorName: 'Omar', fixtureId: '9001', fixtureLabel: 'Arsenal–Spurs' },
      now + 1000,
    );
    expect(second.fresh).toBe(false);
    const off = setLiveCircleEnabled(signed, false);
    expect(noteFriendLive(off, { actorId: 'omar', actorName: 'Omar', fixtureId: '9001', fixtureLabel: 'x' }, now).fresh).toBe(
      false,
    );
  });
});

describe('live circle remote client', () => {
  it('parses presence rows and reports a new session from the touch rpc', async () => {
    expect(asLiveCircleClient(null)).toBeNull();
    const row = parseRemoteLiveCircle({
      user_id: UUID,
      fixture_id: '9001',
      display_name: 'Omar',
      handle: 'omar',
      initials: 'OM',
      avatar_color: '#22C55E',
      heartbeat_at: '2026-09-23T18:00:00.000Z',
    });
    expect(row?.displayName).toBe('Omar');
    expect(parseRemoteLiveCircle({ user_id: 'ghost', fixture_id: '9001', heartbeat_at: '2026-09-23T18:00:00.000Z' })).toBeNull();

    const calls: Array<{ fn: string; args: Record<string, unknown> | undefined }> = [];
    const client = asLiveCircleClient({
      rpc: async (fn, args) => {
        calls.push({ fn, args });
        return { data: fn === 'kickfeed_touch_live_circle' ? true : null, error: null };
      },
      from: () => ({
        select: () => ({
          eq: async () => ({ data: [], error: null }),
        }),
      }),
    });
    const touched = await touchRemoteLiveCircle(client, {
      fixtureId: '9001',
      displayName: 'Maya',
      handle: 'maya',
      initials: 'MA',
      avatarColor: '#22C55E',
    });
    expect(touched).toEqual({ started: true });
    expect(calls[0]?.fn).toBe('kickfeed_touch_live_circle');
    expect(calls[0]?.args).toMatchObject({ p_fixture_id: '9001', p_display_name: 'Maya' });
  });

  it('keeps demo presence on this device and still filters to friends', () => {
    resetDemoPresenceForTests();
    writeDemoPresence({
      userId: 'omar',
      fixtureId: '9001',
      displayName: 'Omar',
      handle: 'omar',
      initials: 'OM',
      avatarColor: '#22C55E',
      heartbeatAt: new Date().toISOString(),
      optedIn: true,
    });
    writeDemoPresence({
      userId: 'maya',
      fixtureId: '9001',
      displayName: 'Maya',
      handle: 'maya',
      initials: 'MA',
      avatarColor: '#3B82F6',
      heartbeatAt: new Date().toISOString(),
      optedIn: true,
    });
    const visible = visibleLiveCircleFriends({
      viewerId: 'maya',
      fixtureId: '9001',
      now: Date.now(),
      friendIds: ['omar'],
      hiddenIds: [],
      rows: readDemoPresence(),
    });
    expect(visible.map((row) => row.userId)).toEqual(['omar']);
    clearDemoPresence('omar');
    expect(readDemoPresence().map((row) => row.userId)).toEqual(['maya']);
    resetDemoPresenceForTests();
  });
});

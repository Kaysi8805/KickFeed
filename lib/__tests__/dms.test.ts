import { describe, expect, it } from 'vitest';

import { seedDirectMessages } from '@/data/mocks/social';
import {
  DM_SLOW_MODE_BURST_COUNT,
  DM_SLOW_MODE_COOLDOWN_MS,
  buildDirectMessage,
  canDmPeer,
  cannotDmIds,
  dmSlowMode,
  dmSlowModeComposerCopy,
  dmThreadId,
  inboxThreads,
  parseDirectMessage,
  shouldPersistDms,
  unreadDmCount,
  visibleDirectMessages,
} from '@/lib/dms';

describe('dm thread identity', () => {
  it('uses one canonical key for both directions', () => {
    expect(dmThreadId('maya', 'omar')).toBe(dmThreadId('omar', 'maya'));
    expect(dmThreadId('maya', 'omar')).toBe('maya::omar');
  });
});

describe('dm parse + send payload', () => {
  it('keeps demo ids and uuids, drops self-sends and junk', () => {
    const uuid = '11111111-1111-4111-8111-111111111111';
    expect(parseDirectMessage(seedDirectMessages[0])).toMatchObject({ senderId: 'maya', recipientId: 'omar' });
    expect(
      parseDirectMessage({
        id: 'dm-u',
        senderId: uuid,
        recipientId: 'omar',
        text: 'hello from email',
        createdAt: '2026-09-19T12:00:00.000Z',
      })?.senderId,
    ).toBe(uuid);
    expect(buildDirectMessage({ senderId: 'maya', recipientId: 'maya', text: 'nope' }, 1)).toBeNull();
    expect(buildDirectMessage({ senderId: 'maya', recipientId: 'omar', text: '   ' }, 1)).toBeNull();
  });
});

describe('dm blocks', () => {
  it('hides a thread when either person blocked the other', () => {
    const hidden = cannotDmIds('maya', ['omar'], { jordan: ['maya'] }, []);
    expect(hidden).toEqual(expect.arrayContaining(['omar', 'jordan']));
    expect(canDmPeer('maya', 'luca', hidden)).toBe(true);
    expect(canDmPeer('maya', 'omar', hidden)).toBe(false);
    expect(canDmPeer('maya', 'maya', [])).toBe(false);

    const visible = visibleDirectMessages(seedDirectMessages, 'maya', ['omar']);
    expect(visible.every((row) => row.senderId === 'jordan' || row.recipientId === 'jordan')).toBe(true);
  });
});

describe('dm inbox + unread', () => {
  it('groups Maya’s seeded threads and counts unread from Omar/Jordan', () => {
    const threads = inboxThreads(seedDirectMessages, 'maya', [], {});
    expect(threads.map((t) => t.peerId)).toEqual(['jordan', 'omar']);
    expect(threads[0]?.unreadCount).toBe(1);
    expect(threads.find((t) => t.peerId === 'omar')?.unreadCount).toBe(2);
    expect(unreadDmCount(seedDirectMessages, 'maya', [], { omar: new Date().toISOString() })).toBe(1);
  });
});

describe('dm slow-mode', () => {
  const now = Date.parse('2026-09-19T12:00:00.000Z');

  it('allows the first send, then waits 20s in that thread', () => {
    expect(dmSlowMode([], 'maya', 'omar', now).ok).toBe(true);
    const blocked = dmSlowMode(
      [
        {
          id: 'dm-new',
          senderId: 'maya',
          recipientId: 'omar',
          text: 'first',
          createdAt: new Date(now - 5_000).toISOString(),
        },
      ],
      'maya',
      'omar',
      now,
    );
    expect(blocked.ok).toBe(false);
    if (blocked.ok) return;
    expect(blocked.kind).toBe('cooldown');
    expect(blocked.remainingMs).toBe(DM_SLOW_MODE_COOLDOWN_MS - 5_000);
    expect(dmSlowModeComposerCopy(blocked)).toMatch(/wait 15s/);
  });

  it('does not apply the 20s cooldown to a different peer', () => {
    const other = dmSlowMode(
      [
        {
          id: 'dm-new',
          senderId: 'maya',
          recipientId: 'omar',
          text: 'first',
          createdAt: new Date(now - 5_000).toISOString(),
        },
      ],
      'maya',
      'luca',
      now,
    );
    expect(other.ok).toBe(true);
  });

  it('caps a burst across all DM threads', () => {
    const messages = Array.from({ length: DM_SLOW_MODE_BURST_COUNT }, (_, i) => ({
      id: `dm-${i}`,
      senderId: 'maya',
      recipientId: i % 2 === 0 ? 'omar' : 'luca',
      text: 'spam',
      createdAt: new Date(now - 30_000 - i * 1_000).toISOString(),
    }));
    const burst = dmSlowMode(messages, 'maya', 'jordan', now);
    expect(burst.ok).toBe(false);
    if (burst.ok) return;
    expect(burst.kind).toBe('burst');
  });
});

describe('dm persistence gate', () => {
  it('only syncs Postgres for an email session', () => {
    expect(shouldPersistDms(true, 'supabase')).toBe(true);
    expect(shouldPersistDms(true, 'demo')).toBe(false);
    expect(shouldPersistDms(false, 'supabase')).toBe(false);
  });
});

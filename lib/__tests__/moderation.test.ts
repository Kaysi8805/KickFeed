import { describe, expect, it } from 'vitest';

import {
  CHAT_SLOW_MODE_BURST_COUNT,
  CHAT_SLOW_MODE_BURST_WINDOW_MS,
  CHAT_SLOW_MODE_COOLDOWN_MS,
  buildUserReport,
  composeReportReason,
  formatSlowModeWait,
  matchChatSlowMode,
  shouldPersistModeration,
  slowModeComposerCopy,
  uniqueBlockedIds,
  visibleByAuthor,
  visibleNotifications,
} from '@/lib/moderation';

describe('report reasons', () => {
  it('requires a preset and extra text for something else', () => {
    expect(composeReportReason('spam')).toBe('Spam or scam');
    expect(composeReportReason('other', '  hi  ')).toBeNull();
    expect(composeReportReason('other', 'betting links in chat')).toMatch(/^Something else:/);
    expect(composeReportReason('ghost')).toBeNull();
    expect(buildUserReport({
      reporterId: 'maya',
      targetType: 'post',
      targetId: 'p1',
      targetUserId: 'maya',
      reason: 'Spam or scam',
    }, 1)).toBeNull();
    expect(buildUserReport({
      reporterId: 'maya',
      targetType: 'post',
      targetId: 'p1',
      targetUserId: 'jordan',
      reason: 'Spam or scam',
    }, 1)?.targetUserId).toBe('jordan');
  });
});

describe('blocks visibility', () => {
  it('hides blocked authors from posts, comments, and actor notifications', () => {
    expect(uniqueBlockedIds(['jordan', 'jordan', 'ghost', 'maya'], 'maya')).toEqual(['jordan']);
    const posts = visibleByAuthor(
      [
        { authorId: 'jordan', id: 'p1' },
        { authorId: 'maya', id: 'p2' },
      ],
      ['jordan'],
    );
    expect(posts.map((p) => p.id)).toEqual(['p2']);
    const notes = visibleNotifications(
      [
        { id: 'n1', type: 'friend_post', title: 'x', body: 'y', createdAt: 't', read: false, recipientId: 'maya', userId: 'jordan' },
        { id: 'n2', type: 'goal', title: 'x', body: 'y', createdAt: 't', read: false, recipientId: 'maya' },
      ],
      ['jordan'],
    );
    expect(notes.map((n) => n.id)).toEqual(['n2']);
  });
});

describe('match-chat slow-mode', () => {
  const now = Date.parse('2026-09-18T18:00:00.000Z');

  it('allows the first message, then waits 20s in that thread', () => {
    expect(matchChatSlowMode([], 'maya', now, ['fx-liv-ars']).ok).toBe(true);
    const blocked = matchChatSlowMode(
      [
        {
          id: 'c-new',
          matchId: 'fx-liv-ars',
          authorId: 'maya',
          text: 'first',
          createdAt: new Date(now - 5_000).toISOString(),
        },
      ],
      'maya',
      now,
      ['fx-liv-ars'],
    );
    expect(blocked.ok).toBe(false);
    if (blocked.ok) return;
    expect(blocked.kind).toBe('cooldown');
    expect(blocked.remainingMs).toBe(CHAT_SLOW_MODE_COOLDOWN_MS - 5_000);
    expect(slowModeComposerCopy(blocked)).toMatch(/wait 15s/);
  });

  it('does not apply the 20s cooldown to a different match thread', () => {
    const other = matchChatSlowMode(
      [
        {
          id: 'c-new',
          matchId: 'fx-liv-ars',
          authorId: 'maya',
          text: 'first',
          createdAt: new Date(now - 5_000).toISOString(),
        },
      ],
      'maya',
      now,
      ['fx-rma-bar'],
    );
    expect(other.ok).toBe(true);
  });

  it('caps a burst of messages across hubs', () => {
    const comments = Array.from({ length: CHAT_SLOW_MODE_BURST_COUNT }, (_, i) => ({
      id: `c-${i}`,
      matchId: i % 2 === 0 ? 'fx-liv-ars' : 'fx-rma-bar',
      authorId: 'maya',
      text: 'spam',
      createdAt: new Date(now - 30_000 - i * 1_000).toISOString(),
    }));
    const burst = matchChatSlowMode(comments, 'maya', now, ['fx-int-mil']);
    expect(burst.ok).toBe(false);
    if (burst.ok) return;
    expect(burst.kind).toBe('burst');
    expect(burst.remainingMs).toBeGreaterThan(CHAT_SLOW_MODE_BURST_WINDOW_MS - 60_000);
    expect(formatSlowModeWait(90_000)).toBe('2m');
  });
});

describe('moderation persistence gate', () => {
  it('only syncs Postgres for an email session', () => {
    expect(shouldPersistModeration(true, 'supabase')).toBe(true);
    expect(shouldPersistModeration(true, 'demo')).toBe(false);
    expect(shouldPersistModeration(false, 'supabase')).toBe(false);
  });
});

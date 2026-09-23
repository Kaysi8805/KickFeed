import { describe, expect, it } from 'vitest';

import type { DirectMessage, GroupMessage } from '@/data/types';
import {
  GROUP_PICK_MIN,
  buildDmGroup,
  conversationInbox,
  defaultGroupTitle,
  displayGroupTitle,
  groupSendBlockReason,
  groupSlowMode,
  planDmGroup,
  unreadInGroup,
} from '@/lib/groups';
import { DM_SLOW_MODE_BURST_COUNT, DM_SLOW_MODE_COOLDOWN_MS } from '@/lib/dms';

const mutual = ['omar', 'jordan', 'luca', 'sophie'];

describe('planDmGroup', () => {
  it('requires two mutual friends and keeps the creator first', () => {
    const plan = planDmGroup({
      creatorId: 'maya',
      pickedIds: ['jordan', 'omar', 'jordan'],
      mutualFriendIds: mutual,
      hiddenIds: [],
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.memberIds).toEqual(['maya', 'jordan', 'omar']);
    expect(plan.title).toBeNull();
    expect(GROUP_PICK_MIN).toBe(2);
  });

  it('rejects a single friend, non-friends, and blocked fans', () => {
    expect(
      planDmGroup({ creatorId: 'maya', pickedIds: ['omar'], mutualFriendIds: mutual, hiddenIds: [] }).ok,
    ).toBe(false);
    expect(
      planDmGroup({
        creatorId: 'maya',
        pickedIds: ['omar', 'aisha'],
        mutualFriendIds: mutual,
        hiddenIds: [],
      }),
    ).toMatchObject({ ok: false, error: 'Groups are for mutual friends.' });
    expect(
      planDmGroup({
        creatorId: 'maya',
        pickedIds: ['omar', 'jordan'],
        mutualFriendIds: mutual,
        hiddenIds: ['omar'],
      }),
    ).toMatchObject({ ok: false, error: 'Blocked fans can’t be added to a group.' });
    expect(
      planDmGroup({
        creatorId: 'maya',
        pickedIds: ['luca', 'sophie'],
        mutualFriendIds: mutual,
        hiddenIds: [],
        blocks: { luca: ['sophie'] },
      }),
    ).toMatchObject({ ok: false, error: 'Two of those fans have blocked each other.' });
  });

  it('stores a trimmed name and refuses a long one', () => {
    const named = planDmGroup({
      creatorId: 'maya',
      pickedIds: ['omar', 'jordan'],
      mutualFriendIds: mutual,
      hiddenIds: [],
      title: '  Match night  ',
    });
    expect(named).toMatchObject({ ok: true, title: 'Match night' });
    expect(
      planDmGroup({
        creatorId: 'maya',
        pickedIds: ['omar', 'jordan'],
        mutualFriendIds: mutual,
        hiddenIds: [],
        title: 'x'.repeat(81),
      }).ok,
    ).toBe(false);
  });
});

describe('group titles', () => {
  it('defaults from the other members’ names', () => {
    expect(defaultGroupTitle(['Omar Haddad', 'Jordan Blake'])).toBe('Omar Haddad, Jordan Blake');
    const group = buildDmGroup('maya', ['maya', 'omar', 'jordan'], null, 1_700_000_000_000);
    expect(group).not.toBeNull();
    if (!group) return;
    expect(
      displayGroupTitle(group, 'maya', (id) => (id === 'omar' ? 'Omar Haddad' : id === 'jordan' ? 'Jordan Blake' : 'Maya')),
    ).toBe('Omar Haddad, Jordan Blake');
    expect(displayGroupTitle({ ...group, title: 'North London' }, 'omar', () => 'Maya')).toBe('North London');
  });
});

describe('group send gates', () => {
  const now = Date.parse('2026-09-23T12:00:00.000Z');
  const group = buildDmGroup('maya', ['maya', 'omar', 'jordan'], null, now);
  if (!group) throw new Error('group');

  it('blocks shares and new messages when a member is hidden', () => {
    expect(groupSendBlockReason(group, 'maya', [])).toBeNull();
    expect(groupSendBlockReason(group, 'maya', ['jordan'])).toMatch(/blocked/i);
    expect(groupSendBlockReason(group, 'aisha', [])).toMatch(/not in this group/i);
  });

  it('cools down inside the group and counts 1:1 sends toward the burst', () => {
    const sent: GroupMessage = {
      id: 'gm-1',
      groupId: group.id,
      senderId: 'maya',
      text: 'hi',
      createdAt: new Date(now - 5_000).toISOString(),
    };
    const cooled = groupSlowMode([sent], [], 'maya', group.id, now);
    expect(cooled.ok).toBe(false);
    if (cooled.ok) return;
    expect(cooled.kind).toBe('cooldown');
    expect(cooled.remainingMs).toBe(DM_SLOW_MODE_COOLDOWN_MS - 5_000);

    const directs: DirectMessage[] = Array.from({ length: DM_SLOW_MODE_BURST_COUNT }, (_, i) => ({
      id: `dm-${i}`,
      senderId: 'maya',
      recipientId: i % 2 === 0 ? 'omar' : 'luca',
      text: 'spam',
      createdAt: new Date(now - 30_000 - i * 1_000).toISOString(),
    }));
    const burst = groupSlowMode([], directs, 'maya', group.id, now);
    expect(burst.ok).toBe(false);
    if (burst.ok) return;
    expect(burst.kind).toBe('burst');
  });

  it('lists the group beside a 1:1 thread and counts unread', () => {
    const message: GroupMessage = {
      id: 'gm-2',
      groupId: group.id,
      senderId: 'omar',
      text: 'sofa',
      createdAt: new Date(now).toISOString(),
      share: {
        postId: 'p2',
        authorId: 'maya',
        authorName: 'Maya Chen',
        authorHandle: 'mayagoals',
        snippet: 'Still believe.',
      },
    };
    expect(unreadInGroup([message], group.id, 'maya', [], undefined)).toBe(1);
    expect(unreadInGroup([message], group.id, 'maya', ['omar'], undefined)).toBe(0);
    const inbox = conversationInbox({
      directs: [
        {
          id: 'maya::jordan',
          peerId: 'jordan',
          unreadCount: 0,
          lastMessage: {
            id: 'dm-j',
            senderId: 'jordan',
            recipientId: 'maya',
            text: 'YNWA',
            createdAt: new Date(now - 60_000).toISOString(),
          },
        },
      ],
      groups: [group],
      groupMessages: [message],
      userId: 'maya',
      hiddenIds: [],
      groupReads: {},
      nameOf: (id) => (id === 'omar' ? 'Omar Haddad' : 'Jordan Blake'),
    });
    expect(inbox.map((row) => row.kind)).toEqual(['group', 'direct']);
    expect(inbox[0]).toMatchObject({
      kind: 'group',
      memberCount: 3,
      unreadCount: 1,
      preview: "Omar Haddad: Shared Maya Chen's post",
    });
  });
});

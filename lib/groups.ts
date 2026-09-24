import type { DirectMessage, DmGroup, GroupMessage, MatchTapeAnchor, SharedPostPayload } from '@/data/types';
import { parseMatchTapeAnchor } from '@/lib/matchTape';
import type { DmThread } from '@/lib/dms';
import { DM_TEXT_MAX, normalizeDmText, slowModeFromStamps, stampsAtOrBefore } from '@/lib/dms';
import type { SlowModeDecision } from '@/lib/moderation';
import { chatPreview, parseSharedPost } from '@/lib/shareToChat';
import { isPersistedUserId } from '@/lib/userIdentity';

export const GROUP_TITLE_MAX = 80;
export const GROUP_PICK_MIN = 2;
export const GROUP_PICK_MAX = 20;

const GROUP_ID_RE = /^grp-[a-z0-9]{4,16}-[a-z0-9]{1,16}$/i;

export type GroupPlan =
  | { ok: true; memberIds: string[]; title: string | null }
  | { ok: false; error: string };

export type SendGroupResult =
  | { ok: true; message: GroupMessage }
  | { ok: false; error: string; slow?: SlowModeDecision };

export type InboxEntry =
  | {
      kind: 'direct';
      id: string;
      sortAt: string;
      unreadCount: number;
      peerId: string;
      preview: string;
    }
  | {
      kind: 'group';
      id: string;
      sortAt: string;
      unreadCount: number;
      title: string;
      memberCount: number;
      preview: string;
    };

export function isGroupId(id: string): boolean {
  return GROUP_ID_RE.test(id);
}

export function createGroupId(now: number, creatorId: string): string {
  const suffix = creatorId.replace(/[^a-z0-9]/gi, '').slice(0, 12) || 'fan';
  return `grp-${now.toString(36)}-${suffix}`;
}

export function normalizeGroupTitle(title: string | null | undefined): { ok: true; title: string | null } | { ok: false; error: string } {
  if (title == null) return { ok: true, title: null };
  const trimmed = title.trim().replace(/\s+/g, ' ');
  if (!trimmed) return { ok: true, title: null };
  if (trimmed.length > GROUP_TITLE_MAX) {
    return { ok: false, error: `Keep the group name under ${GROUP_TITLE_MAX} characters.` };
  }
  return { ok: true, title: trimmed };
}

/** Untitled groups show the other members, shortened when the list is long. */
export function defaultGroupTitle(names: readonly string[], max = 42): string {
  const clean = names.map((name) => name.trim()).filter(Boolean);
  if (clean.length === 0) return 'Group chat';
  const joined = clean.join(', ');
  if (joined.length <= max) return joined;
  if (clean.length >= 2) {
    const extra = clean.length - 2;
    const short = extra > 0 ? `${clean[0]}, ${clean[1]} +${extra}` : `${clean[0]}, ${clean[1]}`;
    if (short.length <= max) return short;
  }
  const slice = clean[0].slice(0, Math.max(1, max - 1)).trimEnd();
  return `${slice}…`;
}

export function displayGroupTitle(
  group: Pick<DmGroup, 'title' | 'memberIds'>,
  viewerId: string,
  nameOf: (id: string) => string | undefined,
): string {
  const custom = group.title?.trim();
  if (custom) return custom;
  const names = group.memberIds
    .filter((id) => id !== viewerId)
    .map((id) => nameOf(id)?.trim() || 'Fan');
  return defaultGroupTitle(names);
}

function uniqueIds(ids: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of ids) {
    const id = raw.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function pairBlocked(a: string, b: string, blocks: Record<string, readonly string[]> | undefined): boolean {
  if (!blocks) return false;
  return (blocks[a] ?? []).includes(b) || (blocks[b] ?? []).includes(a);
}

/**
 * Creator plus at least two mutual friends.
 * Blocked fans (either direction, including between picks) cannot be added.
 */
export function planDmGroup(input: {
  creatorId: string;
  pickedIds: readonly string[];
  mutualFriendIds: readonly string[];
  hiddenIds: readonly string[];
  blocks?: Record<string, readonly string[]>;
  title?: string | null;
}): GroupPlan {
  if (!isPersistedUserId(input.creatorId)) {
    return { ok: false, error: 'Sign in to start a group.' };
  }
  const named = normalizeGroupTitle(input.title);
  if (!named.ok) return named;
  const picked = uniqueIds(input.pickedIds).filter((id) => id !== input.creatorId);
  if (picked.length < GROUP_PICK_MIN) {
    return { ok: false, error: 'Pick at least two friends.' };
  }
  if (picked.length > GROUP_PICK_MAX) {
    return { ok: false, error: `Groups can include up to ${GROUP_PICK_MAX} friends.` };
  }
  const mutual = new Set(input.mutualFriendIds);
  const hidden = new Set(input.hiddenIds);
  for (const id of picked) {
    if (!isPersistedUserId(id)) return { ok: false, error: 'That fan isn’t on KickFeed.' };
    if (hidden.has(id) || pairBlocked(input.creatorId, id, input.blocks)) {
      return { ok: false, error: 'Blocked fans can’t be added to a group.' };
    }
    if (!mutual.has(id)) return { ok: false, error: 'Groups are for mutual friends.' };
  }
  for (let i = 0; i < picked.length; i += 1) {
    for (let j = i + 1; j < picked.length; j += 1) {
      if (pairBlocked(picked[i], picked[j], input.blocks)) {
        return { ok: false, error: 'Two of those fans have blocked each other.' };
      }
    }
  }
  return { ok: true, memberIds: [input.creatorId, ...picked], title: named.title };
}

export function parseDmGroup(value: unknown): DmGroup | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const id = typeof row.id === 'string' ? row.id.trim() : '';
  const createdBy = typeof row.createdBy === 'string' ? row.createdBy.trim() : '';
  if (!isGroupId(id) || !isPersistedUserId(createdBy)) return null;
  if (!Array.isArray(row.memberIds)) return null;
  const memberIds = uniqueIds(row.memberIds.filter((item): item is string => typeof item === 'string'));
  if (memberIds.length < 2 || memberIds.some((memberId) => !isPersistedUserId(memberId))) return null;
  const createdAt =
    typeof row.createdAt === 'string' && Number.isFinite(Date.parse(row.createdAt)) ? row.createdAt : null;
  if (!createdAt) return null;
  const named = normalizeGroupTitle(typeof row.title === 'string' ? row.title : null);
  if (!named.ok) return null;
  return { id, title: named.title, createdBy, memberIds, createdAt };
}

export function buildDmGroup(
  creatorId: string,
  memberIds: readonly string[],
  title: string | null,
  now: number,
): DmGroup | null {
  return parseDmGroup({
    id: createGroupId(now, creatorId),
    title,
    createdBy: creatorId,
    memberIds: [...memberIds],
    createdAt: new Date(now).toISOString(),
  });
}

export function parseGroupMessage(value: unknown): GroupMessage | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const groupId = typeof row.groupId === 'string' ? row.groupId.trim() : '';
  const senderId = typeof row.senderId === 'string' ? row.senderId.trim() : '';
  if (!isGroupId(groupId) || !isPersistedUserId(senderId)) return null;
  if (typeof row.text !== 'string') return null;
  const text = normalizeDmText(row.text);
  if (!text || text.length > DM_TEXT_MAX) return null;
  const createdAt =
    typeof row.createdAt === 'string' && Number.isFinite(Date.parse(row.createdAt)) ? row.createdAt : null;
  if (!createdAt) return null;
  const id = typeof row.id === 'string' && row.id.trim() ? row.id.trim() : `gm-${Date.parse(createdAt)}-${senderId}`;
  const message: GroupMessage = { id, groupId, senderId, text, createdAt };
  const share = parseSharedPost(row.share);
  if (share) message.share = share;
  const tape = parseMatchTapeAnchor(row.tape);
  if (tape) message.tape = tape;
  return message;
}

export function buildGroupMessage(input: {
  groupId: string;
  senderId: string;
  text: string;
  share?: SharedPostPayload;
  tape?: MatchTapeAnchor;
  now: number;
  id?: string;
}): GroupMessage | null {
  const suffix = input.senderId.replace(/[^a-z0-9]/gi, '').slice(0, 12) || 'fan';
  return parseGroupMessage({
    id: input.id ?? `gm-${input.now}-${suffix}`,
    groupId: input.groupId,
    senderId: input.senderId,
    text: input.text,
    createdAt: new Date(input.now).toISOString(),
    share: input.share,
    tape: input.tape,
  });
}

export function isGroupMember(group: DmGroup, userId: string | null | undefined): boolean {
  return !!userId && group.memberIds.includes(userId);
}

/** New messages and shares stop when any other member is blocked in either direction. */
export function groupSendBlockReason(
  group: DmGroup,
  userId: string | null | undefined,
  hiddenIds: readonly string[],
): string | null {
  if (!userId || !isGroupMember(group, userId)) return 'You’re not in this group.';
  const hidden = new Set(hiddenIds);
  if (group.memberIds.some((id) => id !== userId && hidden.has(id))) {
    return 'Someone in this group is blocked, so new messages and shares stay off.';
  }
  return null;
}

export function visibleGroupMessages(
  messages: readonly GroupMessage[],
  groupId: string,
  hiddenIds: readonly string[],
): GroupMessage[] {
  const hidden = new Set(hiddenIds);
  return messages
    .filter((row) => row.groupId === groupId && !hidden.has(row.senderId))
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}

export function groupSlowMode(
  groupMessages: readonly GroupMessage[],
  directMessages: readonly DirectMessage[],
  userId: string | null | undefined,
  groupId: string,
  now: number,
): SlowModeDecision {
  if (!userId) return { ok: true };
  const mineGroups = groupMessages.filter((row) => row.senderId === userId);
  const thread = mineGroups.filter((row) => row.groupId === groupId);
  const mineDirect = directMessages.filter((row) => row.senderId === userId);
  return slowModeFromStamps(
    stampsAtOrBefore(thread, now),
    [...stampsAtOrBefore(mineGroups, now), ...stampsAtOrBefore(mineDirect, now)],
    now,
  );
}

function readMs(stamp: string | undefined): number {
  if (!stamp) return Number.NEGATIVE_INFINITY;
  const parsed = Date.parse(stamp);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

export function unreadInGroup(
  messages: readonly GroupMessage[],
  groupId: string,
  userId: string,
  hiddenIds: readonly string[],
  readStamp: string | undefined,
): number {
  const floor = readMs(readStamp);
  return visibleGroupMessages(messages, groupId, hiddenIds).filter((row) => {
    if (row.senderId === userId) return false;
    const created = Date.parse(row.createdAt);
    return Number.isFinite(created) && created > floor;
  }).length;
}

export function conversationInbox(input: {
  directs: readonly DmThread[];
  groups: readonly DmGroup[];
  groupMessages: readonly GroupMessage[];
  userId: string | null;
  hiddenIds: readonly string[];
  groupReads: Record<string, string>;
  nameOf: (id: string) => string | undefined;
}): InboxEntry[] {
  if (!input.userId) return [];
  const userId = input.userId;
  const directs: InboxEntry[] = input.directs.map((thread) => ({
    kind: 'direct',
    id: thread.id,
    sortAt: thread.lastMessage.createdAt,
    unreadCount: thread.unreadCount,
    peerId: thread.peerId,
    preview: chatPreview(thread.lastMessage.text, thread.lastMessage.share),
  }));
  const groups: InboxEntry[] = input.groups
    .filter((group) => isGroupMember(group, userId))
    .map((group) => {
      const visible = visibleGroupMessages(input.groupMessages, group.id, input.hiddenIds);
      const last = visible.at(-1);
      const preview = last
        ? `${last.senderId === userId ? 'You' : input.nameOf(last.senderId) || 'Fan'}: ${chatPreview(last.text, last.share)}`
        : 'No messages yet';
      return {
        kind: 'group' as const,
        id: group.id,
        sortAt: last?.createdAt ?? group.createdAt,
        unreadCount: unreadInGroup(input.groupMessages, group.id, userId, input.hiddenIds, input.groupReads[group.id]),
        title: displayGroupTitle(group, userId, input.nameOf),
        memberCount: group.memberIds.length,
        preview,
      };
    });
  return [...directs, ...groups].sort((a, b) => Date.parse(b.sortAt) - Date.parse(a.sortAt));
}

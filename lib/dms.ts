import type { AppNotification, DirectMessage, SharedPostPayload, User } from '@/data/types';
import { parseSharedPost } from '@/lib/shareToChat';
import { DM_SLOW_MODE_HINT } from '@/lib/honesty';
import {
  formatSlowModeWait,
  uniqueBlockedIds,
  type SlowModeDecision,
} from '@/lib/moderation';
import type { AuthMode } from '@/lib/userIdentity';
import { isPersistedUserId } from '@/lib/userIdentity';

export const DM_TEXT_MIN = 1;
export const DM_TEXT_MAX = 1000;

/** One send per user per 1:1 thread. Same lesson as match-chat slow-mode. */
export const DM_SLOW_MODE_COOLDOWN_MS = 20_000;
/** Burst cap across all DM threads. */
export const DM_SLOW_MODE_BURST_COUNT = 8;
export const DM_SLOW_MODE_BURST_WINDOW_MS = 2 * 60_000;

export type SendDmInput = {
  senderId: string;
  recipientId: string;
  text: string;
  share?: SharedPostPayload;
};

export type SendDmResult =
  | { ok: true; message: DirectMessage }
  | { ok: false; error: string; slow?: SlowModeDecision };

export type DmThread = {
  id: string;
  peerId: string;
  lastMessage: DirectMessage;
  unreadCount: number;
};

/** Stable 1:1 key so Maya→Omar and Omar→Maya are one thread. */
export function dmThreadId(a: string, b: string): string {
  return a < b ? `${a}::${b}` : `${b}::${a}`;
}

export function dmPeerId(message: DirectMessage, userId: string): string {
  return message.senderId === userId ? message.recipientId : message.senderId;
}

export function normalizeDmText(text: string): string | null {
  const trimmed = text.trim().replace(/\s+/g, ' ');
  if (trimmed.length < DM_TEXT_MIN || trimmed.length > DM_TEXT_MAX) return null;
  return trimmed;
}

export function isDirectMessagePair(a: string, b: string): boolean {
  return isPersistedUserId(a) && isPersistedUserId(b) && a !== b;
}

export function parseDirectMessage(value: unknown): DirectMessage | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const senderId = typeof row.senderId === 'string' ? row.senderId : '';
  const recipientId = typeof row.recipientId === 'string' ? row.recipientId : '';
  if (!isDirectMessagePair(senderId, recipientId)) return null;
  if (typeof row.text !== 'string') return null;
  const text = normalizeDmText(row.text);
  if (!text) return null;
  const createdAt =
    typeof row.createdAt === 'string' && Number.isFinite(Date.parse(row.createdAt))
      ? row.createdAt
      : null;
  if (!createdAt) return null;
  const id = typeof row.id === 'string' && row.id.trim() ? row.id.trim() : `dm-${Date.parse(createdAt)}`;
  const message: DirectMessage = { id, senderId, recipientId, text, createdAt };
  const share = parseSharedPost(row.share);
  if (share) message.share = share;
  return message;
}

export function buildDirectMessage(input: SendDmInput, now: number, id?: string): DirectMessage | null {
  return parseDirectMessage({
    id: id ?? `dm-${now}-${input.senderId}`,
    senderId: input.senderId,
    recipientId: input.recipientId,
    text: input.text,
    createdAt: new Date(now).toISOString(),
    share: input.share,
  });
}

export function involvedInMessage(message: DirectMessage, userId: string): boolean {
  return message.senderId === userId || message.recipientId === userId;
}

export function messagesForUser(messages: DirectMessage[], userId: string | null): DirectMessage[] {
  if (!userId) return [];
  return messages.filter((row) => involvedInMessage(row, userId));
}

export function messagesForThread(
  messages: DirectMessage[],
  userId: string,
  peerId: string,
): DirectMessage[] {
  const thread = dmThreadId(userId, peerId);
  return messages
    .filter((row) => involvedInMessage(row, userId) && dmThreadId(row.senderId, row.recipientId) === thread)
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}

/**
 * People this user cannot DM: outgoing blocks + people who blocked them.
 * Demo can invert the full `blocks` map on-device; live also passes incoming ids.
 */
export function cannotDmIds(
  userId: string | null,
  outgoingBlockedIds: readonly string[],
  allBlocks: Record<string, string[]>,
  incomingBlockedBy: readonly string[] = [],
): string[] {
  if (!userId) return [];
  const out = uniqueBlockedIds([...outgoingBlockedIds, ...incomingBlockedBy], userId);
  const extra: string[] = [];
  for (const [blockerId, ids] of Object.entries(allBlocks)) {
    if (blockerId === userId || !isPersistedUserId(blockerId)) continue;
    if (ids.includes(userId)) extra.push(blockerId);
  }
  return uniqueBlockedIds([...out, ...extra], userId);
}

export function canDmPeer(userId: string | null, peerId: string | null | undefined, hiddenPeerIds: readonly string[]): boolean {
  if (!userId || !peerId || userId === peerId) return false;
  if (!isPersistedUserId(peerId)) return false;
  return !hiddenPeerIds.includes(peerId);
}

export function visibleDirectMessages(
  messages: DirectMessage[],
  userId: string | null,
  hiddenPeerIds: readonly string[],
): DirectMessage[] {
  if (!userId) return [];
  const hidden = new Set(hiddenPeerIds);
  return messages.filter((row) => {
    if (!involvedInMessage(row, userId)) return false;
    const peer = dmPeerId(row, userId);
    return !hidden.has(peer);
  });
}

function lastReadMs(reads: Record<string, string> | undefined, peerId: string): number {
  const stamp = reads?.[peerId];
  if (!stamp) return Number.NEGATIVE_INFINITY;
  const parsed = Date.parse(stamp);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

export function inboxThreads(
  messages: DirectMessage[],
  userId: string | null,
  hiddenPeerIds: readonly string[],
  reads: Record<string, string> = {},
): DmThread[] {
  if (!userId) return [];
  const visible = visibleDirectMessages(messages, userId, hiddenPeerIds);
  const latest = new Map<string, DirectMessage>();
  const unread = new Map<string, number>();
  for (const row of visible) {
    const peer = dmPeerId(row, userId);
    const prev = latest.get(peer);
    if (!prev || Date.parse(row.createdAt) >= Date.parse(prev.createdAt)) {
      latest.set(peer, row);
    }
    const created = Date.parse(row.createdAt);
    if (row.senderId === peer && Number.isFinite(created) && created > lastReadMs(reads, peer)) {
      unread.set(peer, (unread.get(peer) ?? 0) + 1);
    }
  }
  return [...latest.entries()]
    .map(([peerId, lastMessage]) => ({
      id: dmThreadId(userId, peerId),
      peerId,
      lastMessage,
      unreadCount: unread.get(peerId) ?? 0,
    }))
    .sort((a, b) => Date.parse(b.lastMessage.createdAt) - Date.parse(a.lastMessage.createdAt));
}

export function unreadDmCount(
  messages: DirectMessage[],
  userId: string | null,
  hiddenPeerIds: readonly string[],
  reads: Record<string, string> = {},
): number {
  return inboxThreads(messages, userId, hiddenPeerIds, reads).reduce((sum, thread) => sum + thread.unreadCount, 0);
}

export function stampsAtOrBefore(rows: readonly { createdAt: string }[], now: number): number[] {
  const out: number[] = [];
  for (const row of rows) {
    const stamp = Date.parse(row.createdAt);
    if (Number.isFinite(stamp) && stamp <= now) out.push(stamp);
  }
  return out;
}

/** Shared 20s thread cooldown + 8 / 2 min burst used by 1:1 and group sends. */
export function slowModeFromStamps(
  threadStamps: readonly number[],
  allStamps: readonly number[],
  now: number,
): SlowModeDecision {
  let lastThread = Number.NEGATIVE_INFINITY;
  for (const stamp of threadStamps) {
    if (stamp > lastThread) lastThread = stamp;
  }
  if (lastThread !== Number.NEGATIVE_INFINITY) {
    const retryAt = lastThread + DM_SLOW_MODE_COOLDOWN_MS;
    if (now < retryAt) {
      return { ok: false, remainingMs: retryAt - now, retryAt, kind: 'cooldown' };
    }
  }

  const burst = allStamps.filter((stamp) => now - stamp < DM_SLOW_MODE_BURST_WINDOW_MS);
  if (burst.length >= DM_SLOW_MODE_BURST_COUNT) {
    const oldest = Math.min(...burst);
    const retryAt = oldest + DM_SLOW_MODE_BURST_WINDOW_MS;
    if (now < retryAt) {
      return { ok: false, remainingMs: retryAt - now, retryAt, kind: 'burst' };
    }
  }
  return { ok: true };
}

/**
 * DM rate limit for the signed-in identity (demo id or uuid).
 * 20s cooldown in the current thread; 8 messages / 2 min across all DMs.
 * `otherSends` (group messages) count toward the burst only.
 */
export function dmSlowMode(
  messages: DirectMessage[],
  userId: string | null | undefined,
  peerId: string | null | undefined,
  now: number,
  otherSends: readonly { createdAt: string }[] = [],
): SlowModeDecision {
  if (!userId) return { ok: true };
  const mine = messages.filter((row) => row.senderId === userId);
  const thread =
    peerId && isPersistedUserId(peerId)
      ? mine.filter((row) => dmThreadId(row.senderId, row.recipientId) === dmThreadId(userId, peerId))
      : mine;
  return slowModeFromStamps(
    stampsAtOrBefore(thread, now),
    [...stampsAtOrBefore(mine, now), ...stampsAtOrBefore(otherSends, now)],
    now,
  );
}

export function dmSlowModeComposerCopy(decision: SlowModeDecision): string {
  if (decision.ok) return DM_SLOW_MODE_HINT;
  const wait = formatSlowModeWait(decision.remainingMs);
  if (decision.kind === 'burst') {
    return `Slow mode — too many messages. Try again in ${wait}.`;
  }
  return `Slow mode — wait ${wait} before sending.`;
}

/** Same gate as live ranking / moderation: email session only. Demo ids stay on-device. */
export function shouldPersistDms(supabaseConfigured: boolean, authMode: AuthMode | null): boolean {
  return supabaseConfigured && authMode === 'supabase';
}

export function dmNotification(message: DirectMessage, sender: Pick<User, 'name'> | undefined, now: number): AppNotification {
  const preview = message.text.slice(0, 80);
  return {
    id: `n-dm-${message.id}`,
    type: 'dm',
    title: `${sender?.name ?? 'A fan'} sent a message`,
    body: preview,
    createdAt: new Date(now).toISOString(),
    read: false,
    recipientId: message.recipientId,
    userId: message.senderId,
  };
}

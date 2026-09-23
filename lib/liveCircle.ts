/**
 * Live Circle (Živý kruh) — friend presence on a fixture.
 * Pure helpers: idle timeout, friend filter, chat target, push copy and debounce.
 * No React, Supabase, or device imports.
 */

export const LIVE_CIRCLE_IDLE_MS = 5 * 60 * 1000;
export const LIVE_CIRCLE_HEARTBEAT_MS = 45 * 1000;
export const LIVE_CIRCLE_POLL_MS = 15 * 1000;
/** One banner per friend per fixture. Repeat visits inside this window stay quiet. */
export const LIVE_CIRCLE_PUSH_DEBOUNCE_MS = 30 * 60 * 1000;
export const LIVE_CIRCLE_PUSH_MAX = 20;
/** Device clocks a few minutes off still count as present. */
const PRESENCE_FUTURE_SKEW_MS = 10 * 60 * 1000;

export const LIVE_CIRCLE_SETTING_TITLE = 'Live Circle';
export const LIVE_CIRCLE_SETTING_BODY =
  'Friends can see when you are on a match. People who are not your friends cannot. KickFeed clears this when you leave the match, leave the app, or after about 5 minutes of no activity. Off unless you turn it on.';
export const LIVE_CIRCLE_EMPTY = 'Be the first friend here';
export const LIVE_CIRCLE_PUSH_TITLE = 'Live Circle';

export type LiveCirclePerson = {
  userId: string;
  fixtureId: string;
  displayName: string;
  handle: string;
  initials: string;
  avatarColor: string;
  /** ISO timestamp or epoch ms. */
  heartbeatAt: string | number;
  optedIn: boolean;
};

export type LiveCircleChatTarget =
  | { kind: 'direct'; peerId: string }
  | { kind: 'group'; groupId: string };

export type LiveCircleGroupRef = {
  id: string;
  memberIds: readonly string[];
  createdAt: string;
};

export type LiveCirclePushCandidate = {
  userId: string;
  optedIn: boolean;
  friend: boolean;
  blocked: boolean;
  /** Recipient favorited one of the clubs in this fixture. */
  favorited: boolean;
  /** Recipient is currently present on this fixture (handled on their device). */
  viewing: boolean;
  pushEnabled: boolean;
  token: string | null;
  lastNotifiedAt: number | null;
};

export type LiveCirclePush = {
  userId: string;
  token: string;
  title: string;
  body: string;
  matchId: string;
  fingerprint: string;
};

export function shouldPersistLiveCircle(supabaseConfigured: boolean, authMode: string | null): boolean {
  return supabaseConfigured && authMode === 'supabase';
}

export function presenceAgeMs(heartbeatAt: string | number, now: number): number | null {
  const at = typeof heartbeatAt === 'number' ? heartbeatAt : Date.parse(heartbeatAt);
  if (!Number.isFinite(at)) return null;
  return now - at;
}

/** Fresh while the last heartbeat is inside the idle window. */
export function isPresenceFresh(
  heartbeatAt: string | number,
  now: number,
  idleMs = LIVE_CIRCLE_IDLE_MS,
): boolean {
  const age = presenceAgeMs(heartbeatAt, now);
  if (age == null) return false;
  if (age < -PRESENCE_FUTURE_SKEW_MS) return false;
  return age < idleMs;
}

export function liveCircleFixtureLabel(homeName: string, awayName: string): string {
  const home = homeName.trim().replace(/\s+/g, ' ') || 'Home';
  const away = awayName.trim().replace(/\s+/g, ' ') || 'Away';
  return `${home}–${away}`;
}

export function liveCirclePushBody(name: string, fixtureLabel: string): string {
  const who = name.trim().replace(/\s+/g, ' ').slice(0, 40) || 'A friend';
  const match = fixtureLabel.trim().replace(/\s+/g, ' ').slice(0, 80) || 'a match';
  return `${who} is live on ${match}`;
}

export function liveCircleFingerprint(recipientId: string, actorId: string, fixtureId: string): string {
  return `live:${recipientId}:${actorId}:${fixtureId}`;
}

export function isLiveCircleDebounced(lastNotifiedAt: number | null, now: number, windowMs = LIVE_CIRCLE_PUSH_DEBOUNCE_MS): boolean {
  if (lastNotifiedAt == null || !Number.isFinite(lastNotifiedAt)) return false;
  return now - lastNotifiedAt < windowMs;
}

/**
 * Friends on this fixture. Self is never included.
 * `serverTrusted` means Postgres RLS already limited the rows to mutual friends
 * who opted in. Local demo rows must pass `friendIds`.
 */
export function visibleLiveCircleFriends(input: {
  viewerId: string;
  fixtureId: string;
  now: number;
  friendIds: readonly string[];
  hiddenIds: readonly string[];
  rows: readonly LiveCirclePerson[];
  serverTrusted?: boolean;
  idleMs?: number;
}): LiveCirclePerson[] {
  const friends = new Set(input.friendIds);
  const hidden = new Set(input.hiddenIds);
  const seen = new Set<string>();
  const out: LiveCirclePerson[] = [];
  for (const row of input.rows) {
    if (!row.userId || row.userId === input.viewerId) continue;
    if (row.fixtureId !== input.fixtureId) continue;
    if (row.optedIn !== true) continue;
    if (hidden.has(row.userId)) continue;
    if (!input.serverTrusted && !friends.has(row.userId)) continue;
    if (!isPresenceFresh(row.heartbeatAt, input.now, input.idleMs)) continue;
    if (seen.has(row.userId)) continue;
    seen.add(row.userId);
    out.push(row);
  }
  out.sort((a, b) => a.displayName.localeCompare(b.displayName) || a.userId.localeCompare(b.userId));
  return out;
}

/**
 * Existing 1:1 thread, else the tightest group that already includes both fans,
 * else a new 1:1 route (the thread is created on the first send).
 */
export function liveCircleChatTarget(input: {
  viewerId: string;
  peerId: string;
  hasDirectThread: boolean;
  groups: readonly LiveCircleGroupRef[];
}): LiveCircleChatTarget | null {
  const viewerId = input.viewerId.trim();
  const peerId = input.peerId.trim();
  if (!viewerId || !peerId || viewerId === peerId) return null;
  if (input.hasDirectThread) return { kind: 'direct', peerId };
  const groups = input.groups
    .filter((group) => group.memberIds.includes(viewerId) && group.memberIds.includes(peerId))
    .sort((a, b) => {
      const size = a.memberIds.length - b.memberIds.length;
      if (size !== 0) return size;
      return Date.parse(b.createdAt) - Date.parse(a.createdAt);
    });
  const group = groups[0];
  if (group) return { kind: 'group', groupId: group.id };
  return { kind: 'direct', peerId };
}

export function liveCircleRoute(target: LiveCircleChatTarget): string {
  return target.kind === 'group' ? `/messages/group/${target.groupId}` : `/messages/${target.peerId}`;
}

/**
 * Remote push candidates. Viewing friends are excluded: their open match screen
 * raises the local banner, so a second Expo push does not stack.
 * Favorited friends who are not on the match still qualify.
 */
export function planLiveCirclePushes(input: {
  actorId: string;
  actorOptedIn: boolean;
  actorName: string;
  fixtureId: string;
  fixtureLabel: string;
  now: number;
  candidates: readonly LiveCirclePushCandidate[];
}): LiveCirclePush[] {
  if (!input.actorOptedIn || !input.actorId || !input.fixtureId) return [];
  const title = LIVE_CIRCLE_PUSH_TITLE;
  const body = liveCirclePushBody(input.actorName, input.fixtureLabel);
  const out: LiveCirclePush[] = [];
  const seen = new Set<string>();
  for (const candidate of input.candidates) {
    if (out.length >= LIVE_CIRCLE_PUSH_MAX) break;
    if (!candidate.userId || candidate.userId === input.actorId) continue;
    if (seen.has(candidate.userId)) continue;
    if (!candidate.optedIn || !candidate.friend || candidate.blocked) continue;
    if (candidate.viewing) continue;
    if (!candidate.favorited) continue;
    if (!candidate.pushEnabled || !candidate.token) continue;
    if (isLiveCircleDebounced(candidate.lastNotifiedAt, input.now)) continue;
    seen.add(candidate.userId);
    out.push({
      userId: candidate.userId,
      token: candidate.token,
      title,
      body,
      matchId: input.fixtureId,
      fingerprint: liveCircleFingerprint(candidate.userId, input.actorId, input.fixtureId),
    });
  }
  return out;
}

const FIXTURE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,79}$/;

export function isLiveCircleFixtureId(value: string): boolean {
  return FIXTURE_ID_RE.test(value);
}

export function liveCircleProfilePayload(user: {
  name: string;
  handle: string;
  initials: string;
  avatarColor: string;
}): { displayName: string; handle: string; initials: string; avatarColor: string } {
  const displayName = user.name.trim().replace(/\s+/g, ' ').slice(0, 80) || 'Fan';
  const handle = user.handle.trim().replace(/^@/, '').replace(/\s+/g, '').slice(0, 32) || 'fan';
  const initials = (user.initials.trim().slice(0, 4) || displayName.slice(0, 2) || 'KF').toUpperCase();
  const avatarColor = /^#[0-9A-Fa-f]{3,8}$/.test(user.avatarColor) ? user.avatarColor : '#22C55E';
  return { displayName, handle, initials, avatarColor };
}

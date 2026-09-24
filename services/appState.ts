import type { AppNotification, Comment, DirectMessage, DmGroup, Fixture, GroupMessage, MatchStatus, MatchTapeAnchor, MatchTapeAttachment, MotmVote, Post, PostAudience, ScorePrediction, SharedPostPayload, User, UserReport } from '@/data/types';
import { seedMotmVotes, seedPredictions } from '@/data/mocks/engagement';
import { demoUsers, seedComments, seedDirectMessages, seedFollowing, seedNotifications, seedPosts } from '@/data/mocks/social';
import {
  buildDirectMessage,
  canDmPeer,
  cannotDmIds,
  dmNotification,
  dmSlowMode,
  involvedInMessage,
  parseDirectMessage,
  type SendDmResult,
} from '@/lib/dms';
import {
  buildDmGroup,
  buildGroupMessage,
  displayGroupTitle,
  groupSendBlockReason,
  groupSlowMode,
  isGroupId,
  isGroupMember,
  parseDmGroup,
  parseGroupMessage,
  planDmGroup,
  type SendGroupResult,
} from '@/lib/groups';
import { chatPreview, parseSharedPost } from '@/lib/shareToChat';
import { clampScore, isMotmOpen, isPredictionOpen, motmVoteForUser, predictionForUser } from '@/lib/engagement';
import type { MatchAlertDraft } from '@/lib/matchSocial';
import {
  buildUserReport,
  matchChatSlowMode,
  parseUserReport,
  reportKey,
  uniqueBlockedIds,
  visibleNotifications,
  type ReportInput,
  type ReportResult,
} from '@/lib/moderation';
import { friendPostRecipientIds } from '@/lib/homeFeed';
import { isLiveCircleDebounced, liveCirclePushBody } from '@/lib/liveCircle';
import {
  createTapeId,
  dmTapeThreadKey,
  gateTapeMessage,
  mergeMatchTapes,
  parseMatchTapeAttachment,
  planMatchTapeArchive,
  planMatchTapeAttach,
  type TapeScoreSnapshot,
  type TapeTeams,
} from '@/lib/matchTape';
import {
  inferAuthMode,
  isDemoUserId,
  isPersistedUserId,
  isSupabaseUserId,
  userFromProfile,
  type AuthMode,
} from '@/lib/userIdentity';

export const STATE_SCHEMA_VERSION = 2;

export type { AuthMode };

export interface FavoriteSlice {
  teams: string[];
  leagues: string[];
  players: string[];
}

export interface Persisted {
  schemaVersion: number;
  currentUserId: string | null;
  /** `demo` seeded picker vs `supabase` session. Inferred from `currentUserId` when missing. */
  authMode: AuthMode | null;
  following: Record<string, string[]>;
  favorites: Record<string, FavoriteSlice>;
  profiles: Record<string, Partial<User>>;
  posts: Post[];
  likes: Record<string, string[]>;
  comments: Comment[];
  notifications: AppNotification[];
  predictions: ScorePrediction[];
  motmVotes: MotmVote[];
  /** blockerId → blocked user ids (demo seed or auth uuid). */
  blocks: Record<string, string[]>;
  /** userId → people who blocked them (live incoming; demo also inverted from `blocks`). */
  blockedBy: Record<string, string[]>;
  reports: UserReport[];
  directMessages: DirectMessage[];
  /** userId → peerId → last-read ISO. Unread is this device. */
  dmReads: Record<string, Record<string, string>>;
  dmGroups: DmGroup[];
  groupMessages: GroupMessage[];
  /** userId → groupId → last-read ISO. Unread is this device. */
  groupReads: Record<string, Record<string, string>>;
  /**
   * Live Circle opt-in per user. Missing key = never chosen (off).
   * Explicit false stays off and is not replaced by a remote true.
   */
  liveCircleEnabled: Record<string, boolean>;
  /** Fixture bound to a DM or group. Demo stays in this blob; email accounts also sync. */
  matchTapes: MatchTapeAttachment[];
}

export function defaults(): Persisted {
  const favorites: Persisted['favorites'] = {};
  for (const u of demoUsers) {
    favorites[u.id] = { teams: [...u.favoriteTeamIds], leagues: [...u.favoriteLeagueIds], players: [] };
  }
  return {
    schemaVersion: STATE_SCHEMA_VERSION,
    currentUserId: null,
    authMode: null,
    following: { ...seedFollowing },
    favorites,
    profiles: {},
    posts: seedPosts,
    likes: { maya: ['p1', 'p3'], jordan: ['p2'] },
    comments: seedComments,
    notifications: seedNotifications,
    predictions: seedPredictions,
    motmVotes: seedMotmVotes,
    blocks: {},
    blockedBy: {},
    reports: [],
    directMessages: seedDirectMessages,
    dmReads: {},
    dmGroups: [],
    groupMessages: [],
    groupReads: {},
    liveCircleEnabled: {},
    matchTapes: [],
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function persistableUserId(value: unknown): string | null {
  return typeof value === 'string' && isPersistedUserId(value) ? value : null;
}

function pickRecord<T>(value: unknown, fallback: T): T {
  return isPlainObject(value) ? ({ ...fallback, ...value } as T) : fallback;
}

function pickArray<T>(value: unknown, fallback: T[]): T[] {
  return Array.isArray(value) ? (value as T[]) : fallback;
}

function pickIdList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
}

function parsePrediction(value: unknown): ScorePrediction | null {
  if (!isPlainObject(value)) return null;
  if (typeof value.matchId !== 'string' || typeof value.userId !== 'string') return null;
  if (typeof value.homeScore !== 'number' || typeof value.awayScore !== 'number') return null;
  if (typeof value.createdAt !== 'string') return null;
  return {
    matchId: value.matchId,
    userId: value.userId,
    homeScore: clampScore(value.homeScore),
    awayScore: clampScore(value.awayScore),
    createdAt: value.createdAt,
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : value.createdAt,
  };
}

function parseMotmVote(value: unknown): MotmVote | null {
  if (!isPlainObject(value)) return null;
  if (typeof value.matchId !== 'string' || typeof value.userId !== 'string') return null;
  if (typeof value.playerKey !== 'string' || typeof value.playerName !== 'string' || typeof value.teamId !== 'string') {
    return null;
  }
  if (typeof value.createdAt !== 'string') return null;
  return {
    matchId: value.matchId,
    userId: value.userId,
    playerKey: value.playerKey,
    playerId: typeof value.playerId === 'string' ? value.playerId : undefined,
    playerName: value.playerName,
    teamId: value.teamId,
    createdAt: value.createdAt,
  };
}

/**
 * Missing / non-array → fallback (v1 blobs without these keys still get community seeds).
 * A present array is authoritative, including [] — never reseed over a cleared or empty save.
 */
function pickParsedRows<T>(value: unknown, fallback: T[], parse: (row: unknown) => T | null): T[] {
  if (!Array.isArray(value)) return fallback;
  return value.map(parse).filter((row): row is T => row != null);
}

function pickPredictions(value: unknown, fallback: ScorePrediction[]): ScorePrediction[] {
  return pickParsedRows(value, fallback, parsePrediction);
}

function pickMotmVotes(value: unknown, fallback: MotmVote[]): MotmVote[] {
  return pickParsedRows(value, fallback, parseMotmVote);
}

export function favoriteSlice(value: unknown): FavoriteSlice {
  const raw = isPlainObject(value) ? value : {};
  return {
    teams: pickIdList(raw.teams),
    leagues: pickIdList(raw.leagues),
    players: pickIdList(raw.players),
  };
}

function pickFavorites(value: unknown, fallback: Persisted['favorites']): Persisted['favorites'] {
  const merged = pickRecord(value, fallback);
  const out: Persisted['favorites'] = {};
  for (const [userId, slice] of Object.entries({ ...fallback, ...merged })) {
    out[userId] = favoriteSlice(slice);
  }
  return out;
}

function pickLiveCircle(value: unknown): Record<string, boolean> {
  if (!isPlainObject(value)) return {};
  const out: Record<string, boolean> = {};
  for (const [userId, enabled] of Object.entries(value)) {
    if (!isPersistedUserId(userId)) continue;
    if (enabled === true || enabled === false) out[userId] = enabled;
  }
  return out;
}

function pickBlocks(value: unknown, fallback: Persisted['blocks']): Persisted['blocks'] {
  if (!isPlainObject(value)) return fallback;
  const out: Persisted['blocks'] = { ...fallback };
  for (const [userId, ids] of Object.entries(value)) {
    if (!isPersistedUserId(userId)) continue;
    out[userId] = uniqueBlockedIds(ids, userId);
  }
  return out;
}

function pickGroupReads(value: unknown, fallback: Persisted['groupReads']): Persisted['groupReads'] {
  if (!isPlainObject(value)) return fallback;
  const out: Persisted['groupReads'] = { ...fallback };
  for (const [userId, groups] of Object.entries(value)) {
    if (!isPersistedUserId(userId) || !isPlainObject(groups)) continue;
    const slice: Record<string, string> = {};
    for (const [groupId, stamp] of Object.entries(groups)) {
      if (!isGroupId(groupId)) continue;
      if (typeof stamp !== 'string' || !Number.isFinite(Date.parse(stamp))) continue;
      slice[groupId] = stamp;
    }
    out[userId] = slice;
  }
  return out;
}

function pickDmReads(value: unknown, fallback: Persisted['dmReads']): Persisted['dmReads'] {
  if (!isPlainObject(value)) return fallback;
  const out: Persisted['dmReads'] = { ...fallback };
  for (const [userId, peers] of Object.entries(value)) {
    if (!isPersistedUserId(userId) || !isPlainObject(peers)) continue;
    const slice: Record<string, string> = {};
    for (const [peerId, stamp] of Object.entries(peers)) {
      if (!isPersistedUserId(peerId) || peerId === userId) continue;
      if (typeof stamp !== 'string' || !Number.isFinite(Date.parse(stamp))) continue;
      slice[peerId] = stamp;
    }
    out[userId] = slice;
  }
  return out;
}

/**
 * Parse AsyncStorage JSON.
 * Corrupt JSON → full defaults.
 * Missing/future schemaVersion still keeps valid slices (user, follows, posts, predictions, …)
 * and stamps STATE_SCHEMA_VERSION. Unknown currentUserId becomes null.
 * Demo ids (`maya`) and Supabase uuids are kept; other strings are cleared.
 */
export function hydratePersisted(raw: string | null): Persisted {
  const base = defaults();
  if (!raw) return base;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return base;
  }
  if (!isPlainObject(parsed)) return base;

  const currentUserId = persistableUserId(parsed.currentUserId);
  return {
    schemaVersion: STATE_SCHEMA_VERSION,
    currentUserId,
    authMode: inferAuthMode(currentUserId, parsed.authMode),
    following: pickRecord(parsed.following, base.following),
    favorites: pickFavorites(parsed.favorites, base.favorites),
    profiles: pickRecord(parsed.profiles, base.profiles),
    likes: pickRecord(parsed.likes, base.likes),
    posts: pickArray(parsed.posts, base.posts),
    comments: pickArray(parsed.comments, base.comments),
    notifications: pickArray(parsed.notifications, base.notifications),
    predictions: pickPredictions(parsed.predictions, base.predictions),
    motmVotes: pickMotmVotes(parsed.motmVotes, base.motmVotes),
    blocks: pickBlocks(parsed.blocks, base.blocks),
    blockedBy: pickBlocks(parsed.blockedBy, base.blockedBy),
    reports: pickParsedRows(parsed.reports, base.reports, parseUserReport),
    directMessages: pickParsedRows(parsed.directMessages, base.directMessages, parseDirectMessage),
    dmReads: pickDmReads(parsed.dmReads, base.dmReads),
    dmGroups: pickParsedRows(parsed.dmGroups, base.dmGroups, parseDmGroup),
    groupMessages: pickParsedRows(parsed.groupMessages, base.groupMessages, parseGroupMessage),
    groupReads: pickGroupReads(parsed.groupReads, base.groupReads),
    liveCircleEnabled: pickLiveCircle(parsed.liveCircleEnabled),
    matchTapes: pickParsedRows(parsed.matchTapes, base.matchTapes, parseMatchTapeAttachment),
  };
}

export function liveCircleEnabledFor(state: Persisted, userId: string | null): boolean {
  if (!userId) return false;
  return state.liveCircleEnabled[userId] === true;
}

export function setLiveCircleEnabled(state: Persisted, enabled: boolean): Persisted {
  if (!state.currentUserId) return state;
  if (state.liveCircleEnabled[state.currentUserId] === enabled) return state;
  return {
    ...state,
    liveCircleEnabled: { ...state.liveCircleEnabled, [state.currentUserId]: enabled },
  };
}

/** In-app notice when a friend appears on the match you have open. Debounced. */
export function noteFriendLive(
  state: Persisted,
  input: { actorId: string; actorName: string; fixtureId: string; fixtureLabel: string },
  now = Date.now(),
): { state: Persisted; fresh: boolean } {
  const recipientId = state.currentUserId;
  if (!recipientId || recipientId === input.actorId || !liveCircleEnabledFor(state, recipientId)) {
    return { state, fresh: false };
  }
  const id = `lc-${recipientId}-${input.actorId}-${input.fixtureId}`;
  const existing = state.notifications.find((row) => row.id === id);
  if (existing && isLiveCircleDebounced(Date.parse(existing.createdAt), now)) {
    return { state, fresh: false };
  }
  const note: AppNotification = {
    id,
    type: 'live_circle',
    title: 'Live Circle',
    body: liveCirclePushBody(input.actorName, input.fixtureLabel),
    createdAt: new Date(now).toISOString(),
    read: false,
    recipientId,
    matchId: input.fixtureId,
    userId: input.actorId,
  };
  return {
    fresh: true,
    state: {
      ...state,
      notifications: [note, ...state.notifications.filter((row) => row.id !== id)],
    },
  };
}

function profileSliceFromUser(user: User): Partial<User> {
  return {
    name: user.name,
    handle: user.handle,
    bio: user.bio,
    avatarColor: user.avatarColor,
    initials: user.initials,
    email: user.email,
    tvCountryId: user.tvCountryId,
  };
}

/**
 * Demo users always appear. Signed-in Supabase accounts (and any other uuid
 * profile/favorites keys) are merged in so feed authors resolve after email login.
 */
export function usersFromState(state: Persisted): User[] {
  const byId = new Map<string, User>();
  for (const u of demoUsers) {
    const fav = state.favorites[u.id];
    byId.set(u.id, {
      ...u,
      ...state.profiles[u.id],
      favoriteTeamIds: fav?.teams ?? u.favoriteTeamIds,
      favoriteLeagueIds: fav?.leagues ?? u.favoriteLeagueIds,
    });
  }
  const extraIds = new Set<string>([
    ...Object.keys(state.profiles),
    ...Object.keys(state.favorites),
    ...(state.currentUserId ? [state.currentUserId] : []),
    ...state.directMessages.flatMap((row) => [row.senderId, row.recipientId]),
    ...state.dmGroups.flatMap((group) => [group.createdBy, ...group.memberIds]),
    ...state.groupMessages.map((row) => row.senderId),
  ]);
  for (const id of extraIds) {
    if (byId.has(id) || !isPersistedUserId(id) || isDemoUserId(id)) continue;
    byId.set(id, userFromProfile(id, state.profiles[id], state.favorites[id]));
  }
  return [...byId.values()];
}

/** Attach a real or demo account. Per-user maps (favorites, predictions, MOTM) key off `user.id`. */
export function signInAccount(state: Persisted, user: User, mode: AuthMode): Persisted {
  if (mode === 'demo' && !isDemoUserId(user.id)) {
    return { ...state, currentUserId: null, authMode: null };
  }
  if (mode === 'supabase' && !isSupabaseUserId(user.id)) {
    return { ...state, currentUserId: null, authMode: null };
  }
  const existingProfile = state.profiles[user.id];
  const existingFav = state.favorites[user.id];
  return {
    ...state,
    currentUserId: user.id,
    authMode: mode,
    profiles: {
      ...state.profiles,
      [user.id]: {
        ...profileSliceFromUser(user),
        ...existingProfile,
        email: user.email ?? existingProfile?.email,
      },
    },
    favorites: {
      ...state.favorites,
      [user.id]: existingFav ?? {
        teams: [...user.favoriteTeamIds],
        leagues: [...user.favoriteLeagueIds],
        players: [],
      },
    },
    following: {
      ...state.following,
      [user.id]: state.following[user.id] ?? [],
    },
  };
}

/** Merge KickFeed ranking profiles so /user/[id] resolves live-board fans. Local slices win. */
export function rememberProfiles(state: Persisted, users: User[]): Persisted {
  if (!users.length) return state;
  let changed = false;
  const profiles = { ...state.profiles };
  for (const user of users) {
    if (!isPersistedUserId(user.id) || isDemoUserId(user.id)) continue;
    if (profiles[user.id]) continue;
    profiles[user.id] = profileSliceFromUser(user);
    changed = true;
  }
  return changed ? { ...state, profiles } : state;
}

/**
 * Supabase session wins on boot. If the session is gone, drop a leftover uuid so
 * demo restore still works and we never keep a signed-in uuid without a session.
 */
export function applyRestoredSession(state: Persisted, supabaseUser: User | null): Persisted {
  if (supabaseUser) return signInAccount(state, supabaseUser, 'supabase');
  if (state.authMode === 'supabase' || (state.currentUserId && isSupabaseUserId(state.currentUserId))) {
    return signOut(state);
  }
  return state;
}

/**
 * Follow-up events after boot. Demo mode is left alone so "Continue with demo"
 * is not stolen by a token refresh. INITIAL_SESSION is handled by applyRestoredSession.
 */
export function applyAuthStateChange(
  state: Persisted,
  event: string,
  supabaseUser: User | null,
): Persisted {
  if (event === 'INITIAL_SESSION' || event === 'PASSWORD_RECOVERY') return state;
  if (event === 'SIGNED_OUT') {
    return state.authMode === 'supabase' ? signOut(state) : state;
  }
  if (state.authMode === 'demo') return state;
  if (
    (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') &&
    supabaseUser
  ) {
    return signInAccount(state, supabaseUser, 'supabase');
  }
  return state;
}

function isSelfActivity(n: AppNotification, userId: string): boolean {
  return n.userId === userId;
}

export function blockedIdsFor(state: Persisted, userId: string | null): string[] {
  if (!userId) return [];
  return uniqueBlockedIds(state.blocks[userId], userId);
}

/** Peers this identity cannot DM (outgoing block, incoming block, or inverted local map). */
export function cannotDmPeerIds(state: Persisted, userId: string | null): string[] {
  if (!userId) return [];
  return cannotDmIds(userId, blockedIdsFor(state, userId), state.blocks, state.blockedBy[userId] ?? []);
}

export function canMessagePeer(state: Persisted, peerId: string | null | undefined): boolean {
  return canDmPeer(state.currentUserId, peerId, cannotDmPeerIds(state, state.currentUserId));
}

export function dmReadsFor(state: Persisted, userId: string | null): Record<string, string> {
  if (!userId) return {};
  return state.dmReads[userId] ?? {};
}

export function groupReadsFor(state: Persisted, userId: string | null): Record<string, string> {
  if (!userId) return {};
  return state.groupReads[userId] ?? {};
}

function mutualFriendIds(state: Persisted, userId: string): string[] {
  const following = state.following[userId] ?? [];
  return following.filter(
    (id) => isPersistedUserId(id) && id !== userId && (state.following[id] ?? []).includes(userId),
  );
}

function fanName(state: Persisted, userId: string): string {
  return state.profiles[userId]?.name ?? demoUsers.find((user) => user.id === userId)?.name ?? 'A fan';
}

export function notificationsFor(state: Persisted, userId: string | null): AppNotification[] {
  if (!userId) return [];
  const blocked = blockedIdsFor(state, userId);
  const cannotDm = cannotDmPeerIds(state, userId);
  return visibleNotifications(
    state.notifications.filter((n) => n.recipientId === userId && !isSelfActivity(n, userId)),
    blocked,
  )
    .filter((row) => row.type !== 'dm' || !row.userId || !cannotDm.includes(row.userId))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export function unreadCountFor(state: Persisted, userId: string | null): number {
  if (!userId) return 0;
  const blocked = new Set(blockedIdsFor(state, userId));
  const cannotDm = new Set(cannotDmPeerIds(state, userId));
  return state.notifications.filter(
    (n) =>
      n.recipientId === userId &&
      !n.read &&
      !isSelfActivity(n, userId) &&
      !(n.userId && blocked.has(n.userId)) &&
      !(n.type === 'dm' && n.userId && cannotDm.has(n.userId)),
  ).length;
}

export function signInDemo(state: Persisted, userId: string): Persisted {
  if (!isDemoUserId(userId)) return { ...state, currentUserId: null, authMode: null };
  const user = demoUsers.find((u) => u.id === userId);
  if (!user) return { ...state, currentUserId: null, authMode: null };
  return signInAccount(state, user, 'demo');
}

export function signOut(state: Persisted): Persisted {
  return { ...state, currentUserId: null, authMode: null };
}

export function follow(state: Persisted, targetUserId: string, actorDisplayName: string, now = Date.now()): Persisted {
  if (!state.currentUserId || targetUserId === state.currentUserId) return state;
  if (blockedIdsFor(state, state.currentUserId).includes(targetUserId)) return state;
  const mine = new Set(state.following[state.currentUserId] ?? []);
  mine.add(targetUserId);
  const notification: AppNotification = {
    id: `n-${now}`,
    type: 'follow',
    title: 'New follower',
    body: `${actorDisplayName} started following you.`,
    createdAt: new Date(now).toISOString(),
    read: false,
    recipientId: targetUserId,
    userId: state.currentUserId,
  };
  return {
    ...state,
    following: { ...state.following, [state.currentUserId]: [...mine] },
    notifications: [notification, ...state.notifications],
  };
}

export function unfollow(state: Persisted, userId: string): Persisted {
  if (!state.currentUserId) return state;
  return {
    ...state,
    following: {
      ...state.following,
      [state.currentUserId]: (state.following[state.currentUserId] ?? []).filter((id) => id !== userId),
    },
  };
}

function toggleIdList(list: string[], id: string, related: string[] = []): string[] {
  const group = new Set([id, ...related]);
  const has = list.some((item) => group.has(item));
  if (has) return list.filter((item) => !group.has(item));
  return [...list, id];
}

export function toggleFavoriteTeam(state: Persisted, teamId: string, relatedIds: string[] = []): Persisted {
  if (!state.currentUserId) return state;
  const cur = favoriteSlice(state.favorites[state.currentUserId]);
  return {
    ...state,
    favorites: {
      ...state.favorites,
      [state.currentUserId]: {
        ...cur,
        teams: toggleIdList(cur.teams, teamId, relatedIds),
      },
    },
  };
}

export function toggleFavoriteLeague(state: Persisted, leagueId: string, relatedIds: string[] = []): Persisted {
  if (!state.currentUserId) return state;
  const cur = favoriteSlice(state.favorites[state.currentUserId]);
  return {
    ...state,
    favorites: {
      ...state.favorites,
      [state.currentUserId]: {
        ...cur,
        leagues: toggleIdList(cur.leagues, leagueId, relatedIds),
      },
    },
  };
}

export function toggleFavoritePlayer(state: Persisted, playerId: string, relatedIds: string[] = []): Persisted {
  if (!state.currentUserId) return state;
  const cur = favoriteSlice(state.favorites[state.currentUserId]);
  return {
    ...state,
    favorites: {
      ...state.favorites,
      [state.currentUserId]: {
        ...cur,
        players: toggleIdList(cur.players, playerId, relatedIds),
      },
    },
  };
}

export function updateProfile(state: Persisted, next: Partial<Pick<User, 'name' | 'bio' | 'tvCountryId'>>): Persisted {
  if (!state.currentUserId) return state;
  return {
    ...state,
    profiles: { ...state.profiles, [state.currentUserId]: { ...state.profiles[state.currentUserId], ...next } },
  };
}

export function addPost(
  state: Persisted,
  text: string,
  imageUri?: string,
  now = Date.now(),
  matchId?: string,
  audience: PostAudience = 'friends',
): Persisted {
  if (!state.currentUserId) return state;
  const authorId = state.currentUserId;
  const authorName =
    state.profiles[authorId]?.name ?? demoUsers.find((u) => u.id === authorId)?.name ?? 'A fan';
  const attached = matchId?.trim() || undefined;
  const post: Post = {
    id: `p-${now}`,
    authorId,
    text: text.trim(),
    imageUri,
    createdAt: new Date(now).toISOString(),
    matchId: attached,
    audience,
  };
  const followerIds = friendPostRecipientIds(authorId, audience, state.following);
  const notifications: AppNotification[] = followerIds.map((recipientId) => ({
    id: `n-post-${now}-${recipientId}`,
    type: 'friend_post',
    title: `${authorName} posted`,
    body: text.trim().slice(0, 80),
    createdAt: new Date(now).toISOString(),
    read: false,
    recipientId,
    userId: authorId,
    matchId: attached,
  }));
  return {
    ...state,
    posts: [post, ...state.posts],
    notifications: [...notifications, ...state.notifications],
  };
}

export function toggleLike(state: Persisted, postId: string): Persisted {
  if (!state.currentUserId) return state;
  const mine = new Set(state.likes[state.currentUserId] ?? []);
  if (mine.has(postId)) mine.delete(postId);
  else mine.add(postId);
  return { ...state, likes: { ...state.likes, [state.currentUserId]: [...mine] } };
}

export function addComment(
  state: Persisted,
  matchId: string,
  text: string,
  parentId?: string,
  now = Date.now(),
  relatedMatchIds: string[] = [matchId],
): Persisted {
  if (!state.currentUserId) return state;
  const slow = matchChatSlowMode(
    state.comments,
    state.currentUserId,
    now,
    relatedMatchIds.length ? relatedMatchIds : [matchId],
  );
  if (!slow.ok) return state;
  const authorId = state.currentUserId;
  const authorName =
    state.profiles[authorId]?.name ?? demoUsers.find((u) => u.id === authorId)?.name ?? 'A fan';
  const comment: Comment = {
    id: `c-${now}`,
    matchId,
    authorId,
    text: text.trim(),
    createdAt: new Date(now).toISOString(),
    parentId,
  };
  const matchSet = new Set(relatedMatchIds.length ? relatedMatchIds : [matchId]);
  matchSet.add(matchId);
  const notifications: AppNotification[] = [];
  const parent = parentId ? state.comments.find((c) => c.id === parentId) : undefined;
  if (parent && parent.authorId !== authorId) {
    notifications.push({
      id: `n-reply-${now}-${parent.authorId}`,
      type: 'comment',
      title: 'Reply in match chat',
      body: `${authorName}: ${text.trim().slice(0, 80)}`,
      createdAt: new Date(now).toISOString(),
      read: false,
      recipientId: parent.authorId,
      matchId,
      userId: authorId,
    });
  } else if (!parent) {
    const participants = new Set<string>();
    for (const c of state.comments) {
      if (matchSet.has(c.matchId)) participants.add(c.authorId);
    }
    for (const p of state.posts) {
      if (p.matchId && matchSet.has(p.matchId)) participants.add(p.authorId);
    }
    participants.delete(authorId);
    for (const recipientId of participants) {
      notifications.push({
        id: `n-chat-${now}-${recipientId}`,
        type: 'comment',
        title: 'New match discussion',
        body: `${authorName}: ${text.trim().slice(0, 80)}`,
        createdAt: new Date(now).toISOString(),
        read: false,
        recipientId,
        matchId,
        userId: authorId,
      });
    }
  }
  return {
    ...state,
    comments: [...state.comments, comment],
    notifications: [...notifications, ...state.notifications],
  };
}

export function mergeMatchAlerts(state: Persisted, drafts: MatchAlertDraft[], now = Date.now()): Persisted {
  if (!drafts.length) return state;
  const extra: AppNotification[] = [];
  for (const draft of drafts) {
    const related = new Set(draft.relatedMatchIds ?? [draft.matchId]);
    related.add(draft.matchId);
    const exists =
      state.notifications.some(
        (n) => n.type === draft.type && n.recipientId === draft.recipientId && n.matchId && related.has(n.matchId),
      ) || extra.some((n) => n.type === draft.type && n.recipientId === draft.recipientId && n.matchId === draft.matchId);
    if (exists) continue;
    extra.push({
      id: `n-demo-${draft.type}-${draft.matchId}-${draft.recipientId}`,
      type: draft.type,
      title: draft.title,
      body: draft.body,
      createdAt: new Date(now).toISOString(),
      read: false,
      recipientId: draft.recipientId,
      matchId: draft.matchId,
    });
  }
  if (!extra.length) return state;
  return { ...state, notifications: [...extra, ...state.notifications] };
}

export function markNotificationsRead(state: Persisted): Persisted {
  if (!state.currentUserId) return state;
  return {
    ...state,
    notifications: state.notifications.map((n) =>
      n.recipientId === state.currentUserId ? { ...n, read: true } : n,
    ),
  };
}

export interface MotmVoteInput {
  playerKey: string;
  playerId?: string;
  playerName: string;
  teamId: string;
}

function relatedSet(matchId: string, relatedMatchIds: string[]): Set<string> {
  const ids = new Set(relatedMatchIds.length ? relatedMatchIds : [matchId]);
  ids.add(matchId);
  return ids;
}

function hasEngagementNote(
  state: Persisted,
  type: 'prediction' | 'motm',
  recipientId: string,
  related: Set<string>,
): boolean {
  return state.notifications.some((n) => n.type === type && n.recipientId === recipientId && n.matchId && related.has(n.matchId));
}

/**
 * Upsert the current user's score pick while the fixture is still pre-kickoff.
 * After lock (live / HT / FT, or kickoff time reached) the existing row is left unchanged.
 */
export function setPrediction(
  state: Persisted,
  matchId: string,
  homeScore: number,
  awayScore: number,
  now = Date.now(),
  fixture?: Pick<Fixture, 'status' | 'kickoff'>,
  relatedMatchIds: string[] = [matchId],
): Persisted {
  if (!state.currentUserId) return state;
  if (!isPredictionOpen(fixture, now)) return state;
  const userId = state.currentUserId;
  const related = relatedSet(matchId, relatedMatchIds);
  const stamp = new Date(now).toISOString();
  const next: ScorePrediction = {
    matchId,
    userId,
    homeScore: clampScore(homeScore),
    awayScore: clampScore(awayScore),
    createdAt: stamp,
    updatedAt: stamp,
  };
  const existing = predictionForUser(state.predictions, userId, [...related]);
  const predictions = existing
    ? state.predictions.map((row) =>
        row.userId === userId && related.has(row.matchId)
          ? { ...row, matchId, homeScore: next.homeScore, awayScore: next.awayScore, updatedAt: stamp }
          : row,
      )
    : [...state.predictions, next];
  if (existing) return { ...state, predictions };
  const notification: AppNotification = {
    id: `n-pred-${now}-${userId}`,
    type: 'prediction',
    title: 'Score prediction saved',
    body: `You predicted ${next.homeScore}–${next.awayScore}.`,
    createdAt: stamp,
    read: false,
    recipientId: userId,
    matchId,
  };
  if (hasEngagementNote(state, 'prediction', userId, related)) {
    return { ...state, predictions };
  }
  return { ...state, predictions, notifications: [notification, ...state.notifications] };
}

/**
 * Cast a single MOTM vote for the current user. Live / HT / FT only; a second vote is ignored.
 */
export function setMotmVote(
  state: Persisted,
  matchId: string,
  input: MotmVoteInput,
  now = Date.now(),
  status?: MatchStatus,
  relatedMatchIds: string[] = [matchId],
): Persisted {
  if (!state.currentUserId) return state;
  if (!isMotmOpen(status)) return state;
  if (!input.playerKey.trim() || !input.playerName.trim() || !input.teamId.trim()) return state;
  const userId = state.currentUserId;
  const related = relatedSet(matchId, relatedMatchIds);
  if (motmVoteForUser(state.motmVotes, userId, [...related])) return state;
  const stamp = new Date(now).toISOString();
  const vote: MotmVote = {
    matchId,
    userId,
    playerKey: input.playerKey,
    playerId: input.playerId,
    playerName: input.playerName.trim(),
    teamId: input.teamId,
    createdAt: stamp,
  };
  const notification: AppNotification = {
    id: `n-motm-${now}-${userId}`,
    type: 'motm',
    title: 'Man of the Match vote',
    body: `You voted for ${vote.playerName}.`,
    createdAt: stamp,
    read: false,
    recipientId: userId,
    matchId,
  };
  const notifications = hasEngagementNote(state, 'motm', userId, related)
    ? state.notifications
    : [notification, ...state.notifications];
  return { ...state, motmVotes: [...state.motmVotes, vote], notifications };
}

export function blockUser(state: Persisted, targetUserId: string): Persisted {
  if (!state.currentUserId || !isPersistedUserId(targetUserId) || targetUserId === state.currentUserId) {
    return state;
  }
  const actor = state.currentUserId;
  const mine = uniqueBlockedIds([...(state.blocks[actor] ?? []), targetUserId], actor);
  return unfollow(
    {
      ...state,
      blocks: { ...state.blocks, [actor]: mine },
    },
    targetUserId,
  );
}

export function unblockUser(state: Persisted, targetUserId: string): Persisted {
  if (!state.currentUserId) return state;
  const actor = state.currentUserId;
  const next = (state.blocks[actor] ?? []).filter((id) => id !== targetUserId);
  if (next.length === (state.blocks[actor] ?? []).length) return state;
  return { ...state, blocks: { ...state.blocks, [actor]: next } };
}

export function hasReport(
  state: Persisted,
  reporterId: string,
  targetType: UserReport['targetType'],
  targetId: string,
): boolean {
  const key = reportKey({ reporterId, targetType, targetId });
  return state.reports.some((row) => reportKey(row) === key);
}

export function addReport(
  state: Persisted,
  input: Omit<ReportInput, 'reporterId'> & { reporterId?: string },
  now = Date.now(),
): { state: Persisted; result: ReportResult } {
  const reporterId = input.reporterId ?? state.currentUserId;
  if (!reporterId) return { state, result: { ok: false, error: 'Sign in to report.' } };
  const report = buildUserReport(
    {
      reporterId,
      targetType: input.targetType,
      targetId: input.targetId,
      targetUserId: input.targetUserId,
      reason: input.reason,
    },
    now,
  );
  if (!report) return { state, result: { ok: false, error: 'Add a short reason (3–280 characters).' } };
  if (hasReport(state, report.reporterId, report.targetType, report.targetId)) {
    return { state, result: { ok: true, duplicate: true } };
  }
  return { state: { ...state, reports: [report, ...state.reports] }, result: { ok: true } };
}

/**
 * Union remote blocks/reports for this identity onto the local blob.
 * Local rows win on duplicate report keys. Other users’ demo slices stay put.
 */
export function mergeRemoteModeration(
  state: Persisted,
  userId: string,
  remoteBlockedIds: string[],
  remoteReports: UserReport[],
  remoteBlockedByIds: string[] = [],
): Persisted {
  if (!isPersistedUserId(userId)) return state;
  const blocks = uniqueBlockedIds([...(state.blocks[userId] ?? []), ...remoteBlockedIds], userId);
  const blockedBy = uniqueBlockedIds([...(state.blockedBy[userId] ?? []), ...remoteBlockedByIds], userId);
  const byKey = new Map<string, UserReport>();
  for (const row of remoteReports) {
    if (row.reporterId !== userId) continue;
    byKey.set(reportKey(row), row);
  }
  for (const row of state.reports) {
    byKey.set(reportKey(row), row);
  }
  const sameBlocks =
    blocks.length === (state.blocks[userId] ?? []).length &&
    blocks.every((id) => (state.blocks[userId] ?? []).includes(id));
  const sameBlockedBy =
    blockedBy.length === (state.blockedBy[userId] ?? []).length &&
    blockedBy.every((id) => (state.blockedBy[userId] ?? []).includes(id));
  const nextReports = [...byKey.values()];
  const sameReports =
    nextReports.length === state.reports.length &&
    nextReports.every((row) => state.reports.some((local) => local.id === row.id));
  if (sameBlocks && sameBlockedBy && sameReports) return state;
  return {
    ...state,
    blocks: { ...state.blocks, [userId]: blocks },
    blockedBy: { ...state.blockedBy, [userId]: blockedBy },
    reports: nextReports,
  };
}

export function sendDirectMessage(
  state: Persisted,
  recipientId: string,
  text: string,
  now = Date.now(),
  share?: SharedPostPayload,
  tape?: MatchTapeAnchor | null,
): { state: Persisted; result: SendDmResult } {
  const senderId = state.currentUserId;
  if (!senderId) return { state, result: { ok: false, error: 'Sign in to send a message.' } };
  if (!canMessagePeer(state, recipientId)) {
    return { state, result: { ok: false, error: 'You can’t message this fan.' } };
  }
  const parsedShare = share ? (parseSharedPost(share) ?? undefined) : undefined;
  if (share && !parsedShare) return { state, result: { ok: false, error: 'Couldn’t share that post.' } };
  const gate = gateTapeMessage(state.matchTapes, dmTapeThreadKey(senderId, recipientId), text, tape);
  if (!gate.ok) return { state, result: { ok: false, error: gate.error } };
  const otherSends = state.groupMessages.filter((row) => row.senderId === senderId);
  const slow = dmSlowMode(state.directMessages, senderId, recipientId, now, otherSends);
  if (!slow.ok) {
    return { state, result: { ok: false, error: 'Slow mode — wait before sending.', slow } };
  }
  const message = buildDirectMessage({ senderId, recipientId, text, share: parsedShare, tape: gate.value }, now);
  if (!message || (tape && !message.tape)) {
    return { state, result: { ok: false, error: 'Write a short message (1–1000 characters).' } };
  }
  const senderName = fanName(state, senderId);
  const notification = dmNotification(message, { name: senderName }, now);
  return {
    state: {
      ...state,
      directMessages: [...state.directMessages, message],
      notifications: [notification, ...state.notifications],
    },
    result: { ok: true, message },
  };
}

export function createDmGroup(
  state: Persisted,
  pickedIds: readonly string[],
  title: string | null | undefined,
  now = Date.now(),
): { state: Persisted; result: { ok: true; group: DmGroup } | { ok: false; error: string } } {
  const creatorId = state.currentUserId;
  if (!creatorId) return { state, result: { ok: false, error: 'Sign in to start a group.' } };
  const plan = planDmGroup({
    creatorId,
    pickedIds,
    mutualFriendIds: mutualFriendIds(state, creatorId),
    hiddenIds: cannotDmPeerIds(state, creatorId),
    blocks: state.blocks,
    title,
  });
  if (!plan.ok) return { state, result: plan };
  const group = buildDmGroup(creatorId, plan.memberIds, plan.title, now);
  if (!group) return { state, result: { ok: false, error: 'Couldn’t create that group.' } };
  return {
    state: { ...state, dmGroups: [group, ...state.dmGroups] },
    result: { ok: true, group },
  };
}

function tapeViewerCanUse(state: Persisted, attachment: MatchTapeAttachment, userId: string): boolean {
  if (attachment.kind === 'group') {
    const group = state.dmGroups.find((row) => row.id === attachment.threadKey);
    if (!group || !isGroupMember(group, userId)) return false;
    return !groupSendBlockReason(group, userId, cannotDmPeerIds(state, userId));
  }
  const parts = attachment.threadKey.split('::');
  const peer = parts.find((id) => id !== userId);
  return !!peer && dmTapeThreadKey(userId, peer) === attachment.threadKey && canMessagePeer(state, peer);
}

export function attachMatchTape(
  state: Persisted,
  input: {
    kind: 'dm' | 'group';
    threadKey: string;
    matchId: string;
    teams: TapeTeams;
    kickoff?: string;
  },
  now = Date.now(),
): { state: Persisted; result: { ok: true; attachment: MatchTapeAttachment } | { ok: false; error: string } } {
  const userId = state.currentUserId;
  if (!userId) return { state, result: { ok: false, error: 'Sign in to attach a match.' } };
  if (input.kind === 'dm') {
    const peer = input.threadKey.split('::').find((id) => id !== userId);
    if (!peer || dmTapeThreadKey(userId, peer) !== input.threadKey || !canMessagePeer(state, peer)) {
      return { state, result: { ok: false, error: 'Only people in this chat can attach a match.' } };
    }
  } else {
    const group = state.dmGroups.find((row) => row.id === input.threadKey);
    if (!group || !isGroupMember(group, userId)) {
      return { state, result: { ok: false, error: 'Only people in this chat can attach a match.' } };
    }
    const blocked = groupSendBlockReason(group, userId, cannotDmPeerIds(state, userId));
    if (blocked) return { state, result: { ok: false, error: blocked } };
  }
  const plan = planMatchTapeAttach({
    rows: state.matchTapes,
    id: createTapeId(now, userId),
    kind: input.kind,
    threadKey: input.threadKey,
    matchId: input.matchId,
    attachedBy: userId,
    teams: input.teams,
    kickoff: input.kickoff,
    now,
  });
  if (!plan.ok) return { state, result: plan };
  return {
    state: { ...state, matchTapes: [...state.matchTapes, plan.value] },
    result: { ok: true, attachment: plan.value },
  };
}

export function archiveMatchTape(
  state: Persisted,
  id: string,
  now = Date.now(),
  snapshot?: TapeScoreSnapshot,
): { state: Persisted; result: { ok: true; attachment: MatchTapeAttachment } | { ok: false; error: string } } {
  const userId = state.currentUserId;
  if (!userId) return { state, result: { ok: false, error: 'Sign in to archive a Match Tape.' } };
  const existing = state.matchTapes.find((row) => row.id === id);
  if (!existing || !tapeViewerCanUse(state, existing, userId)) {
    return { state, result: { ok: false, error: 'Only people in this chat can archive a Match Tape.' } };
  }
  const plan = planMatchTapeArchive(state.matchTapes, id, now, snapshot);
  if (!plan.ok) return { state, result: plan };
  if (plan.value.status === existing.status && existing.status === 'archived') {
    return { state, result: { ok: true, attachment: existing } };
  }
  return {
    state: { ...state, matchTapes: state.matchTapes.map((row) => (row.id === id ? plan.value : row)) },
    result: { ok: true, attachment: plan.value },
  };
}

export function dropMatchTape(state: Persisted, id: string): Persisted {
  if (!state.matchTapes.some((row) => row.id === id)) return state;
  return { ...state, matchTapes: state.matchTapes.filter((row) => row.id !== id) };
}

export function mergeRemoteMatchTapes(state: Persisted, remote: readonly MatchTapeAttachment[]): Persisted {
  const next = mergeMatchTapes(state.matchTapes, remote);
  const same =
    next.length === state.matchTapes.length &&
    next.every((row) => {
      const local = state.matchTapes.find((item) => item.id === row.id);
      return !!local && local.status === row.status && local.archivedAt === row.archivedAt && local.homeScore === row.homeScore;
    });
  if (same) return state;
  return { ...state, matchTapes: next };
}

export function leaveDmGroup(state: Persisted, groupId: string): Persisted {
  const userId = state.currentUserId;
  if (!userId) return state;
  const group = state.dmGroups.find((row) => row.id === groupId);
  if (!group || !isGroupMember(group, userId)) return state;
  return {
    ...state,
    dmGroups: state.dmGroups.map((row) =>
      row.id === groupId ? { ...row, memberIds: row.memberIds.filter((id) => id !== userId) } : row,
    ),
  };
}

export function sendGroupMessage(
  state: Persisted,
  groupId: string,
  text: string,
  now = Date.now(),
  share?: SharedPostPayload,
  tape?: MatchTapeAnchor | null,
): { state: Persisted; result: SendGroupResult } {
  const senderId = state.currentUserId;
  if (!senderId) return { state, result: { ok: false, error: 'Sign in to send a message.' } };
  const group = state.dmGroups.find((row) => row.id === groupId);
  if (!group) return { state, result: { ok: false, error: 'This group isn’t on KickFeed.' } };
  const blocked = groupSendBlockReason(group, senderId, cannotDmPeerIds(state, senderId));
  if (blocked) return { state, result: { ok: false, error: blocked } };
  const parsedShare = share ? (parseSharedPost(share) ?? undefined) : undefined;
  if (share && !parsedShare) return { state, result: { ok: false, error: 'Couldn’t share that post.' } };
  const gate = gateTapeMessage(state.matchTapes, groupId, text, tape);
  if (!gate.ok) return { state, result: { ok: false, error: gate.error } };
  const slow = groupSlowMode(state.groupMessages, state.directMessages, senderId, groupId, now);
  if (!slow.ok) {
    return { state, result: { ok: false, error: 'Slow mode — wait before sending.', slow } };
  }
  const message = buildGroupMessage({
    groupId,
    senderId,
    text,
    share: parsedShare,
    tape: gate.value,
    now,
  });
  if (!message || (tape && !message.tape)) {
    return { state, result: { ok: false, error: 'Write a short message (1–1000 characters).' } };
  }
  const senderName = fanName(state, senderId);
  const notifications: AppNotification[] = group.memberIds
    .filter((id) => id !== senderId)
    .map((recipientId) => ({
      id: `n-gm-${message.id}-${recipientId}`,
      type: 'dm',
      title: `${senderName} in ${displayGroupTitle(group, recipientId, (id) => fanName(state, id))}`,
      body: chatPreview(message.text, message.share).slice(0, 80),
      createdAt: new Date(now).toISOString(),
      read: false,
      recipientId,
      userId: senderId,
      groupId: group.id,
    }));
  return {
    state: {
      ...state,
      groupMessages: [...state.groupMessages, message],
      notifications: [...notifications, ...state.notifications],
    },
    result: { ok: true, message },
  };
}

export function markGroupRead(state: Persisted, groupId: string, now = Date.now()): Persisted {
  const userId = state.currentUserId;
  if (!userId || !isGroupId(groupId)) return state;
  const group = state.dmGroups.find((row) => row.id === groupId);
  if (!group || !isGroupMember(group, userId)) return state;
  const latestIncoming = state.groupMessages.reduce((max, row) => {
    if (row.groupId !== groupId || row.senderId === userId) return max;
    const stamp = Date.parse(row.createdAt);
    return Number.isFinite(stamp) && stamp > max ? stamp : max;
  }, 0);
  const mine = state.groupReads[userId] ?? {};
  const already = Date.parse(mine[groupId] ?? '');
  const targetMs = latestIncoming > 0 ? latestIncoming : Number.isFinite(already) ? already : now;
  if (Number.isFinite(already) && already >= targetMs) return state;
  const stamp = new Date(targetMs).toISOString();
  return {
    ...state,
    groupReads: {
      ...state.groupReads,
      [userId]: { ...mine, [groupId]: stamp },
    },
    notifications: state.notifications.map((note) =>
      note.type === 'dm' && note.recipientId === userId && note.groupId === groupId ? { ...note, read: true } : note,
    ),
  };
}

/**
 * Union remote groups and group messages for this identity.
 * Local rows win on duplicate ids. Demo groups for other people stay put.
 */
export function mergeRemoteGroupChats(
  state: Persisted,
  userId: string,
  remoteGroups: DmGroup[],
  remoteMessages: GroupMessage[],
): Persisted {
  if (!isPersistedUserId(userId)) return state;
  const byGroup = new Map(state.dmGroups.map((row) => [row.id, row]));
  for (const group of remoteGroups) {
    if (!group.memberIds.includes(userId)) continue;
    if (!byGroup.has(group.id)) byGroup.set(group.id, group);
  }
  const nextGroups = [...byGroup.values()];
  const memberGroupIds = new Set(nextGroups.filter((group) => group.memberIds.includes(userId)).map((group) => group.id));
  const byMessage = new Map(state.groupMessages.map((row) => [row.id, row]));
  for (const row of remoteMessages) {
    if (!memberGroupIds.has(row.groupId)) continue;
    if (!byMessage.has(row.id)) byMessage.set(row.id, row);
  }
  const nextMessages = [...byMessage.values()];
  const sameGroups =
    nextGroups.length === state.dmGroups.length &&
    nextGroups.every((row) => state.dmGroups.some((local) => local.id === row.id));
  const sameMessages =
    nextMessages.length === state.groupMessages.length &&
    nextMessages.every((row) => state.groupMessages.some((local) => local.id === row.id));
  if (sameGroups && sameMessages) return state;
  return { ...state, dmGroups: nextGroups, groupMessages: nextMessages };
}

export function markDmThreadRead(state: Persisted, peerId: string, now = Date.now()): Persisted {
  if (!state.currentUserId || !isPersistedUserId(peerId) || peerId === state.currentUserId) return state;
  const userId = state.currentUserId;
  const latestIncoming = state.directMessages.reduce((max, row) => {
    if (row.senderId !== peerId || row.recipientId !== userId) return max;
    const stamp = Date.parse(row.createdAt);
    return Number.isFinite(stamp) && stamp > max ? stamp : max;
  }, 0);
  const mine = state.dmReads[userId] ?? {};
  const already = Date.parse(mine[peerId] ?? '');
  const targetMs = latestIncoming > 0 ? latestIncoming : Number.isFinite(already) ? already : now;
  if (Number.isFinite(already) && already >= targetMs) return state;
  const stamp = new Date(targetMs).toISOString();
  return {
    ...state,
    dmReads: {
      ...state.dmReads,
      [userId]: { ...mine, [peerId]: stamp },
    },
    notifications: state.notifications.map((n) =>
      n.type === 'dm' && n.recipientId === userId && n.userId === peerId ? { ...n, read: true } : n,
    ),
  };
}

/**
 * Union remote DMs for this identity onto the local blob.
 * Local rows win on duplicate ids. Other users’ demo threads stay put.
 */
export function mergeRemoteDirectMessages(
  state: Persisted,
  userId: string,
  remote: DirectMessage[],
): Persisted {
  if (!isPersistedUserId(userId)) return state;
  const byId = new Map<string, DirectMessage>();
  for (const row of remote) {
    if (!involvedInMessage(row, userId)) continue;
    byId.set(row.id, row);
  }
  for (const row of state.directMessages) {
    byId.set(row.id, row);
  }
  const next = [...byId.values()];
  const same =
    next.length === state.directMessages.length &&
    next.every((row) => state.directMessages.some((local) => local.id === row.id));
  if (same) return state;
  return { ...state, directMessages: next };
}

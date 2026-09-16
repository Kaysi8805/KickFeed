import type { AppNotification, Comment, Post, User } from '@/data/types';
import { demoUsers, seedComments, seedFollowing, seedNotifications, seedPosts } from '@/data/mocks/social';

export const STATE_SCHEMA_VERSION = 1;

const KNOWN_USER_IDS = new Set(demoUsers.map((u) => u.id));

export interface FavoriteSlice {
  teams: string[];
  leagues: string[];
  players: string[];
}

export interface Persisted {
  schemaVersion: number;
  currentUserId: string | null;
  following: Record<string, string[]>;
  favorites: Record<string, FavoriteSlice>;
  profiles: Record<string, Partial<User>>;
  posts: Post[];
  likes: Record<string, string[]>;
  comments: Comment[];
  notifications: AppNotification[];
}

export function defaults(): Persisted {
  const favorites: Persisted['favorites'] = {};
  for (const u of demoUsers) {
    favorites[u.id] = { teams: [...u.favoriteTeamIds], leagues: [...u.favoriteLeagueIds], players: [] };
  }
  return {
    schemaVersion: STATE_SCHEMA_VERSION,
    currentUserId: null,
    following: { ...seedFollowing },
    favorites,
    profiles: {},
    posts: seedPosts,
    likes: { maya: ['p1', 'p3'], jordan: ['p2'] },
    comments: seedComments,
    notifications: seedNotifications,
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function knownUserId(value: unknown): string | null {
  return typeof value === 'string' && KNOWN_USER_IDS.has(value) ? value : null;
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

/**
 * Parse AsyncStorage JSON.
 * Corrupt JSON → full defaults.
 * Missing/future schemaVersion still keeps valid slices (user, follows, posts, …)
 * and stamps STATE_SCHEMA_VERSION. Unknown currentUserId becomes null.
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

  return {
    schemaVersion: STATE_SCHEMA_VERSION,
    currentUserId: knownUserId(parsed.currentUserId),
    following: pickRecord(parsed.following, base.following),
    favorites: pickFavorites(parsed.favorites, base.favorites),
    profiles: pickRecord(parsed.profiles, base.profiles),
    likes: pickRecord(parsed.likes, base.likes),
    posts: pickArray(parsed.posts, base.posts),
    comments: pickArray(parsed.comments, base.comments),
    notifications: pickArray(parsed.notifications, base.notifications),
  };
}

function isSelfActivity(n: AppNotification, userId: string): boolean {
  return n.userId === userId;
}

export function notificationsFor(state: Persisted, userId: string | null): AppNotification[] {
  if (!userId) return [];
  return state.notifications
    .filter((n) => n.recipientId === userId && !isSelfActivity(n, userId))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export function unreadCountFor(state: Persisted, userId: string | null): number {
  if (!userId) return 0;
  return state.notifications.filter((n) => n.recipientId === userId && !n.read && !isSelfActivity(n, userId)).length;
}

export function signInDemo(state: Persisted, userId: string): Persisted {
  if (!KNOWN_USER_IDS.has(userId)) return { ...state, currentUserId: null };
  return { ...state, currentUserId: userId };
}

export function signOut(state: Persisted): Persisted {
  return { ...state, currentUserId: null };
}

export function follow(state: Persisted, targetUserId: string, actorDisplayName: string, now = Date.now()): Persisted {
  if (!state.currentUserId || targetUserId === state.currentUserId) return state;
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

export function updateProfile(state: Persisted, next: Partial<Pick<User, 'name' | 'bio'>>): Persisted {
  if (!state.currentUserId) return state;
  return {
    ...state,
    profiles: { ...state.profiles, [state.currentUserId]: { ...state.profiles[state.currentUserId], ...next } },
  };
}

export function addPost(state: Persisted, text: string, imageUri?: string, now = Date.now()): Persisted {
  if (!state.currentUserId) return state;
  const authorId = state.currentUserId;
  const authorName =
    state.profiles[authorId]?.name ?? demoUsers.find((u) => u.id === authorId)?.name ?? 'A fan';
  const post: Post = {
    id: `p-${now}`,
    authorId,
    text: text.trim(),
    imageUri,
    createdAt: new Date(now).toISOString(),
  };
  const followerIds = Object.entries(state.following)
    .filter(([id, ids]) => id !== authorId && ids.includes(authorId))
    .map(([id]) => id);
  const notifications: AppNotification[] = followerIds.map((recipientId) => ({
    id: `n-post-${now}-${recipientId}`,
    type: 'friend_post',
    title: `${authorName} posted`,
    body: text.trim().slice(0, 80),
    createdAt: new Date(now).toISOString(),
    read: false,
    recipientId,
    userId: authorId,
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

export function addComment(state: Persisted, matchId: string, text: string, parentId?: string, now = Date.now()): Persisted {
  if (!state.currentUserId) return state;
  const comment: Comment = {
    id: `c-${now}`,
    matchId,
    authorId: state.currentUserId,
    text: text.trim(),
    createdAt: new Date(now).toISOString(),
    parentId,
  };
  return { ...state, comments: [...state.comments, comment] };
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

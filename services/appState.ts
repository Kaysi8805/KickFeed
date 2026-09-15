import type { AppNotification, Comment, Post, User } from '@/data/types';
import { demoUsers, seedComments, seedFollowing, seedNotifications, seedPosts } from '@/data/mocks/social';

export const STATE_SCHEMA_VERSION = 1;

const KNOWN_USER_IDS = new Set(demoUsers.map((u) => u.id));

export interface Persisted {
  schemaVersion: number;
  currentUserId: string | null;
  following: Record<string, string[]>;
  favorites: Record<string, { teams: string[]; leagues: string[] }>;
  profiles: Record<string, Partial<User>>;
  posts: Post[];
  likes: Record<string, string[]>;
  comments: Comment[];
  notifications: AppNotification[];
}

export function defaults(): Persisted {
  const favorites: Persisted['favorites'] = {};
  for (const u of demoUsers) {
    favorites[u.id] = { teams: [...u.favoriteTeamIds], leagues: [...u.favoriteLeagueIds] };
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

function looksLikeState(blob: Record<string, unknown>): boolean {
  return (
    blob.schemaVersion === STATE_SCHEMA_VERSION &&
    (blob.currentUserId === null || typeof blob.currentUserId === 'string') &&
    isPlainObject(blob.following) &&
    isPlainObject(blob.favorites) &&
    isPlainObject(blob.profiles) &&
    isPlainObject(blob.likes) &&
    Array.isArray(blob.posts) &&
    Array.isArray(blob.comments) &&
    Array.isArray(blob.notifications)
  );
}

/** Parse AsyncStorage JSON. Corrupt, unversioned, or invalid user ids fall back to defaults. */
export function hydratePersisted(raw: string | null): Persisted {
  const base = defaults();
  if (!raw) return base;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return base;
  }
  if (!isPlainObject(parsed) || !looksLikeState(parsed)) return base;

  const currentUserId =
    typeof parsed.currentUserId === 'string' && KNOWN_USER_IDS.has(parsed.currentUserId)
      ? parsed.currentUserId
      : null;

  return {
    ...(parsed as unknown as Persisted),
    schemaVersion: STATE_SCHEMA_VERSION,
    currentUserId,
  };
}

export function notificationsFor(state: Persisted, userId: string | null): AppNotification[] {
  if (!userId) return [];
  return state.notifications
    .filter((n) => n.recipientId === userId)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export function unreadCountFor(state: Persisted, userId: string | null): number {
  if (!userId) return 0;
  return state.notifications.filter((n) => n.recipientId === userId && !n.read).length;
}

export function signInDemo(state: Persisted, userId: string): Persisted {
  if (!KNOWN_USER_IDS.has(userId)) return { ...state, currentUserId: null };
  return { ...state, currentUserId: userId };
}

export function signOut(state: Persisted): Persisted {
  return { ...state, currentUserId: null };
}

export function follow(state: Persisted, userId: string, displayName: string, now = Date.now()): Persisted {
  if (!state.currentUserId || userId === state.currentUserId) return state;
  const mine = new Set(state.following[state.currentUserId] ?? []);
  mine.add(userId);
  const notification: AppNotification = {
    id: `n-${now}`,
    type: 'follow',
    title: 'Following',
    body: `You are now following ${displayName}.`,
    createdAt: new Date(now).toISOString(),
    read: false,
    recipientId: state.currentUserId,
    userId,
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

export function toggleFavoriteTeam(state: Persisted, teamId: string): Persisted {
  if (!state.currentUserId) return state;
  const cur = state.favorites[state.currentUserId] ?? { teams: [], leagues: [] };
  const has = cur.teams.includes(teamId);
  return {
    ...state,
    favorites: {
      ...state.favorites,
      [state.currentUserId]: {
        ...cur,
        teams: has ? cur.teams.filter((id) => id !== teamId) : [...cur.teams, teamId],
      },
    },
  };
}

export function toggleFavoriteLeague(state: Persisted, leagueId: string): Persisted {
  if (!state.currentUserId) return state;
  const cur = state.favorites[state.currentUserId] ?? { teams: [], leagues: [] };
  const has = cur.leagues.includes(leagueId);
  return {
    ...state,
    favorites: {
      ...state.favorites,
      [state.currentUserId]: {
        ...cur,
        leagues: has ? cur.leagues.filter((id) => id !== leagueId) : [...cur.leagues, leagueId],
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
  const post: Post = {
    id: `p-${now}`,
    authorId: state.currentUserId,
    text: text.trim(),
    imageUri,
    createdAt: new Date(now).toISOString(),
  };
  const notification: AppNotification = {
    id: `n-post-${now}`,
    type: 'friend_post',
    title: 'Posted to KickFeed',
    body: text.trim().slice(0, 80),
    createdAt: new Date(now).toISOString(),
    read: false,
    recipientId: state.currentUserId,
  };
  return {
    ...state,
    posts: [post, ...state.posts],
    notifications: [notification, ...state.notifications],
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

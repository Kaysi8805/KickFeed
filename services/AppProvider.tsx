import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import type { AppNotification, Comment, Post, User } from '@/data/types';
import { demoUsers, seedComments, seedFollowing, seedNotifications, seedPosts } from '@/data/mocks/social';
import { registerForPushNotifications } from '@/services/notifications';

const STORAGE_KEY = 'kickfeed.v1.state';

interface Persisted {
  currentUserId: string | null;
  following: Record<string, string[]>;
  favorites: Record<string, { teams: string[]; leagues: string[] }>;
  profiles: Record<string, Partial<User>>;
  posts: Post[];
  likes: Record<string, string[]>;
  comments: Comment[];
  notifications: AppNotification[];
}

function defaults(): Persisted {
  const favorites: Persisted['favorites'] = {};
  for (const u of demoUsers) {
    favorites[u.id] = { teams: [...u.favoriteTeamIds], leagues: [...u.favoriteLeagueIds] };
  }
  return {
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

interface AppContextValue {
  ready: boolean;
  currentUser: User | null;
  users: User[];
  followingIds: string[];
  favoriteTeamIds: string[];
  favoriteLeagueIds: string[];
  posts: Post[];
  comments: Comment[];
  notifications: AppNotification[];
  unreadCount: number;
  likedPostIds: string[];
  signInDemo: (userId: string) => void;
  signOut: () => void;
  follow: (userId: string) => void;
  unfollow: (userId: string) => void;
  toggleFavoriteTeam: (teamId: string) => void;
  toggleFavoriteLeague: (leagueId: string) => void;
  updateProfile: (patch: Partial<Pick<User, 'name' | 'bio'>>) => void;
  addPost: (text: string, imageUri?: string) => void;
  toggleLike: (postId: string) => void;
  addComment: (matchId: string, text: string, parentId?: string) => void;
  markNotificationsRead: () => void;
  followerCount: (userId: string) => number;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<Persisted>(defaults);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw && !cancelled) {
          const parsed = JSON.parse(raw) as Partial<Persisted>;
          setState((prev) => ({ ...prev, ...parsed }));
        }
      } catch {
        // first launch
      } finally {
        if (!cancelled) setReady(true);
      }
      registerForPushNotifications().catch(() => undefined);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => undefined);
  }, [state, ready]);

  const users = useMemo(
    () =>
      demoUsers.map((u) => ({
        ...u,
        ...state.profiles[u.id],
        favoriteTeamIds: state.favorites[u.id]?.teams ?? u.favoriteTeamIds,
        favoriteLeagueIds: state.favorites[u.id]?.leagues ?? u.favoriteLeagueIds,
      })),
    [state.favorites, state.profiles],
  );

  const currentUser = users.find((u) => u.id === state.currentUserId) ?? null;
  const followingIds = currentUser ? (state.following[currentUser.id] ?? []) : [];
  const favoriteTeamIds = currentUser?.favoriteTeamIds ?? [];
  const favoriteLeagueIds = currentUser?.favoriteLeagueIds ?? [];
  const likedPostIds = currentUser ? (state.likes[currentUser.id] ?? []) : [];
  const unreadCount = state.notifications.filter((n) => !n.read).length;

  const patch = useCallback((fn: (prev: Persisted) => Persisted) => {
    setState((prev) => fn(prev));
  }, []);

  const value = useMemo<AppContextValue>(
    () => ({
      ready,
      currentUser,
      users,
      followingIds,
      favoriteTeamIds,
      favoriteLeagueIds,
      posts: [...state.posts].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
      comments: state.comments,
      notifications: [...state.notifications].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
      unreadCount,
      likedPostIds,
      signInDemo: (userId) => patch((p) => ({ ...p, currentUserId: userId })),
      signOut: () => patch((p) => ({ ...p, currentUserId: null })),
      follow: (userId) =>
        patch((p) => {
          if (!p.currentUserId || userId === p.currentUserId) return p;
          const mine = new Set(p.following[p.currentUserId] ?? []);
          mine.add(userId);
          return {
            ...p,
            following: { ...p.following, [p.currentUserId]: [...mine] },
            notifications: [
              {
                id: `n-${Date.now()}`,
                type: 'follow',
                title: 'Following',
                body: `You are now following ${users.find((u) => u.id === userId)?.name ?? 'a fan'}.`,
                createdAt: new Date().toISOString(),
                read: false,
                userId,
              },
              ...p.notifications,
            ],
          };
        }),
      unfollow: (userId) =>
        patch((p) => {
          if (!p.currentUserId) return p;
          return {
            ...p,
            following: {
              ...p.following,
              [p.currentUserId]: (p.following[p.currentUserId] ?? []).filter((id) => id !== userId),
            },
          };
        }),
      toggleFavoriteTeam: (teamId) =>
        patch((p) => {
          if (!p.currentUserId) return p;
          const cur = p.favorites[p.currentUserId] ?? { teams: [], leagues: [] };
          const has = cur.teams.includes(teamId);
          return {
            ...p,
            favorites: {
              ...p.favorites,
              [p.currentUserId]: {
                ...cur,
                teams: has ? cur.teams.filter((id) => id !== teamId) : [...cur.teams, teamId],
              },
            },
          };
        }),
      toggleFavoriteLeague: (leagueId) =>
        patch((p) => {
          if (!p.currentUserId) return p;
          const cur = p.favorites[p.currentUserId] ?? { teams: [], leagues: [] };
          const has = cur.leagues.includes(leagueId);
          return {
            ...p,
            favorites: {
              ...p.favorites,
              [p.currentUserId]: {
                ...cur,
                leagues: has ? cur.leagues.filter((id) => id !== leagueId) : [...cur.leagues, leagueId],
              },
            },
          };
        }),
      updateProfile: (next) =>
        patch((p) => {
          if (!p.currentUserId) return p;
          return {
            ...p,
            profiles: { ...p.profiles, [p.currentUserId]: { ...p.profiles[p.currentUserId], ...next } },
          };
        }),
      addPost: (text, imageUri) =>
        patch((p) => {
          if (!p.currentUserId) return p;
          const post: Post = {
            id: `p-${Date.now()}`,
            authorId: p.currentUserId,
            text: text.trim(),
            imageUri,
            createdAt: new Date().toISOString(),
          };
          return {
            ...p,
            posts: [post, ...p.posts],
            notifications: [
              {
                id: `n-post-${Date.now()}`,
                type: 'friend_post',
                title: 'Posted to KickFeed',
                body: text.trim().slice(0, 80),
                createdAt: new Date().toISOString(),
                read: false,
              },
              ...p.notifications,
            ],
          };
        }),
      toggleLike: (postId) =>
        patch((p) => {
          if (!p.currentUserId) return p;
          const mine = new Set(p.likes[p.currentUserId] ?? []);
          if (mine.has(postId)) mine.delete(postId);
          else mine.add(postId);
          return { ...p, likes: { ...p.likes, [p.currentUserId]: [...mine] } };
        }),
      addComment: (matchId, text, parentId) =>
        patch((p) => {
          if (!p.currentUserId) return p;
          const comment: Comment = {
            id: `c-${Date.now()}`,
            matchId,
            authorId: p.currentUserId,
            text: text.trim(),
            createdAt: new Date().toISOString(),
            parentId,
          };
          return { ...p, comments: [...p.comments, comment] };
        }),
      markNotificationsRead: () =>
        patch((p) => ({ ...p, notifications: p.notifications.map((n) => ({ ...n, read: true })) })),
      followerCount: (userId) => Object.values(state.following).filter((ids) => ids.includes(userId)).length,
    }),
    [currentUser, favoriteLeagueIds, favoriteTeamIds, followingIds, likedPostIds, patch, ready, state, unreadCount, users],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}

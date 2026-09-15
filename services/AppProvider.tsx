import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import type { AppNotification, Comment, Post, User } from '@/data/types';
import { demoUsers } from '@/data/mocks/social';
import {
  addComment as addCommentState,
  addPost as addPostState,
  defaults,
  follow as followState,
  hydratePersisted,
  markNotificationsRead as markNotificationsReadState,
  notificationsFor,
  Persisted,
  signInDemo as signInDemoState,
  signOut as signOutState,
  toggleFavoriteLeague as toggleFavoriteLeagueState,
  toggleFavoriteTeam as toggleFavoriteTeamState,
  toggleLike as toggleLikeState,
  unfollow as unfollowState,
  unreadCountFor,
  updateProfile as updateProfileState,
} from '@/services/appState';

const STORAGE_KEY = 'kickfeed.v1.state';

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
        if (!cancelled) setState(hydratePersisted(raw));
      } catch {
        if (!cancelled) setState(defaults());
      } finally {
        if (!cancelled) setReady(true);
      }
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
  const notifications = notificationsFor(state, currentUser?.id ?? null);
  const unreadCount = unreadCountFor(state, currentUser?.id ?? null);

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
      notifications,
      unreadCount,
      likedPostIds,
      signInDemo: (userId) => patch((p) => signInDemoState(p, userId)),
      signOut: () => patch(signOutState),
      follow: (userId) =>
        patch((p) => followState(p, userId, currentUser?.name ?? 'A fan')),
      unfollow: (userId) => patch((p) => unfollowState(p, userId)),
      toggleFavoriteTeam: (teamId) => patch((p) => toggleFavoriteTeamState(p, teamId)),
      toggleFavoriteLeague: (leagueId) => patch((p) => toggleFavoriteLeagueState(p, leagueId)),
      updateProfile: (next) => patch((p) => updateProfileState(p, next)),
      addPost: (text, imageUri) => patch((p) => addPostState(p, text, imageUri)),
      toggleLike: (postId) => patch((p) => toggleLikeState(p, postId)),
      addComment: (matchId, text, parentId) => patch((p) => addCommentState(p, matchId, text, parentId)),
      markNotificationsRead: () => patch(markNotificationsReadState),
      followerCount: (userId) => Object.values(state.following).filter((ids) => ids.includes(userId)).length,
    }),
    [currentUser, favoriteLeagueIds, favoriteTeamIds, followingIds, likedPostIds, notifications, patch, ready, state, unreadCount, users],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}

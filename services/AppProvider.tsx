import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import type { AppNotification, Comment, Fixture, MotmVote, Post, ScorePrediction, User } from '@/data/types';
import { demoUsers } from '@/data/mocks/social';
import type { MotmCandidate } from '@/lib/engagement';
import { attachMatchId, favoriteMatchAlertDrafts, relatedFixtureIds } from '@/lib/matchSocial';
import {
  addComment as addCommentState,
  addPost as addPostState,
  defaults,
  follow as followState,
  hydratePersisted,
  markNotificationsRead as markNotificationsReadState,
  mergeMatchAlerts,
  notificationsFor,
  Persisted,
  setMotmVote as setMotmVoteState,
  setPrediction as setPredictionState,
  signInDemo as signInDemoState,
  signOut as signOutState,
  toggleFavoriteLeague as toggleFavoriteLeagueState,
  toggleFavoritePlayer as toggleFavoritePlayerState,
  toggleFavoriteTeam as toggleFavoriteTeamState,
  toggleLike as toggleLikeState,
  unfollow as unfollowState,
  unreadCountFor,
  updateProfile as updateProfileState,
} from '@/services/appState';
import { football } from '@/services/football';

const STORAGE_KEY = 'kickfeed.v1.state';

interface AppContextValue {
  ready: boolean;
  currentUser: User | null;
  users: User[];
  followingIds: string[];
  favoriteTeamIds: string[];
  favoriteLeagueIds: string[];
  favoritePlayerIds: string[];
  posts: Post[];
  comments: Comment[];
  notifications: AppNotification[];
  unreadCount: number;
  likedPostIds: string[];
  predictions: ScorePrediction[];
  motmVotes: MotmVote[];
  signInDemo: (userId: string) => void;
  signOut: () => void;
  follow: (userId: string) => void;
  unfollow: (userId: string) => void;
  toggleFavoriteTeam: (teamId: string) => void;
  toggleFavoriteLeague: (leagueId: string) => void;
  toggleFavoritePlayer: (playerId: string) => void;
  updateProfile: (patch: Partial<Pick<User, 'name' | 'bio' | 'tvCountryId'>>) => void;
  addPost: (text: string, imageUri?: string, matchId?: string) => void;
  toggleLike: (postId: string) => void;
  addComment: (matchId: string, text: string, parentId?: string) => void;
  setPrediction: (fixture: Fixture, homeScore: number, awayScore: number) => void;
  setMotmVote: (fixture: Fixture, candidate: MotmCandidate) => void;
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
    void football.hydrate();
  }, []);

  useEffect(() => {
    if (!ready) return;
    const syncAlerts = () => {
      setState((prev) => mergeMatchAlerts(prev, favoriteMatchAlertDrafts(prev.favorites, football)));
    };
    syncAlerts();
    return football.subscribe(syncAlerts);
  }, [ready]);

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
  const favoritePlayerIds = currentUser ? (state.favorites[currentUser.id]?.players ?? []) : [];
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
      favoritePlayerIds,
      posts: [...state.posts].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
      comments: state.comments,
      notifications,
      unreadCount,
      likedPostIds,
      predictions: state.predictions,
      motmVotes: state.motmVotes,
      signInDemo: (userId) => patch((p) => signInDemoState(p, userId)),
      signOut: () => patch(signOutState),
      follow: (userId) =>
        patch((p) => followState(p, userId, currentUser?.name ?? 'A fan')),
      unfollow: (userId) => patch((p) => unfollowState(p, userId)),
      toggleFavoriteTeam: (teamId) =>
        patch((p) => toggleFavoriteTeamState(p, teamId, football.relatedIds('team', teamId))),
      toggleFavoriteLeague: (leagueId) =>
        patch((p) => toggleFavoriteLeagueState(p, leagueId, football.relatedIds('league', leagueId))),
      toggleFavoritePlayer: (playerId) =>
        patch((p) => toggleFavoritePlayerState(p, playerId, football.relatedIds('player', playerId))),
      updateProfile: (next) => patch((p) => updateProfileState(p, next)),
      addPost: (text, imageUri, matchId) =>
        patch((p) =>
          addPostState(p, text, imageUri, Date.now(), matchId ? attachMatchId(football, matchId) : undefined),
        ),
      toggleLike: (postId) => patch((p) => toggleLikeState(p, postId)),
      addComment: (matchId, text, parentId) =>
        patch((p) =>
          addCommentState(
            p,
            attachMatchId(football, matchId),
            text,
            parentId,
            Date.now(),
            relatedFixtureIds(football, matchId),
          ),
        ),
      setPrediction: (fixture, homeScore, awayScore) =>
        patch((p) =>
          setPredictionState(
            p,
            attachMatchId(football, fixture.id),
            homeScore,
            awayScore,
            Date.now(),
            { status: fixture.status, kickoff: fixture.kickoff },
            relatedFixtureIds(football, fixture.id),
          ),
        ),
      setMotmVote: (fixture, candidate) =>
        patch((p) =>
          setMotmVoteState(
            p,
            attachMatchId(football, fixture.id),
            {
              playerKey: candidate.key,
              playerId: candidate.playerId,
              playerName: candidate.name,
              teamId: candidate.teamId,
            },
            Date.now(),
            fixture.status,
            relatedFixtureIds(football, fixture.id),
          ),
        ),
      markNotificationsRead: () => patch(markNotificationsReadState),
      followerCount: (userId) => Object.values(state.following).filter((ids) => ids.includes(userId)).length,
    }),
    [currentUser, favoriteLeagueIds, favoritePlayerIds, favoriteTeamIds, followingIds, likedPostIds, notifications, patch, ready, state, unreadCount, users],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}

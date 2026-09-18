import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import type { AppNotification, Comment, Fixture, MotmVote, Post, ReportTargetType, ScorePrediction, User } from '@/data/types';
import { motmVoteForUser, predictionForUser, type MotmCandidate } from '@/lib/engagement';
import { shouldPersistLeaderboard } from '@/lib/leaderboard';
import { defaultPushPrefs, emptyPushSnapshot, planFavoriteDeviceAlerts, type PushPrefs, type PushSnapshot } from '@/lib/favoritePush';
import { attachMatchId, favoriteMatchAlertDrafts, relatedFixtureIds } from '@/lib/matchSocial';
import {
  isBlockedUser,
  shouldPersistModeration,
  visibleByAuthor,
  type ReportResult,
} from '@/lib/moderation';
import {
  applyDeviceAlerts,
  cancelAllDeviceAlerts,
  loadPushStore,
  peekEasProjectId,
  persistPushState,
  registerForPushNotifications,
  type PushRegisterResult,
} from '@/services/notifications';
import { isSupabaseConfigured, getSupabaseClient } from '@/services/supabase';
import {
  addComment as addCommentState,
  addPost as addPostState,
  addReport as addReportState,
  applyAuthStateChange,
  applyRestoredSession,
  blockUser as blockUserState,
  blockedIdsFor,
  defaults,
  follow as followState,
  hydratePersisted,
  markNotificationsRead as markNotificationsReadState,
  mergeMatchAlerts,
  mergeRemoteModeration,
  notificationsFor,
  rememberProfiles as rememberProfilesState,
  Persisted,
  setMotmVote as setMotmVoteState,
  setPrediction as setPredictionState,
  signInAccount,
  signInDemo as signInDemoState,
  signOut as signOutState,
  toggleFavoriteLeague as toggleFavoriteLeagueState,
  toggleFavoritePlayer as toggleFavoritePlayerState,
  toggleFavoriteTeam as toggleFavoriteTeamState,
  toggleLike as toggleLikeState,
  unblockUser as unblockUserState,
  unfollow as unfollowState,
  unreadCountFor,
  updateProfile as updateProfileState,
  usersFromState,
  type AuthMode,
} from '@/services/appState';
import { auth, userFromSupabaseAuth, type EmailAuthResult, type KickfeedAuthUser } from '@/services/auth';
import { football } from '@/services/football';
import {
  asLeaderboardClient,
  upsertRemoteMotmVote,
  upsertRemotePrediction,
} from '@/services/leaderboard';
import {
  asModerationClient,
  deleteRemoteBlock,
  insertRemoteBlock,
  insertRemoteReport,
  syncRemoteModeration,
} from '@/services/moderation';

const STORAGE_KEY = 'kickfeed.v1.state';

interface AppContextValue {
  ready: boolean;
  currentUser: User | null;
  authMode: AuthMode | null;
  supabaseConfigured: boolean;
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
  blockedUserIds: string[];
  isBlocked: (userId: string) => boolean;
  blockUser: (userId: string) => void;
  unblockUser: (userId: string) => void;
  report: (input: {
    targetType: ReportTargetType;
    targetId: string;
    targetUserId: string;
    reason: string;
  }) => ReportResult;
  hasReported: (targetType: ReportTargetType, targetId: string) => boolean;
  signInDemo: (userId: string) => void;
  signInWithEmail: (email: string, password: string) => Promise<EmailAuthResult>;
  signUpWithEmail: (email: string, password: string, displayName?: string) => Promise<EmailAuthResult>;
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
  rememberProfiles: (users: User[]) => void;
  markNotificationsRead: () => void;
  followerCount: (userId: string) => number;
  pushPrefs: PushPrefs;
  easProjectId: string | null;
  enableDeviceAlerts: () => Promise<PushRegisterResult>;
  setPushPref: (patch: Partial<Pick<PushPrefs, 'kickoff' | 'goals' | 'enabled'>>) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<Persisted>(defaults);
  const [ready, setReady] = useState(false);
  const [pushPrefs, setPushPrefs] = useState<PushPrefs>(defaultPushPrefs);
  const [easProjectId, setEasProjectId] = useState<string | null>(null);
  const [pushReady, setPushReady] = useState(false);
  const supabaseConfigured = isSupabaseConfigured();
  const stateRef = useRef(state);
  stateRef.current = state;
  const prefsRef = useRef(pushPrefs);
  prefsRef.current = pushPrefs;
  const snapshotRef = useRef<PushSnapshot>(emptyPushSnapshot());

  useEffect(() => {
    let cancelled = false;
    let unsub: (() => void) | undefined;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        const persisted = hydratePersisted(raw);
        const client = getSupabaseClient();
        if (!client) {
          if (!cancelled) {
            setState(applyRestoredSession(persisted, null));
            setReady(true);
          }
          return;
        }

        let booted = false;
        const finishBoot = (supabaseUser: User | null) => {
          if (cancelled || booted) return;
          booted = true;
          setState(applyRestoredSession(persisted, supabaseUser));
          setReady(true);
        };

        const { data } = client.auth.onAuthStateChange((event, session) => {
          const supabaseUser = session?.user
            ? userFromSupabaseAuth(session.user as KickfeedAuthUser)
            : null;
          if (event === 'INITIAL_SESSION') {
            finishBoot(supabaseUser);
            return;
          }
          if (!cancelled) {
            setState((prev) => applyAuthStateChange(prev, event, supabaseUser));
          }
        });
        unsub = () => data.subscription.unsubscribe();

        try {
          finishBoot(await auth.getSession());
        } catch {
          finishBoot(null);
        }
      } catch {
        if (!cancelled) setState(defaults());
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, []);

  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) return;
    const onChange = (status: AppStateStatus) => {
      if (status === 'active') client.auth.startAutoRefresh();
      else client.auth.stopAutoRefresh();
    };
    const sub = AppState.addEventListener('change', onChange);
    onChange(AppState.currentState);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    void football.hydrate();
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const store = await loadPushStore();
        if (cancelled) return;
        setPushPrefs(store.prefs);
        snapshotRef.current = store.snapshot;
        const projectId = await peekEasProjectId();
        if (cancelled) return;
        setEasProjectId(projectId ?? null);
      } catch {
        /* demo still works without push storage */
      } finally {
        if (!cancelled) setPushReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready || !pushReady) return;
    const syncAlerts = () => {
      const prev = stateRef.current;
      setState((s) => mergeMatchAlerts(s, favoriteMatchAlertDrafts(s.favorites, football)));
      const userId = prev.currentUserId;
      if (!userId) return;
      const slice = prev.favorites[userId];
      const plan = planFavoriteDeviceAlerts({
        userId,
        teamIds: slice?.teams ?? [],
        playerIds: slice?.players ?? [],
        provider: football,
        prefs: prefsRef.current,
        snapshot: snapshotRef.current,
      });
      snapshotRef.current = plan.snapshot;
      void persistPushState(prefsRef.current, plan.snapshot);
      void applyDeviceAlerts(plan.alerts);
    };
    syncAlerts();
    const stop = football.subscribe(syncAlerts);
    const tick = setInterval(syncAlerts, 30_000);
    return () => {
      stop();
      clearInterval(tick);
    };
  }, [ready, pushReady, pushPrefs]);

  useEffect(() => {
    if (!ready) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => undefined);
  }, [state, ready]);

  useEffect(() => {
    if (!ready) return;
    const userId = state.currentUserId;
    if (!userId || !shouldPersistModeration(supabaseConfigured, state.authMode)) return;
    let cancelled = false;
    void (async () => {
      const remote = await syncRemoteModeration(userId);
      if (cancelled || 'error' in remote) return;
      setState((prev) => {
        if (prev.currentUserId !== userId) return prev;
        return mergeRemoteModeration(prev, userId, remote.blocks, remote.reports);
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, state.currentUserId, state.authMode, supabaseConfigured]);

  const users = useMemo(() => usersFromState(state), [state]);

  const currentUser = users.find((u) => u.id === state.currentUserId) ?? null;
  const blockedUserIds = blockedIdsFor(state, currentUser?.id ?? null);
  const followingIds = currentUser
    ? (state.following[currentUser.id] ?? []).filter((id) => !blockedUserIds.includes(id))
    : [];
  const favoriteTeamIds = currentUser?.favoriteTeamIds ?? [];
  const favoriteLeagueIds = currentUser?.favoriteLeagueIds ?? [];
  const favoritePlayerIds = currentUser ? (state.favorites[currentUser.id]?.players ?? []) : [];
  const likedPostIds = currentUser ? (state.likes[currentUser.id] ?? []) : [];
  const notifications = notificationsFor(state, currentUser?.id ?? null);
  const unreadCount = unreadCountFor(state, currentUser?.id ?? null);
  const visiblePosts = visibleByAuthor(state.posts, blockedUserIds).sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );
  const visibleComments = visibleByAuthor(state.comments, blockedUserIds);

  const patch = useCallback((fn: (prev: Persisted) => Persisted) => {
    setState((prev) => fn(prev));
  }, []);

  const rememberProfiles = useCallback(
    (nextUsers: User[]) => {
      patch((p) => rememberProfilesState(p, nextUsers));
    },
    [patch],
  );

  const enableDeviceAlerts = useCallback(async (): Promise<PushRegisterResult> => {
    const result = await registerForPushNotifications();
    if (result.projectId) setEasProjectId(result.projectId);
    else setEasProjectId(null);
    if (result.permission === 'granted') {
      const next = { ...prefsRef.current, enabled: true };
      setPushPrefs(next);
      void persistPushState(next, snapshotRef.current);
    }
    return result;
  }, []);

  const setPushPref = useCallback((patchPrefs: Partial<Pick<PushPrefs, 'kickoff' | 'goals' | 'enabled'>>) => {
    setPushPrefs((prev) => {
      const next = { ...prev, ...patchPrefs };
      prefsRef.current = next;
      if (next.enabled === false && prev.enabled) {
        void cancelAllDeviceAlerts();
        snapshotRef.current = {
          ...snapshotRef.current,
          scheduled: {},
        };
      }
      void persistPushState(next, snapshotRef.current);
      return next;
    });
  }, []);

  const value = useMemo<AppContextValue>(
    () => ({
      ready,
      currentUser,
      authMode: state.authMode,
      supabaseConfigured,
      users,
      followingIds,
      favoriteTeamIds,
      favoriteLeagueIds,
      favoritePlayerIds,
      posts: visiblePosts,
      comments: visibleComments,
      notifications,
      unreadCount,
      likedPostIds,
      predictions: state.predictions,
      motmVotes: state.motmVotes,
      blockedUserIds,
      isBlocked: (userId) => isBlockedUser(blockedUserIds, userId),
      blockUser: (userId) =>
        patch((p) => {
          const next = blockUserState(p, userId);
          if (
            shouldPersistModeration(supabaseConfigured, next.authMode) &&
            next.currentUserId &&
            next !== p
          ) {
            void insertRemoteBlock(asModerationClient(getSupabaseClient()), next.currentUserId, userId);
          }
          return next;
        }),
      unblockUser: (userId) =>
        patch((p) => {
          const next = unblockUserState(p, userId);
          if (shouldPersistModeration(supabaseConfigured, next.authMode) && next.currentUserId && next !== p) {
            void deleteRemoteBlock(asModerationClient(getSupabaseClient()), next.currentUserId, userId);
          }
          return next;
        }),
      report: (input) => {
        let result: ReportResult = { ok: false, error: 'Couldn’t save this report.' };
        patch((p) => {
          const next = addReportState(p, input, Date.now());
          result = next.result;
          if (
            next.result.ok &&
            !next.result.duplicate &&
            shouldPersistModeration(supabaseConfigured, next.state.authMode) &&
            next.state.currentUserId
          ) {
            const saved = next.state.reports[0];
            if (saved) {
              void insertRemoteReport(asModerationClient(getSupabaseClient()), saved);
            }
          }
          return next.state;
        });
        return result;
      },
      hasReported: (targetType, targetId) =>
        !!currentUser &&
        state.reports.some(
          (row) =>
            row.reporterId === currentUser.id && row.targetType === targetType && row.targetId === targetId,
        ),
      signInDemo: (userId) => {
        void (async () => {
          try {
            await auth.signOut();
          } catch {
            /* demo still works without a live project */
          }
          patch((p) => signInDemoState(p, userId));
        })();
      },
      signInWithEmail: async (email, password) => {
        const result = await auth.signInWithEmail(email, password);
        if (result.status === 'signed_in') {
          patch((p) => signInAccount(p, result.user, 'supabase'));
        }
        return result;
      },
      signUpWithEmail: async (email, password, displayName) => {
        const result = await auth.signUpWithEmail(email, password, displayName);
        if (result.status === 'signed_in') {
          patch((p) => signInAccount(p, result.user, 'supabase'));
        }
        return result;
      },
      signOut: () => {
        patch(signOutState);
        void auth.signOut().catch(() => undefined);
      },
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
        patch((p) => {
          if (!fixture?.id) return p;
          const related = relatedFixtureIds(football, fixture.id);
          const next = setPredictionState(
            p,
            attachMatchId(football, fixture.id),
            homeScore,
            awayScore,
            Date.now(),
            { status: fixture.status, kickoff: fixture.kickoff },
            related,
          );
          if (shouldPersistLeaderboard(supabaseConfigured, next.authMode) && next.currentUserId) {
            const row = predictionForUser(next.predictions, next.currentUserId, related);
            if (row) {
              void upsertRemotePrediction(
                asLeaderboardClient(getSupabaseClient()),
                row,
                fixture.leagueId,
                fixture.kickoff,
              );
            }
          }
          return next;
        }),
      setMotmVote: (fixture, candidate) =>
        patch((p) => {
          if (!fixture?.id) return p;
          const related = relatedFixtureIds(football, fixture.id);
          const next = setMotmVoteState(
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
            related,
          );
          if (shouldPersistLeaderboard(supabaseConfigured, next.authMode) && next.currentUserId) {
            const row = motmVoteForUser(next.motmVotes, next.currentUserId, related);
            if (row) {
              void upsertRemoteMotmVote(asLeaderboardClient(getSupabaseClient()), row, fixture.kickoff);
            }
          }
          return next;
        }),
      rememberProfiles,
      markNotificationsRead: () => patch(markNotificationsReadState),
      followerCount: (userId) => Object.values(state.following).filter((ids) => ids.includes(userId)).length,
      pushPrefs,
      easProjectId,
      enableDeviceAlerts,
      setPushPref,
    }),
    [
      blockedUserIds,
      currentUser,
      easProjectId,
      enableDeviceAlerts,
      favoriteLeagueIds,
      favoritePlayerIds,
      favoriteTeamIds,
      followingIds,
      likedPostIds,
      notifications,
      patch,
      pushPrefs,
      rememberProfiles,
      ready,
      setPushPref,
      state,
      supabaseConfigured,
      unreadCount,
      users,
      visibleComments,
      visiblePosts,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}

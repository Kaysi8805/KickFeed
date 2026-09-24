import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform, type AppStateStatus } from 'react-native';

import type { AppNotification, Comment, DirectMessage, DmGroup, Fixture, GroupMessage, MatchTapeAnchor, MatchTapeAttachment, MotmVote, Post, PostAudience, ReportTargetType, ScorePrediction, SharedPostPayload, User } from '@/data/types';
import { motmVoteForUser, predictionForUser, type MotmCandidate } from '@/lib/engagement';
import { shouldPersistLeaderboard } from '@/lib/leaderboard';
import { defaultPushPrefs, emptyPushSnapshot, planFavoriteDeviceAlerts, type PushPrefs, type PushSnapshot } from '@/lib/favoritePush';
import { alertsForLocalDelivery, handoffSchedulesToRemote, pushFavoriteTeamIds } from '@/lib/remotePush';
import { attachMatchId, favoriteMatchAlertDrafts, relatedFixtureIds } from '@/lib/matchSocial';
import {
  isBlockedUser,
  shouldPersistModeration,
  visibleByAuthor,
  type ReportResult,
} from '@/lib/moderation';
import {
  canDmPeer,
  dmSlowMode,
  inboxThreads,
  messagesForThread,
  shouldPersistDms,
  visibleDirectMessages,
  type DmThread,
  type SendDmResult,
} from '@/lib/dms';
import {
  conversationInbox,
  groupSendBlockReason,
  groupSlowMode,
  isGroupMember,
  visibleGroupMessages,
  type InboxEntry,
  type SendGroupResult,
} from '@/lib/groups';
import { shouldPersistLiveCircle } from '@/lib/liveCircle';
import { governingTape, type TapeScoreSnapshot, type TapeTeams } from '@/lib/matchTape';
import { sharedPostBody } from '@/lib/shareToChat';
import {
  applyDeviceAlerts,
  cancelAllDeviceAlerts,
  loadPushStore,
  peekEasProjectId,
  persistPushState,
  readPushTokenIfGranted,
  registerForPushNotifications,
  type PushRegisterResult,
} from '@/services/notifications';
import {
  ackRemotePushFingerprints,
  asPushDeviceClient,
  pushPlatform,
  requestRemotePushTest,
  shouldPersistPushDevice,
  upsertRemotePushDevice,
  type PushRemoteStatus,
} from '@/services/pushDevices';
import { demoModeEnabled, shouldDropDemoSession } from '@/lib/demoMode';
import { isSupabaseConfigured, getSupabaseClient } from '@/services/supabase';
import {
  addComment as addCommentState,
  addPost as addPostState,
  addReport as addReportState,
  applyAuthStateChange,
  applyRestoredSession,
  blockUser as blockUserState,
  blockedIdsFor,
  cannotDmPeerIds,
  defaults,
  createDmGroup as createDmGroupState,
  dmReadsFor,
  follow as followState,
  groupReadsFor,
  archiveMatchTape as archiveMatchTapeState,
  attachMatchTape as attachMatchTapeState,
  dropMatchTape,
  leaveDmGroup as leaveDmGroupState,
  liveCircleEnabledFor,
  noteFriendLive as noteFriendLiveState,
  hydratePersisted,
  markDmThreadRead as markDmThreadReadState,
  markNotificationsRead as markNotificationsReadState,
  mergeMatchAlerts,
  markGroupRead as markGroupReadState,
  mergeRemoteDirectMessages,
  mergeRemoteGroupChats,
  mergeRemoteMatchTapes,
  mergeRemoteModeration,
  notificationsFor,
  rememberProfiles as rememberProfilesState,
  Persisted,
  sendDirectMessage as sendDirectMessageState,
  sendGroupMessage as sendGroupMessageState,
  setLiveCircleEnabled as setLiveCircleEnabledState,
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
import {
  clearDemoPresence,
  clearRemoteLiveCircle,
  fetchRemoteLiveCircleEnabled,
  liveCircleClient,
  setRemoteLiveCircle,
  syncRemoteFollows,
} from '@/services/liveCircle';
import {
  asDmsClient,
  deleteRemoteGroupMember,
  insertRemoteDirectMessage,
  insertRemoteDmGroup,
  insertRemoteGroupMessage,
  syncRemoteDirectMessages,
  syncRemoteGroupChats,
} from '@/services/dms';
import {
  archiveRemoteMatchTape,
  asMatchTapeClient,
  attachRemoteMatchTape,
  fetchRemoteMatchTapes,
} from '@/services/matchTapeRemote';

const STORAGE_KEY = 'kickfeed.v1.state';

interface AppContextValue {
  ready: boolean;
  currentUser: User | null;
  authMode: AuthMode | null;
  supabaseConfigured: boolean;
  users: User[];
  followingIds: string[];
  /** Mutual follows: you follow them and they follow you. Demo graph only — not a server friend list. */
  friendIds: string[];
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
  cannotDmUserIds: string[];
  isBlocked: (userId: string) => boolean;
  canMessage: (userId: string) => boolean;
  blockUser: (userId: string) => void;
  unblockUser: (userId: string) => void;
  report: (input: {
    targetType: ReportTargetType;
    targetId: string;
    targetUserId: string;
    reason: string;
  }) => ReportResult;
  hasReported: (targetType: ReportTargetType, targetId: string) => boolean;
  directMessages: DirectMessage[];
  dmThreads: DmThread[];
  inbox: InboxEntry[];
  unreadDmCount: number;
  threadMessages: (peerId: string) => DirectMessage[];
  sendDirectMessage: (peerId: string, text: string, tape?: MatchTapeAnchor | null) => SendDmResult;
  markDmThreadRead: (peerId: string) => void;
  dmSlowModeFor: (peerId: string, now?: number) => ReturnType<typeof dmSlowMode>;
  dmGroups: DmGroup[];
  createDmGroup: (
    pickedIds: string[],
    title?: string | null,
  ) => { ok: true; group: DmGroup } | { ok: false; error: string };
  leaveDmGroup: (groupId: string) => void;
  groupThreadMessages: (groupId: string) => GroupMessage[];
  sendGroupMessage: (groupId: string, text: string, tape?: MatchTapeAnchor | null) => SendGroupResult;
  matchTapes: MatchTapeAttachment[];
  tapeForThread: (threadKey: string) => MatchTapeAttachment | null;
  attachMatchTape: (input: {
    kind: 'dm' | 'group';
    threadKey: string;
    matchId: string;
    teams: TapeTeams;
    kickoff?: string;
  }) => Promise<{ ok: true; attachment: MatchTapeAttachment } | { ok: false; error: string }>;
  archiveMatchTape: (
    id: string,
    snapshot?: TapeScoreSnapshot,
  ) => Promise<{ ok: true; attachment: MatchTapeAttachment } | { ok: false; error: string }>;
  sendPostToChat: (
    target: { kind: 'direct'; peerId: string } | { kind: 'group'; groupId: string },
    share: SharedPostPayload,
  ) => SendDmResult | SendGroupResult;
  markGroupRead: (groupId: string) => void;
  groupSlowModeFor: (groupId: string, now?: number) => ReturnType<typeof groupSlowMode>;
  groupBlockReason: (groupId: string) => string | null;
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
  addPost: (text: string, imageUri?: string, matchId?: string, audience?: PostAudience) => void;
  toggleLike: (postId: string) => void;
  addComment: (matchId: string, text: string, parentId?: string) => void;
  setPrediction: (fixture: Fixture, homeScore: number, awayScore: number) => void;
  setMotmVote: (fixture: Fixture, candidate: MotmCandidate) => void;
  rememberProfiles: (users: User[]) => void;
  markNotificationsRead: () => void;
  followerCount: (userId: string) => number;
  pushPrefs: PushPrefs;
  pushToken: string | null;
  pushRemote: PushRemoteStatus;
  easProjectId: string | null;
  enableDeviceAlerts: () => Promise<PushRegisterResult>;
  setPushPref: (patch: Partial<Pick<PushPrefs, 'kickoff' | 'goals' | 'enabled'>>) => void;
  sendRemotePushTest: () => Promise<string>;
  liveCircleEnabled: boolean;
  setLiveCircleEnabled: (enabled: boolean) => void;
  noteFriendLive: (input: {
    actorId: string;
    actorName: string;
    fixtureId: string;
    fixtureLabel: string;
  }) => boolean;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<Persisted>(defaults);
  const [ready, setReady] = useState(false);
  const [pushPrefs, setPushPrefs] = useState<PushPrefs>(defaultPushPrefs);
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [pushRemote, setPushRemote] = useState<PushRemoteStatus>('off');
  const [easProjectId, setEasProjectId] = useState<string | null>(null);
  const [pushReady, setPushReady] = useState(false);
  const supabaseConfigured = isSupabaseConfigured();
  const stateRef = useRef(state);
  stateRef.current = state;
  const prefsRef = useRef(pushPrefs);
  prefsRef.current = pushPrefs;
  const snapshotRef = useRef<PushSnapshot>(emptyPushSnapshot());
  const tokenRef = useRef<string | null>(null);
  const remoteSyncedRef = useRef(false);
  remoteSyncedRef.current = pushRemote === 'synced';

  useEffect(() => {
    let cancelled = false;
    let unsub: (() => void) | undefined;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        const restored = hydratePersisted(raw);
        const persisted = shouldDropDemoSession(restored.authMode, demoModeEnabled())
          ? signOutState(restored)
          : restored;
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

        const timer = setTimeout(() => {
          if (cancelled || booted) return;
          booted = true;
          setState(persisted);
          setReady(true);
        }, 8000);
        try {
          finishBoot(await auth.getSession());
        } catch {
          if (!cancelled && !booted) {
            booted = true;
            setState(persisted);
            setReady(true);
          }
        } finally {
          clearTimeout(timer);
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
        tokenRef.current = store.token;
        setPushToken(store.token);
        if (store.prefs.enabled) {
          const fresh = await readPushTokenIfGranted();
          if (!cancelled && fresh) {
            tokenRef.current = fresh;
            setPushToken(fresh);
            await persistPushState(store.prefs, store.snapshot, fresh);
          }
        }
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
      const synced = remoteSyncedRef.current;
      const handed = handoffSchedulesToRemote(plan.alerts, plan.snapshot, synced);
      snapshotRef.current = handed.snapshot;
      void persistPushState(prefsRef.current, handed.snapshot, tokenRef.current);
      const appActive = AppState.currentState === 'active';
      const delivery = alertsForLocalDelivery(handed.alerts, {
        synced,
        appActive,
      });
      void applyDeviceAlerts(delivery);
      if (remoteSyncedRef.current && appActive && userId && shouldPersistPushDevice(supabaseConfigured, prev.authMode)) {
        const shown = plan.alerts.filter((alert) => alert.action === 'present').map((alert) => alert.fingerprint);
        const client = asPushDeviceClient(getSupabaseClient());
        if (client && shown.length) void ackRemotePushFingerprints(client, userId, shown);
      }
    };
    syncAlerts();
    const stop = football.subscribe(syncAlerts);
    const tick = setInterval(syncAlerts, 30_000);
    return () => {
      stop();
      clearInterval(tick);
    };
  }, [ready, pushReady, pushPrefs, pushRemote, supabaseConfigured]);

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
        return mergeRemoteModeration(prev, userId, remote.blocks, remote.reports, remote.blockedBy);
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, state.currentUserId, state.authMode, supabaseConfigured]);

  useEffect(() => {
    if (!ready) return;
    const userId = state.currentUserId;
    if (!userId || !shouldPersistDms(supabaseConfigured, state.authMode)) return;
    let cancelled = false;
    void (async () => {
      const [remote, groups] = await Promise.all([
        syncRemoteDirectMessages(userId),
        syncRemoteGroupChats(userId),
      ]);
      if (cancelled) return;
      setState((prev) => {
        if (prev.currentUserId !== userId) return prev;
        let next = prev;
        if (!('error' in remote)) next = mergeRemoteDirectMessages(next, userId, remote.messages);
        if (!('error' in groups)) next = mergeRemoteGroupChats(next, userId, groups.groups, groups.messages);
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, state.currentUserId, state.authMode, supabaseConfigured]);

  useEffect(() => {
    if (!ready) return;
    const userId = state.currentUserId;
    if (!userId || !shouldPersistDms(supabaseConfigured, state.authMode)) return;
    let cancelled = false;
    void (async () => {
      const remote = await fetchRemoteMatchTapes(asMatchTapeClient(getSupabaseClient()));
      if (cancelled || 'error' in remote) return;
      setState((prev) => {
        if (prev.currentUserId !== userId) return prev;
        return mergeRemoteMatchTapes(prev, remote.tapes);
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, state.currentUserId, state.authMode, supabaseConfigured]);

  const followKey = (state.currentUserId ? (state.following[state.currentUserId] ?? []) : []).join('\n');
  useEffect(() => {
    if (!ready) return;
    const userId = state.currentUserId;
    if (!userId || !shouldPersistLiveCircle(supabaseConfigured, state.authMode)) return;
    void syncRemoteFollows(liveCircleClient(), state.following[userId] ?? []);
  }, [followKey, ready, state.authMode, state.currentUserId, state.following, supabaseConfigured]);

  const liveChoice = state.currentUserId ? state.liveCircleEnabled[state.currentUserId] : undefined;
  useEffect(() => {
    if (!ready) return;
    const userId = state.currentUserId;
    if (!userId || !shouldPersistLiveCircle(supabaseConfigured, state.authMode)) return;
    const client = liveCircleClient();
    let cancelled = false;
    void (async () => {
      if (liveChoice === undefined) {
        const remote = await fetchRemoteLiveCircleEnabled(client, userId);
        if (cancelled || remote !== true) return;
        setState((prev) => {
          if (prev.currentUserId !== userId || prev.liveCircleEnabled[userId] !== undefined) return prev;
          return setLiveCircleEnabledState(prev, true);
        });
        return;
      }
      await setRemoteLiveCircle(client, liveChoice);
    })();
    return () => {
      cancelled = true;
    };
  }, [liveChoice, ready, state.authMode, state.currentUserId, supabaseConfigured]);

  const users = useMemo(() => usersFromState(state), [state]);

  const currentUser = users.find((u) => u.id === state.currentUserId) ?? null;
  const blockedUserIds = blockedIdsFor(state, currentUser?.id ?? null);
  const cannotDmUserIds = cannotDmPeerIds(state, currentUser?.id ?? null);
  const dmReadMap = dmReadsFor(state, currentUser?.id ?? null);
  const groupReadMap = groupReadsFor(state, currentUser?.id ?? null);
  const visibleDms = visibleDirectMessages(state.directMessages, currentUser?.id ?? null, cannotDmUserIds);
  const dmThreadList = inboxThreads(state.directMessages, currentUser?.id ?? null, cannotDmUserIds, dmReadMap);
  const myGroups = currentUser ? state.dmGroups.filter((group) => isGroupMember(group, currentUser.id)) : [];
  const inbox = conversationInbox({
    directs: dmThreadList,
    groups: myGroups,
    groupMessages: state.groupMessages,
    userId: currentUser?.id ?? null,
    hiddenIds: cannotDmUserIds,
    groupReads: groupReadMap,
    nameOf: (id) => users.find((user) => user.id === id)?.name,
  });
  const dmUnread = inbox.reduce((sum, row) => sum + row.unreadCount, 0);
  const followingIds = currentUser
    ? (state.following[currentUser.id] ?? []).filter((id) => !blockedUserIds.includes(id))
    : [];
  const friendIds = currentUser
    ? followingIds.filter((id) => (state.following[id] ?? []).includes(currentUser.id))
    : [];
  const liveCircleOn = liveCircleEnabledFor(state, currentUser?.id ?? null);
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
  const pushTeamKey = pushFavoriteTeamIds({
    teamIds: favoriteTeamIds,
    playerIds: favoritePlayerIds,
    relatedTeamIds: (id) => football.relatedIds('team', id),
    teamIdForPlayer: (id) => football.getPlayer(id)?.teamId,
  }).join('\n');

  useEffect(() => {
    if (!ready || !pushReady) return;
    let cancelled = false;
    const prefs = pushPrefs;
    const token = pushToken;
    const userId = state.currentUserId;
    const authMode = state.authMode;
    const platform = pushPlatform(Platform.OS);
    const favoriteTeamIdsForDevice = pushTeamKey ? pushTeamKey.split('\n') : [];

    void (async () => {
      const client = asPushDeviceClient(getSupabaseClient());
      const canSync = Boolean(token && platform && client && shouldPersistPushDevice(supabaseConfigured, authMode) && userId);
      if (!prefs.enabled) {
        if (canSync && client && token && platform) {
          await upsertRemotePushDevice(client, {
            token,
            platform,
            enabled: false,
            kickoff: prefs.kickoff,
            goals: prefs.goals,
            favoriteTeamIds: favoriteTeamIdsForDevice,
          });
        }
        if (!cancelled) setPushRemote('off');
        return;
      }
      if (!token || !platform) {
        if (!cancelled) setPushRemote('local');
        return;
      }
      if (!supabaseConfigured) {
        if (!cancelled) setPushRemote('unconfigured');
        return;
      }
      if (authMode !== 'supabase' || !userId) {
        if (!cancelled) setPushRemote('demo');
        return;
      }
      if (!client) {
        if (!cancelled) setPushRemote('unconfigured');
        return;
      }
      if (!cancelled) setPushRemote((prev) => (prev === 'synced' ? prev : 'pending'));
      const result = await upsertRemotePushDevice(client, {
        token,
        platform,
        enabled: true,
        kickoff: prefs.kickoff,
        goals: prefs.goals,
        favoriteTeamIds: favoriteTeamIdsForDevice,
      });
      if (!cancelled) setPushRemote(result.ok ? 'synced' : 'error');
    })();

    return () => {
      cancelled = true;
    };
  }, [
    pushPrefs,
    pushReady,
    pushTeamKey,
    pushToken,
    ready,
    state.authMode,
    state.currentUserId,
    supabaseConfigured,
  ]);

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
      prefsRef.current = next;
      setPushPrefs(next);
      if (result.token) {
        tokenRef.current = result.token;
        setPushToken(result.token);
      }
      void persistPushState(next, snapshotRef.current, tokenRef.current);
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
      void persistPushState(next, snapshotRef.current, tokenRef.current);
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
      friendIds,
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
      cannotDmUserIds,
      isBlocked: (userId) => isBlockedUser(blockedUserIds, userId),
      canMessage: (userId) => canDmPeer(currentUser?.id ?? null, userId, cannotDmUserIds),
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
      directMessages: visibleDms,
      dmThreads: dmThreadList,
      inbox,
      unreadDmCount: dmUnread,
      threadMessages: (peerId) =>
        currentUser ? messagesForThread(visibleDms, currentUser.id, peerId) : [],
      sendDirectMessage: (peerId, text, tape) => {
        let result: SendDmResult = { ok: false, error: 'Couldn’t send this message.' };
        patch((p) => {
          const next = sendDirectMessageState(p, peerId, text, Date.now(), undefined, tape);
          result = next.result;
          if (
            next.result.ok &&
            shouldPersistDms(supabaseConfigured, next.state.authMode) &&
            next.state.currentUserId
          ) {
            void insertRemoteDirectMessage(asDmsClient(getSupabaseClient()), next.result.message);
          }
          return next.state;
        });
        return result;
      },
      markDmThreadRead: (peerId) => patch((p) => markDmThreadReadState(p, peerId)),
      dmSlowModeFor: (peerId, now = Date.now()) =>
        dmSlowMode(
          state.directMessages,
          currentUser?.id,
          peerId,
          now,
          state.groupMessages.filter((row) => row.senderId === currentUser?.id),
        ),
      dmGroups: myGroups,
      createDmGroup: (pickedIds, title) => {
        let result: { ok: true; group: DmGroup } | { ok: false; error: string } = {
          ok: false,
          error: 'Couldn’t create that group.',
        };
        patch((p) => {
          const next = createDmGroupState(p, pickedIds, title, Date.now());
          result = next.result;
          if (next.result.ok && shouldPersistDms(supabaseConfigured, next.state.authMode)) {
            void insertRemoteDmGroup(asDmsClient(getSupabaseClient()), next.result.group);
          }
          return next.state;
        });
        return result;
      },
      leaveDmGroup: (groupId) =>
        patch((p) => {
          const userId = p.currentUserId;
          const next = leaveDmGroupState(p, groupId);
          if (userId && next !== p && shouldPersistDms(supabaseConfigured, next.authMode)) {
            void deleteRemoteGroupMember(asDmsClient(getSupabaseClient()), groupId, userId);
          }
          return next;
        }),
      groupThreadMessages: (groupId) =>
        visibleGroupMessages(state.groupMessages, groupId, cannotDmUserIds),
      sendGroupMessage: (groupId, text, tape) => {
        let result: SendGroupResult = { ok: false, error: 'Couldn’t send this message.' };
        patch((p) => {
          const next = sendGroupMessageState(p, groupId, text, Date.now(), undefined, tape);
          result = next.result;
          if (next.result.ok && shouldPersistDms(supabaseConfigured, next.state.authMode)) {
            void insertRemoteGroupMessage(asDmsClient(getSupabaseClient()), next.result.message);
          }
          return next.state;
        });
        return result;
      },
      sendPostToChat: (target, share) => {
        const text = sharedPostBody(share);
        if (target.kind === 'direct') {
          let result: SendDmResult = { ok: false, error: 'Couldn’t share that post.' };
          patch((p) => {
            const next = sendDirectMessageState(p, target.peerId, text, Date.now(), share);
            result = next.result;
            if (next.result.ok && shouldPersistDms(supabaseConfigured, next.state.authMode)) {
              void insertRemoteDirectMessage(asDmsClient(getSupabaseClient()), next.result.message);
            }
            return next.state;
          });
          return result;
        }
        let result: SendGroupResult = { ok: false, error: 'Couldn’t share that post.' };
        patch((p) => {
          const next = sendGroupMessageState(p, target.groupId, text, Date.now(), share);
          result = next.result;
          if (next.result.ok && shouldPersistDms(supabaseConfigured, next.state.authMode)) {
            void insertRemoteGroupMessage(asDmsClient(getSupabaseClient()), next.result.message);
          }
          return next.state;
        });
        return result;
      },
      markGroupRead: (groupId) => patch((p) => markGroupReadState(p, groupId)),
      groupSlowModeFor: (groupId, now = Date.now()) =>
        groupSlowMode(state.groupMessages, state.directMessages, currentUser?.id, groupId, now),
      matchTapes: state.matchTapes,
      tapeForThread: (threadKey) => governingTape(state.matchTapes, threadKey),
      attachMatchTape: async (input) => {
        const held: { result: { ok: true; attachment: MatchTapeAttachment } | { ok: false; error: string } | null } = {
          result: null,
        };
        patch((p) => {
          const next = attachMatchTapeState(p, input, Date.now());
          held.result = next.result;
          return next.state;
        });
        const result = held.result ?? { ok: false as const, error: 'Couldn’t start that Match Tape.' };
        if (!result.ok) return result;
        if (shouldPersistDms(supabaseConfigured, stateRef.current.authMode)) {
          const remote = await attachRemoteMatchTape(asMatchTapeClient(getSupabaseClient()), result.attachment);
          if (remote.error) {
            patch((p) => dropMatchTape(p, result.attachment.id));
            return { ok: false, error: remote.error };
          }
        }
        return result;
      },
      archiveMatchTape: async (id, snapshot) => {
        const held: {
          previous: MatchTapeAttachment | null;
          result: { ok: true; attachment: MatchTapeAttachment } | { ok: false; error: string } | null;
        } = { previous: null, result: null };
        patch((p) => {
          held.previous = p.matchTapes.find((row) => row.id === id) ?? null;
          const next = archiveMatchTapeState(p, id, Date.now(), snapshot);
          held.result = next.result;
          return next.state;
        });
        const result = held.result ?? { ok: false as const, error: 'Couldn’t archive that Match Tape.' };
        if (!result.ok) return result;
        if (held.previous?.status === 'archived') return result;
        if (shouldPersistDms(supabaseConfigured, stateRef.current.authMode)) {
          const remote = await archiveRemoteMatchTape(asMatchTapeClient(getSupabaseClient()), id, snapshot);
          if (remote.error && held.previous) {
            const revert = held.previous;
            patch((p) => ({
              ...p,
              matchTapes: p.matchTapes.map((row) => (row.id === id ? revert : row)),
            }));
            return { ok: false, error: remote.error };
          }
        }
        return result;
      },
      groupBlockReason: (groupId) => {
        const group = myGroups.find((row) => row.id === groupId);
        if (!group) return 'This group isn’t on KickFeed.';
        return groupSendBlockReason(group, currentUser?.id, cannotDmUserIds);
      },
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
        const token = tokenRef.current;
        const prev = stateRef.current;
        const platform = pushPlatform(Platform.OS);
        const client = asPushDeviceClient(getSupabaseClient());
        if (prev.currentUserId) clearDemoPresence(prev.currentUserId);
        if (shouldPersistLiveCircle(supabaseConfigured, prev.authMode)) {
          void clearRemoteLiveCircle(liveCircleClient());
        }
        patch(signOutState);
        void (async () => {
          if (token && platform && client && shouldPersistPushDevice(supabaseConfigured, prev.authMode)) {
            await upsertRemotePushDevice(client, {
              token,
              platform,
              enabled: false,
              kickoff: prefsRef.current.kickoff,
              goals: prefsRef.current.goals,
              favoriteTeamIds: [],
            });
          }
          tokenRef.current = null;
          setPushToken(null);
          await auth.signOut().catch(() => undefined);
        })();
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
      addPost: (text, imageUri, matchId, audience = 'friends') =>
        patch((p) =>
          addPostState(
            p,
            text,
            imageUri,
            Date.now(),
            matchId ? attachMatchId(football, matchId) : undefined,
            audience,
          ),
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
      pushToken,
      pushRemote,
      easProjectId,
      enableDeviceAlerts,
      setPushPref,
      sendRemotePushTest: async () => {
        const client = getSupabaseClient();
        if (!client || !shouldPersistPushDevice(supabaseConfigured, state.authMode)) {
          return 'Sign in with email to send a remote test. Demo mode stays on this device.';
        }
        const result = await requestRemotePushTest(client);
        return result.message;
      },
      liveCircleEnabled: liveCircleOn,
      setLiveCircleEnabled: (enabled) =>
        patch((p) => {
          const next = setLiveCircleEnabledState(p, enabled);
          if (shouldPersistLiveCircle(supabaseConfigured, next.authMode)) {
            void setRemoteLiveCircle(liveCircleClient(), enabled);
            if (!enabled) void clearRemoteLiveCircle(liveCircleClient());
          }
          if (!enabled && next.currentUserId) clearDemoPresence(next.currentUserId);
          return next;
        }),
      noteFriendLive: (input) => {
        let fresh = false;
        patch((p) => {
          const next = noteFriendLiveState(p, input, Date.now());
          fresh = next.fresh;
          return next.state;
        });
        return fresh;
      },
    }),
    [
      blockedUserIds,
      cannotDmUserIds,
      currentUser,
      dmThreadList,
      dmUnread,
      inbox,
      myGroups,
      easProjectId,
      enableDeviceAlerts,
      favoriteLeagueIds,
      favoritePlayerIds,
      favoriteTeamIds,
      followingIds,
      friendIds,
      likedPostIds,
      liveCircleOn,
      notifications,
      patch,
      pushPrefs,
      pushRemote,
      pushToken,
      rememberProfiles,
      ready,
      setPushPref,
      state,
      supabaseConfigured,
      unreadCount,
      users,
      visibleComments,
      visibleDms,
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

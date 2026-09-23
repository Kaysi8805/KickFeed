import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/ui/Avatar';
import {
  LIVE_CIRCLE_EMPTY,
  LIVE_CIRCLE_HEARTBEAT_MS,
  LIVE_CIRCLE_POLL_MS,
  isLiveCircleFixtureId,
  liveCircleChatTarget,
  liveCircleFixtureLabel,
  liveCircleProfilePayload,
  liveCirclePushBody,
  liveCircleRoute,
  shouldPersistLiveCircle,
  visibleLiveCircleFriends,
  type LiveCirclePerson,
} from '@/lib/liveCircle';
import { messagesForThread } from '@/lib/dms';
import { useApp } from '@/services/AppProvider';
import {
  clearDemoPresence,
  clearRemoteLiveCircle,
  fetchRemoteLiveCircle,
  liveCircleClient,
  readDemoPresence,
  requestLiveCirclePush,
  touchRemoteLiveCircle,
  writeDemoPresence,
} from '@/services/liveCircle';
import { getSupabaseClient } from '@/services/supabase';
import { presentLiveCircleBanner } from '@/services/notifications';
import { colors, radius, spacing, type } from '@/theme';

type Props = {
  fixtureId: string;
  homeName: string;
  awayName: string;
  homeTeamId: string;
  awayTeamId: string;
};

export function LiveCircleRow({ fixtureId, homeName, awayName, homeTeamId, awayTeamId }: Props) {
  const {
    currentUser,
    authMode,
    supabaseConfigured,
    liveCircleEnabled,
    friendIds,
    cannotDmUserIds,
    canMessage,
    directMessages,
    dmGroups,
    pushPrefs,
    noteFriendLive,
  } = useApp();
  const [people, setPeople] = useState<LiveCirclePerson[]>([]);
  const [ready, setReady] = useState(false);
  const focused = useRef(false);
  const enabled = liveCircleEnabled && !!currentUser && isLiveCircleFixtureId(fixtureId);
  const label = liveCircleFixtureLabel(homeName, awayName);
  const userRef = useRef(currentUser);
  userRef.current = currentUser;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const pushRef = useRef(pushPrefs.enabled);
  pushRef.current = pushPrefs.enabled;
  const publishRef = useRef<() => Promise<void>>(async () => undefined);
  const refreshRef = useRef<() => Promise<void>>(async () => undefined);
  const clearRef = useRef<() => void>(() => undefined);

  const clear = useCallback(() => {
    const user = userRef.current;
    if (!user) return;
    clearDemoPresence(user.id);
    if (shouldPersistLiveCircle(supabaseConfigured, authMode)) {
      void clearRemoteLiveCircle(liveCircleClient());
    }
  }, [authMode, supabaseConfigured]);

  const publish = useCallback(async () => {
    const user = userRef.current;
    if (!user || !enabledRef.current || !focused.current || AppState.currentState !== 'active') return;
    const profile = liveCircleProfilePayload(user);
    const row: LiveCirclePerson = {
      userId: user.id,
      fixtureId,
      displayName: profile.displayName,
      handle: profile.handle,
      initials: profile.initials,
      avatarColor: profile.avatarColor,
      heartbeatAt: new Date().toISOString(),
      optedIn: true,
    };
    if (!shouldPersistLiveCircle(supabaseConfigured, authMode)) {
      writeDemoPresence(row);
      return;
    }
    const result = await touchRemoteLiveCircle(liveCircleClient(), {
      fixtureId,
      displayName: profile.displayName,
      handle: profile.handle,
      initials: profile.initials,
      avatarColor: profile.avatarColor,
    });
    if ('error' in result || !result.started) return;
    void requestLiveCirclePush(getSupabaseClient(), {
      fixtureId,
      fixtureLabel: label,
      homeTeamId,
      awayTeamId,
    });
  }, [authMode, awayTeamId, fixtureId, homeTeamId, label, supabaseConfigured]);

  const refresh = useCallback(async () => {
    const user = userRef.current;
    if (!user || !enabledRef.current) {
      setPeople([]);
      setReady(true);
      return;
    }
    const remote = shouldPersistLiveCircle(supabaseConfigured, authMode);
    const rows = remote ? await fetchRemoteLiveCircle(liveCircleClient(), fixtureId) : readDemoPresence();
    const next = visibleLiveCircleFriends({
      viewerId: user.id,
      fixtureId,
      now: Date.now(),
      friendIds,
      hiddenIds: cannotDmUserIds,
      rows,
      serverTrusted: remote,
    });
    setPeople(next);
    setReady(true);
    for (const person of next) {
      const fresh = noteFriendLive({
        actorId: person.userId,
        actorName: person.displayName,
        fixtureId,
        fixtureLabel: label,
      });
      if (fresh && pushRef.current) {
        void presentLiveCircleBanner({
          fingerprint: `live:${user.id}:${person.userId}:${fixtureId}`,
          matchId: fixtureId,
          title: 'Live Circle',
          body: liveCirclePushBody(person.displayName, label),
        });
      }
    }
  }, [authMode, cannotDmUserIds, fixtureId, friendIds, label, noteFriendLive, supabaseConfigured]);

  publishRef.current = publish;
  refreshRef.current = refresh;
  clearRef.current = clear;

  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      void publishRef.current();
      void refreshRef.current();
      return () => {
        focused.current = false;
        clearRef.current();
      };
    }, []),
  );

  useEffect(() => {
    if (!enabled) {
      clearRef.current();
      setPeople([]);
      setReady(false);
      return;
    }
    void publishRef.current();
    void refreshRef.current();
    const beat = setInterval(() => {
      if (!focused.current || AppState.currentState !== 'active') return;
      void publishRef.current();
    }, LIVE_CIRCLE_HEARTBEAT_MS);
    const poll = setInterval(() => {
      if (!focused.current || AppState.currentState !== 'active') return;
      void refreshRef.current();
    }, LIVE_CIRCLE_POLL_MS);
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') {
        clearRef.current();
        return;
      }
      if (focused.current) {
        void publishRef.current();
        void refreshRef.current();
      }
    });
    return () => {
      clearInterval(beat);
      clearInterval(poll);
      sub.remove();
    };
  }, [enabled, fixtureId]);

  useEffect(() => {
    if (!enabled || !shouldPersistLiveCircle(supabaseConfigured, authMode)) return;
    const client = getSupabaseClient();
    if (!client || !/^[A-Za-z0-9_-]+$/.test(fixtureId)) return;
    const channel = client
      .channel(`live-circle:${fixtureId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'live_circle_presence', filter: `fixture_id=eq.${fixtureId}` },
        () => {
          void refreshRef.current();
        },
      )
      .subscribe();
    return () => {
      void client.removeChannel(channel);
    };
  }, [authMode, enabled, fixtureId, supabaseConfigured]);

  if (!enabled) return null;

  function open(person: LiveCirclePerson) {
    if (!currentUser || !canMessage(person.userId)) return;
    const target = liveCircleChatTarget({
      viewerId: currentUser.id,
      peerId: person.userId,
      hasDirectThread: messagesForThread(directMessages, currentUser.id, person.userId).length > 0,
      groups: dmGroups,
    });
    if (!target) return;
    router.push(liveCircleRoute(target) as Href);
  }

  return (
    <View style={styles.wrap} accessibilityRole="summary">
      <Text style={styles.kicker}>LIVE CIRCLE</Text>
      {people.length === 0 ? (
        ready ? <Text style={styles.quiet}>{LIVE_CIRCLE_EMPTY}</Text> : null
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {people.map((person) => (
            <Pressable
              key={person.userId}
              onPress={() => open(person)}
              style={styles.person}
              accessibilityRole="button"
              accessibilityLabel={`Message ${person.displayName}, live on this match`}
            >
              <Avatar initials={person.initials} color={person.avatarColor} size={36} ringColor={colors.border} />
              <Text style={styles.name} numberOfLines={1}>
                {person.displayName.split(' ')[0]}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  kicker: { ...type.micro, color: colors.textMuted },
  quiet: { ...type.caption, color: colors.textDim, fontWeight: '500', marginTop: 4 },
  row: { flexDirection: 'row', gap: 12, paddingTop: spacing.sm, paddingBottom: 2 },
  person: { width: 64, alignItems: 'center', gap: 4 },
  name: { ...type.caption, color: colors.text, fontWeight: '600', textAlign: 'center' },
});

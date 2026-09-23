import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, Platform } from 'react-native';

import { PostCard } from '@/components/feed/PostCard';
import { Avatar } from '@/components/ui/Avatar';
import { Crest } from '@/components/ui/Crest';
import { EmptyState } from '@/components/ui/EmptyState';
import { SafeBoundary } from '@/components/ui/SafeBoundary';
import { Screen } from '@/components/ui/Screen';
import { useFootballCatalog } from '@/lib/useFootballCatalog';
import { deviceAlertsCopy } from '@/lib/favoritePush';
import {
  ALERTS_UNAVAILABLE_BODY,
  ALERTS_UNAVAILABLE_TITLE,
  BLOCKED_LIST_EMPTY_BODY,
  BLOCKED_LIST_EMPTY_TITLE,
  FAN_PICKS_NOT_GAMBLING,
  moderationDisclaimer,
} from '@/lib/honesty';
import { demoModeEnabled } from '@/lib/demoMode';
import { appChannelFromEnv, isStoreFacingChannel } from '@/lib/storeChannel';
import { matchAlertsIntro, profileAccountNote } from '@/lib/storeCopy';
import { shouldPersistModeration } from '@/lib/moderation';
import { useApp } from '@/services/AppProvider';
import { football } from '@/services/football';
import { scheduleDemoNotification } from '@/services/notifications';
import { tv } from '@/services/tv';
import { entityHref } from '@/lib/entityNav';
import { resolveTvCountryId } from '@/lib/tvCountry';
import { colors, radius, spacing, type } from '@/theme';

export default function ProfileScreen() {
  useFootballCatalog();
  const {
    currentUser,
    authMode,
    supabaseConfigured,
    posts,
    users,
    likedPostIds,
    toggleLike,
    followingIds,
    followerCount,
    signOut,
    favoritePlayerIds,
    pushPrefs,
    pushToken,
    pushRemote,
    easProjectId,
    enableDeviceAlerts,
    setPushPref,
    sendRemotePushTest,
    blockedUserIds,
    unblockUser,
  } = useApp();
  const [pushBusy, setPushBusy] = useState(false);
  const [pushNote, setPushNote] = useState<string | null>(null);
  const [remoteBusy, setRemoteBusy] = useState(false);
  if (!currentUser) return null;
  const mine = posts.filter((p) => p.authorId === currentUser.id);
  const teams = currentUser.favoriteTeamIds.map((id) => football.getTeam(id)).filter(Boolean);
  const players = favoritePlayerIds.map((id) => football.getPlayer(id)).filter(Boolean);
  const tvCountry = tv.getCountry(resolveTvCountryId(currentUser.tvCountryId));
  const blockedPeople = users.filter((u) => blockedUserIds.includes(u.id));
  const honesty = moderationDisclaimer(shouldPersistModeration(supabaseConfigured, authMode));
  const storeFacing = isStoreFacingChannel(appChannelFromEnv());
  const demo = demoModeEnabled();
  const pushHint =
    pushNote ??
    deviceAlertsCopy({
      optedIn: pushPrefs.enabled,
      projectId: easProjectId ?? undefined,
      permission: pushPrefs.enabled ? 'granted' : 'undetermined',
      token: pushToken,
      platform: Platform.OS === 'web' ? 'web' : 'native',
      audience: storeFacing ? 'store' : 'dev',
      remote:
        pushRemote === 'synced' ||
        pushRemote === 'error' ||
        pushRemote === 'demo' ||
        pushRemote === 'unconfigured' ||
        pushRemote === 'pending'
          ? pushRemote
          : undefined,
    });

  async function onEnableAlerts() {
    setPushBusy(true);
    try {
      const result = await enableDeviceAlerts();
      setPushNote(result.permission === 'granted' ? null : result.message);
    } catch {
      setPushNote('Couldn’t enable device alerts. In-app notifications still work.');
    } finally {
      setPushBusy(false);
    }
  }

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.cover}>
          <View style={styles.stripe} />
        </View>
        <View style={styles.identity}>
          <Avatar initials={currentUser.initials} color={currentUser.avatarColor} size={72} />
          <Text style={styles.name}>{currentUser.name}</Text>
          <Text style={styles.handle}>@{currentUser.handle}</Text>
          {currentUser.email ? <Text style={styles.email}>{currentUser.email}</Text> : null}
          <View style={styles.modePill}>
            <Text style={styles.modePillText}>
              {authMode === 'supabase' ? 'SIGNED IN' : 'DEMO MODE'}
            </Text>
          </View>
          <Text style={styles.bio}>{currentUser.bio}</Text>
          <View style={styles.stats}>
            <View style={styles.stat}>
              <Text style={styles.statN}>{mine.length}</Text>
              <Text style={styles.statL}>Posts</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statN}>{followingIds.length}</Text>
              <Text style={styles.statL}>Following</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statN}>{followerCount(currentUser.id)}</Text>
              <Text style={styles.statL}>Followers</Text>
            </View>
          </View>
          <View style={styles.crestRow}>
            {teams.map((t) =>
              t ? (
                <Pressable key={t.id} onPress={() => router.push(entityHref('team', t.id))}>
                  <Crest team={t} size={32} />
                </Pressable>
              ) : null,
            )}
          </View>
          {players.length > 0 ? (
            <View style={styles.playerRow}>
              {players.map((p) =>
                p ? (
                  <Pressable key={p.id} onPress={() => router.push(entityHref('player', p.id))} style={styles.playerChip}>
                    <Text style={styles.playerNum}>{p.number}</Text>
                    <Text style={styles.playerName}>{p.shortName}</Text>
                  </Pressable>
                ) : null,
              )}
            </View>
          ) : null}
          <View style={styles.actions}>
            <Pressable style={styles.btn} onPress={() => router.push('/messages')}>
              <Text style={styles.btnText}>Messages</Text>
            </Pressable>
            <Pressable style={styles.btn} onPress={() => router.push('/edit-profile')}>
              <Text style={styles.btnText}>Edit profile</Text>
            </Pressable>
            <Pressable style={styles.btn} onPress={() => router.push('/pick-favorites')}>
              <Text style={styles.btnText}>Favorites</Text>
            </Pressable>
            <Pressable style={styles.btn} onPress={() => router.push('/leaderboard')}>
              <Text style={styles.btnText}>Leaderboard</Text>
            </Pressable>
            <Pressable
              style={styles.btn}
              onPress={() => router.push('/about')}
              accessibilityRole="link"
              accessibilityLabel="About, privacy, and support"
            >
              <Text style={styles.btnText}>About</Text>
            </Pressable>
          </View>
          <Text style={styles.legalNote}>{FAN_PICKS_NOT_GAMBLING}</Text>
          {tvCountry ? (
            <Pressable style={styles.tvRow} onPress={() => router.push('/tv')}>
              <Text style={styles.tvLabel}>
                TV · {tvCountry.flag} {tvCountry.name}
              </Text>
              <Text style={styles.tvLink}>Schedule →</Text>
            </Pressable>
          ) : null}
        </View>
        <Text style={styles.section}>Your posts</Text>
        {mine.length === 0 ? (
          <Text style={styles.muted}>You haven’t posted yet. Tap compose on Home.</Text>
        ) : (
          mine.map((post) => {
            const author = users.find((u) => u.id === post.authorId) ?? currentUser;
            return (
              <PostCard
                key={post.id}
                post={post}
                author={author}
                liked={likedPostIds.includes(post.id)}
                onLike={() => toggleLike(post.id)}
              />
            );
          })
        )}
        <Text style={styles.section}>Blocked fans</Text>
        {blockedPeople.length === 0 ? (
          <EmptyState compact title={BLOCKED_LIST_EMPTY_TITLE} body={BLOCKED_LIST_EMPTY_BODY} />
        ) : (
          blockedPeople.map((u) => (
            <Pressable key={u.id} onPress={() => router.push(entityHref('user', u.id))} style={styles.blockedRow}>
              <Avatar initials={u.initials} color={u.avatarColor} size={36} />
              <View style={{ flex: 1 }}>
                <Text style={styles.blockedName}>{u.name}</Text>
                <Text style={styles.blockedHandle}>@{u.handle}</Text>
              </View>
              <Pressable
                onPress={() => unblockUser(u.id)}
                accessibilityRole="button"
                accessibilityLabel={`Unblock ${u.name}`}
                style={styles.unblock}
              >
                <Text style={styles.unblockText}>Unblock</Text>
              </Pressable>
            </Pressable>
          ))
        )}
        <Text style={styles.demoNote}>{honesty}</Text>
        <Pressable style={styles.switcher} onPress={signOut}>
          <Text style={styles.switcherText}>
            {authMode === 'supabase' ? 'Sign out' : supabaseConfigured ? 'Switch account' : 'Switch demo user'}
          </Text>
        </Pressable>
        <SafeBoundary title={ALERTS_UNAVAILABLE_TITLE} body={ALERTS_UNAVAILABLE_BODY}>
        <View style={styles.alerts}>
          <Text style={styles.alertsKicker}>MATCH ALERTS</Text>
          <Text style={styles.alertsTitle}>Kickoff soon and goals</Text>
          <Text style={styles.alertsBody}>{matchAlertsIntro(storeFacing)}</Text>
          {pushPrefs.enabled ? (
            <>
              <Pressable
                style={styles.toggle}
                onPress={() => setPushPref({ kickoff: !pushPrefs.kickoff })}
                accessibilityRole="switch"
                accessibilityState={{ checked: pushPrefs.kickoff }}
              >
                <Text style={styles.toggleLabel}>Kickoff soon</Text>
                <Text style={[styles.toggleValue, pushPrefs.kickoff && styles.toggleOn]}>
                  {pushPrefs.kickoff ? 'On' : 'Off'}
                </Text>
              </Pressable>
              <Pressable
                style={styles.toggle}
                onPress={() => setPushPref({ goals: !pushPrefs.goals })}
                accessibilityRole="switch"
                accessibilityState={{ checked: pushPrefs.goals }}
              >
                <Text style={styles.toggleLabel}>Goals</Text>
                <Text style={[styles.toggleValue, pushPrefs.goals && styles.toggleOn]}>
                  {pushPrefs.goals ? 'On' : 'Off'}
                </Text>
              </Pressable>
              {demo ? (
                <Pressable
                  style={styles.alertsAction}
                  onPress={() => void scheduleDemoNotification('KickFeed test', 'If you see this, device alerts work.')}
                  accessibilityRole="button"
                  accessibilityLabel="Send a test alert"
                >
                  <Text style={styles.switcherText}>Send a test alert</Text>
                </Pressable>
              ) : null}
              {demo && authMode === 'supabase' && pushToken ? (
                <Pressable
                  style={styles.alertsAction}
                  disabled={remoteBusy}
                  onPress={() => {
                    setRemoteBusy(true);
                    void sendRemotePushTest()
                      .then((message) => setPushNote(message))
                      .catch(() => setPushNote('Remote test didn’t send. In-app notifications still work.'))
                      .finally(() => setRemoteBusy(false));
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Send a remote test"
                >
                  <Text style={styles.switcherText}>{remoteBusy ? 'Sending…' : 'Send a remote test'}</Text>
                </Pressable>
              ) : null}
              <Pressable
                style={styles.alertsAction}
                onPress={() => setPushPref({ enabled: false })}
                accessibilityRole="button"
                accessibilityLabel="Turn off device alerts"
              >
                <Text style={styles.switcherText}>Turn off device alerts</Text>
              </Pressable>
            </>
          ) : (
            <Pressable
              style={styles.alertsAction}
              onPress={onEnableAlerts}
              disabled={pushBusy}
              accessibilityRole="button"
              accessibilityLabel="Enable device match alerts"
            >
              <Text style={styles.switcherText}>{pushBusy ? 'Checking…' : 'Enable device match alerts'}</Text>
            </Pressable>
          )}
          <Text style={styles.demoNote}>{pushHint}</Text>
        </View>
        </SafeBoundary>
        <Text style={styles.demoNote}>
          {profileAccountNote({ authMode, supabaseConfigured, storeFacing })}
        </Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: 48 },
  cover: {
    height: 96,
    marginHorizontal: -spacing.lg,
    backgroundColor: colors.pitch,
    overflow: 'hidden',
    alignSelf: 'stretch',
  },
  stripe: {
    position: 'absolute',
    right: -20,
    top: 20,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: colors.lime,
    opacity: 0.25,
  },
  identity: { alignItems: 'center', marginTop: -36, marginBottom: spacing.lg },
  name: { ...type.title, color: colors.text, marginTop: spacing.sm },
  handle: { ...type.caption, color: colors.limeMuted, marginTop: 2 },
  email: { ...type.caption, color: colors.textMuted, marginTop: 4, fontWeight: '500' },
  modePill: {
    marginTop: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  modePillText: { ...type.micro, color: colors.limeMuted },
  bio: { ...type.body, color: colors.textMuted, textAlign: 'center', marginTop: spacing.sm, lineHeight: 22 },
  stats: { flexDirection: 'row', gap: 28, marginTop: spacing.lg },
  stat: { alignItems: 'center' },
  statN: { ...type.subtitle, color: colors.text },
  statL: { ...type.micro, color: colors.textDim },
  crestRow: { flexDirection: 'row', gap: 8, marginTop: spacing.md },
  playerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: spacing.sm, justifyContent: 'center' },
  playerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surface,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  playerNum: { ...type.caption, color: colors.lime, fontSize: 11 },
  playerName: { ...type.caption, color: colors.text },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: spacing.lg },
  btn: {
    backgroundColor: colors.surface,
    borderRadius: radius.full,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  btnText: { ...type.caption, color: colors.text },
  tvRow: {
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surface,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  tvLabel: { ...type.caption, color: colors.text },
  tvLink: { ...type.caption, color: colors.lime },
  section: { ...type.micro, color: colors.textMuted, marginBottom: spacing.sm, marginTop: spacing.lg },
  muted: { ...type.body, color: colors.textMuted, marginBottom: spacing.lg },
  blockedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  blockedName: { ...type.subtitle, fontSize: 15, color: colors.text },
  blockedHandle: { ...type.caption, color: colors.textMuted, fontWeight: '500' },
  unblock: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 44,
    justifyContent: 'center',
  },
  unblockText: { ...type.caption, color: colors.lime },
  switcher: {
    marginTop: spacing.xl,
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  switcherText: { ...type.caption, color: colors.lime },
  alerts: {
    marginTop: spacing.xl,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  alertsKicker: { ...type.micro, color: colors.limeMuted },
  alertsTitle: { ...type.subtitle, color: colors.text, marginTop: 4 },
  alertsBody: { ...type.caption, color: colors.textMuted, fontWeight: '500', marginTop: 6, lineHeight: 18 },
  toggle: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    paddingHorizontal: 4,
  },
  toggleLabel: { ...type.caption, color: colors.text },
  toggleValue: { ...type.caption, color: colors.textDim },
  toggleOn: { color: colors.lime },
  alertsAction: {
    marginTop: spacing.sm,
    alignItems: 'center',
    paddingVertical: spacing.md,
    minHeight: 44,
  },
  legalNote: {
    ...type.caption,
    color: colors.textDim,
    textAlign: 'center',
    marginTop: spacing.md,
    fontWeight: '500',
    lineHeight: 18,
  },
  demoNote: { ...type.caption, color: colors.textDim, textAlign: 'center', marginTop: spacing.sm, fontWeight: '500' },
});

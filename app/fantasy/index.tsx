import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { EmptyState } from '@/components/ui/EmptyState';
import { HeaderBar } from '@/components/ui/HeaderBar';
import { Screen } from '@/components/ui/Screen';
import { gameweekContaining, gameweekLabel, leaguesForUser, memberCount } from '@/lib/fantasy';
import {
  FANTASY_GW_WINDOW_COPY,
  FANTASY_LIVE_ERROR_BODY,
  FANTASY_LIVE_ERROR_TITLE,
  FANTASY_LOCK_RULES,
  FANTASY_NOT_GAMBLING,
  FANTASY_SCORING_RULES,
  fantasyDisclaimer,
  fantasyErrorMessage,
} from '@/lib/honesty';
import { safeBack } from '@/lib/navBack';
import { useFantasy } from '@/lib/useFantasy';
import { colors, radius, spacing, type } from '@/theme';

export default function FantasyHomeScreen() {
  const fantasy = useFantasy();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const gw = gameweekContaining(new Date());
  const leagues = fantasy.userId && fantasy.snapshot ? leaguesForUser(fantasy.snapshot, fantasy.userId) : [];

  async function onCreate() {
    setBusy(true);
    setNote(null);
    const result = await fantasy.createLeague(name);
    setBusy(false);
    if (!result.ok) {
      setNote(fantasyErrorMessage(result.error));
      return;
    }
    setName('');
    router.push(`/fantasy/${result.leagueId}`);
  }

  async function onJoin() {
    setBusy(true);
    setNote(null);
    const result = await fantasy.joinLeague(code);
    setBusy(false);
    if (!result.ok) {
      setNote(fantasyErrorMessage(result.error));
      return;
    }
    setCode('');
    router.push(`/fantasy/${result.leagueId}`);
  }

  return (
    <Screen padded={false}>
      <View style={styles.pad}>
        <HeaderBar title="Fantasy" onBack={() => safeBack('/')} />
      </View>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.kicker}>{gameweekLabel(gw.id)}</Text>
        <Text style={styles.honesty}>{FANTASY_NOT_GAMBLING}</Text>
        <Text style={styles.rules}>{FANTASY_SCORING_RULES}</Text>
        <Text style={styles.rules}>{FANTASY_LOCK_RULES}</Text>
        <Text style={styles.rules}>{FANTASY_GW_WINDOW_COPY}</Text>
        <Text style={styles.rules}>{fantasyDisclaimer(fantasy.live)}</Text>

        {fantasy.loading ? <Text style={styles.rules}>Loading mini-leagues…</Text> : null}
        {fantasy.error ? (
          <EmptyState
            compact
            title={FANTASY_LIVE_ERROR_TITLE}
            body={FANTASY_LIVE_ERROR_BODY}
            actionLabel="Retry"
            onAction={() => void fantasy.refresh()}
          />
        ) : null}

        <Text style={styles.section}>Your leagues</Text>
        {fantasy.loading ? null : leagues.length === 0 ? (
          <EmptyState
            compact
            title="No mini-league yet"
            body={
              fantasy.live
                ? 'Create a private league and share the invite code, or join with a friend’s code.'
                : 'Create one and share the invite code, or join Friday XI with NEON11.'
            }
          />
        ) : (
          leagues.map((league) => (
            <Pressable
              key={league.id}
              onPress={() => router.push(`/fantasy/${league.id}`)}
              style={styles.card}
              accessibilityRole="button"
              accessibilityLabel={`${league.name}, code ${league.inviteCode}`}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{league.name}</Text>
                <Text style={styles.cardMeta}>
                  {fantasy.snapshot ? memberCount(fantasy.snapshot, league.id) : 0} fans · {league.inviteCode}
                </Text>
              </View>
              <Text style={styles.link}>Open</Text>
            </Pressable>
          ))
        )}

        <Text style={styles.section}>Create</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="League name"
          placeholderTextColor={colors.textDim}
          style={styles.input}
          accessibilityLabel="League name"
          maxLength={40}
        />
        <Pressable
          onPress={() => void onCreate()}
          disabled={busy || fantasy.loading || !fantasy.snapshot}
          style={styles.primary}
          accessibilityRole="button"
          accessibilityLabel="Create mini-league"
        >
          <Text style={styles.primaryText}>{busy ? 'Working…' : 'Create mini-league'}</Text>
        </Pressable>

        <Text style={styles.section}>Join</Text>
        <TextInput
          value={code}
          onChangeText={setCode}
          placeholder="Invite code"
          placeholderTextColor={colors.textDim}
          style={styles.input}
          autoCapitalize="characters"
          accessibilityLabel="Invite code"
          maxLength={12}
        />
        <Pressable
          onPress={() => void onJoin()}
          disabled={busy || fantasy.loading || !fantasy.snapshot}
          style={styles.secondary}
          accessibilityRole="button"
          accessibilityLabel="Join with invite code"
        >
          <Text style={styles.secondaryText}>Join with code</Text>
        </Pressable>
        {note ? <Text style={styles.note}>{note}</Text> : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: spacing.lg },
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: 48, gap: spacing.sm },
  kicker: { ...type.badge, color: colors.accent },
  honesty: { ...type.body, color: colors.text, lineHeight: 22 },
  rules: { ...type.caption, color: colors.textMuted, lineHeight: 18 },
  section: { ...type.badge, color: colors.textMuted, marginTop: spacing.md },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  cardTitle: { ...type.subtitle, color: colors.text },
  cardMeta: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  link: { ...type.caption, color: colors.accent },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    ...type.body,
  },
  primary: {
    backgroundColor: colors.accent,
    borderRadius: radius.full,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { ...type.caption, color: colors.onCta, fontWeight: '800' },
  secondary: {
    borderRadius: radius.full,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
  },
  secondaryText: { ...type.caption, color: colors.text },
  note: { ...type.caption, color: colors.danger },
});

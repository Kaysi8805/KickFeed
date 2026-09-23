import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { EmptyState } from '@/components/ui/EmptyState';
import { HeaderBar } from '@/components/ui/HeaderBar';
import { Screen } from '@/components/ui/Screen';
import { LIVE_LEAGUE_META } from '@/lib/footballCoverage';
import { competitionLabel, leaguesForUser, memberCount, seasonLabel } from '@/lib/fantasy';
import {
  FANTASY_LIVE_ERROR_BODY,
  FANTASY_LIVE_ERROR_TITLE,
  FANTASY_LOCK_RULES,
  FANTASY_NOT_GAMBLING,
  FANTASY_SCORING_RULES,
  FANTASY_SIGN_IN_COPY,
  fantasyDisclaimer,
  fantasyErrorMessage,
} from '@/lib/honesty';
import { safeBack } from '@/lib/navBack';
import { useFantasy } from '@/lib/useFantasy';
import { europeanSeasonYear } from '@/services/footballApi';
import { colors, radius, spacing, type } from '@/theme';

export default function FantasyHomeScreen() {
  const fantasy = useFantasy();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [competitionId, setCompetitionId] = useState<string>(LIVE_LEAGUE_META[0].id);
  const currentSeason = europeanSeasonYear();
  const [season, setSeason] = useState(currentSeason);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const leagues = fantasy.userId && fantasy.snapshot ? leaguesForUser(fantasy.snapshot, fantasy.userId) : [];

  async function onCreate() {
    setBusy(true);
    setNote(null);
    const result = await fantasy.createLeague(name, competitionId, season);
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
        <HeaderBar title="Fantasy" onBack={() => safeBack('/profile')} />
      </View>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.honesty}>{FANTASY_NOT_GAMBLING}</Text>
        <Text style={styles.rules}>{FANTASY_SCORING_RULES}</Text>
        <Text style={styles.rules}>{FANTASY_LOCK_RULES}</Text>
        <Text style={styles.rules}>{fantasyDisclaimer(fantasy.signedIn)}</Text>

        {!fantasy.signedIn ? (
          <EmptyState title="Sign in to play" body={FANTASY_SIGN_IN_COPY} />
        ) : (
          <>
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
                body="Create one for a single competition, then share the invite code."
              />
            ) : (
              leagues.map((league) => (
                <Pressable
                  key={league.id}
                  onPress={() => router.push(`/fantasy/${league.id}`)}
                  style={styles.card}
                  accessibilityRole="button"
                  accessibilityLabel={`${league.name}, ${competitionLabel(league.competitionId)}`}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>{league.name}</Text>
                    <Text style={styles.cardMeta}>
                      {competitionLabel(league.competitionId)} {seasonLabel(league.season)} ·{' '}
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
            <View style={styles.chips}>
              {LIVE_LEAGUE_META.map((league) => (
                <Pressable
                  key={league.id}
                  onPress={() => setCompetitionId(league.id)}
                  style={[styles.chip, competitionId === league.id && styles.chipOn]}
                  accessibilityRole="button"
                  accessibilityLabel={league.name}
                >
                  <Text style={styles.chipText}>{league.name}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.chips}>
              {[currentSeason, currentSeason - 1].map((year) => (
                <Pressable
                  key={year}
                  onPress={() => setSeason(year)}
                  style={[styles.chip, season === year && styles.chipOn]}
                  accessibilityRole="button"
                  accessibilityLabel={seasonLabel(year)}
                >
                  <Text style={styles.chipText}>{seasonLabel(year)}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable
              onPress={() => void onCreate()}
              disabled={busy || fantasy.loading}
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
              disabled={busy || fantasy.loading}
              style={styles.secondary}
              accessibilityRole="button"
              accessibilityLabel="Join with invite code"
            >
              <Text style={styles.secondaryText}>Join with code</Text>
            </Pressable>
            {note ? <Text style={styles.note}>{note}</Text> : null}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: spacing.lg },
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: 48, gap: spacing.sm },
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
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipOn: { borderColor: colors.accent },
  chipText: { ...type.caption, color: colors.text },
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

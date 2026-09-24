import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { SafetyMenu } from '@/components/moderation/SafetyMenu';
import { Crest } from '@/components/ui/Crest';
import { EmptyState } from '@/components/ui/EmptyState';
import { HeaderBar } from '@/components/ui/HeaderBar';
import { Screen } from '@/components/ui/Screen';
import type { Fixture } from '@/data/types';
import { relatedFixtureIds } from '@/lib/matchSocial';
import { safeBack } from '@/lib/navBack';
import {
  RIVALRY_BANTER_MAX,
  RIVALRY_NOT_GAMBLING,
  ledgerPointsForViewer,
  peerOnBond,
  rivalryErrorMessage,
  rivalryMatchFacts,
  scoreboardFor,
  teamFromClub,
} from '@/lib/rivalry';
import { routeId } from '@/lib/routeParams';
import { useFootballCatalog } from '@/lib/useFootballCatalog';
import { useRivalry } from '@/lib/useRivalry';
import { userFromProfile } from '@/lib/userIdentity';
import { useApp } from '@/services/AppProvider';
import { football } from '@/services/football';
import { colors, radius, spacing, type } from '@/theme';

export default function RivalryBondScreen() {
  const catalog = useFootballCatalog();
  const { bondId: rawId } = useLocalSearchParams<{ bondId: string | string[] }>();
  const bondId = routeId(rawId);
  const { users, predictions } = useApp();
  const rivalry = useRivalry();
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);

  const bond = rivalry.book.bonds.find((row) => row.id === bondId);
  const board = bond && rivalry.userId ? scoreboardFor(bond, rivalry.userId) : null;
  const peerId = bond && rivalry.userId ? peerOnBond(bond, rivalry.userId) : null;
  const peer = peerId ? (users.find((user) => user.id === peerId) ?? userFromProfile(peerId, undefined)) : null;
  const ledger = bondId ? rivalry.ledgerFor(bondId) : [];
  const incoming = bond?.status === 'invite' && bond.invitedBy !== rivalry.userId;

  const facts = useMemo(
    () =>
      rivalryMatchFacts(
        football.getFixtures() as Fixture[],
        (id) => relatedFixtureIds(football, id),
        (id) => football.relatedIds('team', id),
      ),
    [catalog.lastSyncedAt, catalog.loading],
  );

  useEffect(() => {
    if (!bond || bond.status !== 'active' || !rivalry.ready) return;
    let cancelled = false;
    void rivalry.sync(bond.id, facts, predictions).then((result) => {
      if (cancelled || result.ok) return;
      setNote(rivalryErrorMessage(result.error));
    });
    return () => {
      cancelled = true;
    };
    // Sync once when this bond opens and when the catalog refreshes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bond?.id, bond?.status, rivalry.ready, catalog.lastSyncedAt]);

  async function onSync() {
    if (!bond) return;
    setBusy(true);
    setNote(null);
    const result = await rivalry.sync(bond.id, facts, predictions);
    setBusy(false);
    if (!result.ok) setNote(rivalryErrorMessage(result.error));
  }

  async function onRespond(accept: boolean) {
    if (!bond) return;
    setBusy(true);
    setNote(null);
    const result = await rivalry.respond(bond.id, accept);
    setBusy(false);
    if (!result.ok) setNote(rivalryErrorMessage(result.error));
    if (result.ok && !accept) router.back();
  }

  async function onBanter() {
    if (!bond) return;
    setBusy(true);
    setNote(null);
    const result = await rivalry.postBanter(bond.id, body);
    setBusy(false);
    if (!result.ok) {
      setNote(rivalryErrorMessage(result.error));
      return;
    }
    setBody('');
  }

  async function onEnd() {
    if (!bond) return;
    if (!confirmEnd) {
      setConfirmEnd(true);
      return;
    }
    setBusy(true);
    const result = await rivalry.endBond(bond.id);
    setBusy(false);
    if (!result.ok) {
      setNote(rivalryErrorMessage(result.error));
      return;
    }
    router.back();
  }

  if (!bondId || (rivalry.ready && !bond)) {
    return (
      <Screen>
        <HeaderBar title="Rivalry" onBack={() => safeBack('/rivalry')} />
        <EmptyState title="Bond missing" body="This rivalry isn’t on this account." />
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
      <View style={styles.pad}>
        <HeaderBar title={peer?.name ?? 'Rivalry'} onBack={() => safeBack('/rivalry')} />
      </View>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.rules}>{RIVALRY_NOT_GAMBLING}</Text>
        {board && bond ? (
          <View style={styles.board}>
            <Side clubName={board.left.club.name} points={board.left.points} label={board.left.you ? 'You' : peer?.name ?? 'Friend'} team={board.left.club} />
            <Text style={styles.dash}>–</Text>
            <Side clubName={board.right.club.name} points={board.right.points} label={board.right.you ? 'You' : peer?.name ?? 'Friend'} team={board.right.club} align="right" />
          </View>
        ) : (
          <Text style={styles.rules}>Loading bond…</Text>
        )}
        {bond ? (
          <Text style={styles.meta}>
            {bond.season} · {bond.status === 'active' ? 'Active' : bond.status === 'invite' ? 'Invite' : 'Ended'}
          </Text>
        ) : null}

        {incoming && bond ? (
          <View style={styles.actions}>
            <Pressable
              onPress={() => void onRespond(true)}
              disabled={busy}
              style={styles.primary}
              accessibilityRole="button"
              accessibilityLabel="Accept rivalry"
            >
              <Text style={styles.primaryText}>Accept</Text>
            </Pressable>
            <Pressable
              onPress={() => void onRespond(false)}
              disabled={busy}
              style={styles.secondary}
              accessibilityRole="button"
              accessibilityLabel="Decline rivalry"
            >
              <Text style={styles.secondaryText}>Decline</Text>
            </Pressable>
          </View>
        ) : null}
        {bond?.status === 'invite' && !incoming ? (
          <Pressable
            onPress={() => void onRespond(false)}
            disabled={busy}
            style={styles.secondary}
            accessibilityRole="button"
            accessibilityLabel="Withdraw invite"
          >
            <Text style={styles.secondaryText}>Withdraw invite</Text>
          </Pressable>
        ) : null}

        {bond?.status === 'active' ? (
          <Pressable
            onPress={() => void onSync()}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Update scores"
          >
            <Text style={styles.link}>Update scores</Text>
          </Pressable>
        ) : null}
        <Text style={styles.section}>Ledger</Text>
        {ledger.length === 0 ? (
          <Text style={styles.rules}>No results yet. Scores land after a full-time head-to-head or a shared prediction.</Text>
        ) : (
          ledger.map((entry) => {
            const split = bond && rivalry.userId ? ledgerPointsForViewer(entry, bond, rivalry.userId) : null;
            const mine = entry.authorId && entry.authorId === rivalry.userId;
            return (
              <View key={entry.id} style={styles.entry}>
                <View style={styles.entryHead}>
                  <Text style={styles.kind}>{kindLabel(entry.kind)}</Text>
                  {split && (split.you > 0 || split.them > 0) ? (
                    <Text style={styles.points}>
                      {split.you}–{split.them}
                    </Text>
                  ) : null}
                  {entry.kind === 'banter' && entry.authorId && !mine ? (
                    <SafetyMenu
                      compact
                      targetType="rivalry"
                      targetId={entry.id}
                      targetUserId={entry.authorId}
                      targetName={peer?.name}
                    />
                  ) : null}
                </View>
                <Text style={styles.body}>{entry.body}</Text>
              </View>
            );
          })
        )}

        {bond?.status === 'active' ? (
          <>
            <Text style={styles.section}>Banter</Text>
            <TextInput
              value={body}
              onChangeText={setBody}
              placeholder="Short text, no stakes"
              placeholderTextColor={colors.textDim}
              style={styles.input}
              maxLength={RIVALRY_BANTER_MAX}
              accessibilityLabel="Banter"
            />
            <Pressable
              onPress={() => void onBanter()}
              disabled={busy || body.trim().length === 0}
              style={styles.primary}
              accessibilityRole="button"
              accessibilityLabel="Post banter"
            >
              <Text style={styles.primaryText}>Post</Text>
            </Pressable>
            <Pressable
              onPress={() => void onEnd()}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={confirmEnd ? 'Confirm end bond' : 'End bond'}
            >
              <Text style={styles.end}>{confirmEnd ? 'Tap again to end this bond' : 'End this bond'}</Text>
            </Pressable>
          </>
        ) : null}
        {note ? <Text style={styles.note}>{note}</Text> : null}
      </ScrollView>
    </Screen>
  );
}

function Side({
  clubName,
  points,
  label,
  team,
  align = 'left',
}: {
  clubName: string;
  points: number;
  label: string;
  team: Parameters<typeof teamFromClub>[0];
  align?: 'left' | 'right';
}) {
  return (
    <View style={[styles.side, align === 'right' && styles.sideRight]}>
      <Crest team={teamFromClub(team)} size={40} />
      <Text style={styles.score}>{points}</Text>
      <Text style={styles.club} numberOfLines={1}>
        {clubName}
      </Text>
      <Text style={styles.who} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function kindLabel(kind: string): string {
  if (kind === 'real_h2h') return 'Head-to-head';
  if (kind === 'prediction') return 'Prediction';
  if (kind === 'banter') return 'Banter';
  return 'Bond';
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: spacing.lg },
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: 48, gap: spacing.sm },
  rules: { ...type.caption, color: colors.textMuted, lineHeight: 18 },
  board: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  side: { flex: 1, alignItems: 'flex-start', gap: 2 },
  sideRight: { alignItems: 'flex-end' },
  score: { ...type.displayScore, color: colors.text },
  dash: { ...type.title, color: colors.textMuted },
  club: { ...type.caption, color: colors.text },
  who: { ...type.caption, color: colors.textMuted },
  meta: { ...type.badge, color: colors.textMuted },
  section: { ...type.badge, color: colors.textMuted, marginTop: spacing.md },
  entry: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 4,
  },
  entryHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  kind: { ...type.badge, color: colors.textMuted, flex: 1 },
  points: { ...type.caption, color: colors.accent, fontWeight: '800' },
  body: { ...type.body, color: colors.text, lineHeight: 22 },
  actions: { flexDirection: 'row', gap: spacing.sm },
  primary: {
    backgroundColor: colors.accent,
    borderRadius: radius.full,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    flexGrow: 1,
  },
  primaryText: { ...type.caption, color: colors.onCta, fontWeight: '800' },
  secondary: {
    borderRadius: radius.full,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
    flexGrow: 1,
  },
  secondaryText: { ...type.caption, color: colors.text },
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
  link: { ...type.caption, color: colors.accent, fontWeight: '800' },
  end: { ...type.caption, color: colors.danger, textAlign: 'center', paddingVertical: spacing.sm },
  note: { ...type.caption, color: colors.danger },
});

import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Crest } from '@/components/ui/Crest';
import { EmptyState } from '@/components/ui/EmptyState';
import { HeaderBar } from '@/components/ui/HeaderBar';
import { Screen } from '@/components/ui/Screen';
import { routeId } from '@/lib/routeParams';
import {
  RIVALRY_NOT_GAMBLING,
  RIVALRY_RULES,
  peerOnBond,
  rivalryDisclaimer,
  rivalryErrorMessage,
  scoreboardFor,
  teamFromClub,
} from '@/lib/rivalry';
import { safeBack } from '@/lib/navBack';
import { useFootballCatalog } from '@/lib/useFootballCatalog';
import { useRivalry } from '@/lib/useRivalry';
import { userFromProfile } from '@/lib/userIdentity';
import { useApp } from '@/services/AppProvider';
import { football } from '@/services/football';
import { colors, radius, spacing, type } from '@/theme';

export default function RivalryListScreen() {
  const catalog = useFootballCatalog();
  const { peer: rawPeer } = useLocalSearchParams<{ peer?: string | string[] }>();
  const peerHint = routeId(rawPeer);
  const { users, favoriteTeamIds } = useApp();
  const rivalry = useRivalry();
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const favorites = favoriteTeamIds.map((id) => football.getTeam(id)).filter((team) => team != null);
  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle.length < 2) return [];
    return football
      .getTeams()
      .filter((team) =>
        team.name.toLowerCase().includes(needle) ||
        team.shortName.toLowerCase().includes(needle) ||
        team.code.toLowerCase().includes(needle),
      )
      .slice(0, 8);
  }, [catalog.lastSyncedAt, query]);

  const nameOf = (id: string) => users.find((user) => user.id === id)?.name ?? userFromProfile(id, undefined).name;

  async function onDeclare(teamId: string) {
    const team = football.getTeam(teamId);
    if (!team) return;
    setBusy(true);
    setNote(null);
    const result = await rivalry.declareClub(team);
    setBusy(false);
    if (!result.ok) {
      setNote(rivalryErrorMessage(result.error));
      return;
    }
    setQuery('');
  }

  async function onInvite(peerId: string) {
    setBusy(true);
    setNote(null);
    const result = await rivalry.invite(peerId);
    setBusy(false);
    if (!result.ok) {
      setNote(rivalryErrorMessage(result.error));
      return;
    }
    if (result.bondId) router.push(`/rivalry/${result.bondId}`);
  }

  return (
    <Screen padded={false}>
      <View style={styles.pad}>
        <HeaderBar title="Rivalry" onBack={() => safeBack('/profile')} />
      </View>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.honesty}>{RIVALRY_NOT_GAMBLING}</Text>
        <Text style={styles.rules}>{RIVALRY_RULES}</Text>
        <Text style={styles.rules}>{rivalryDisclaimer(rivalry.live)}</Text>
        <Text style={styles.rules}>Season {rivalry.season}</Text>

        <Text style={styles.section}>Your club</Text>
        {rivalry.club ? (
          <View style={styles.clubRow}>
            <Crest team={teamFromClub(rivalry.club)} size={36} />
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{rivalry.club.name}</Text>
              <Text style={styles.cardMeta}>One club for this account. An open bond keeps the clubs it locked.</Text>
            </View>
          </View>
        ) : (
          <Text style={styles.rules}>Declare one club. Your friend needs a different one.</Text>
        )}
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search clubs"
          placeholderTextColor={colors.textDim}
          style={styles.input}
          autoCapitalize="words"
          accessibilityLabel="Search clubs"
        />
        {query.trim().length < 2 ? (
          <View style={styles.chips}>
            {favorites.map((team) =>
              team ? (
                <Pressable
                  key={team.id}
                  onPress={() => void onDeclare(team.id)}
                  disabled={busy}
                  style={[styles.chip, rivalry.club?.clubId === team.id && styles.chipOn]}
                  accessibilityRole="button"
                  accessibilityLabel={`Declare ${team.name}`}
                >
                  <Crest team={team} size={22} />
                  <Text style={styles.chipText}>{team.shortName}</Text>
                </Pressable>
              ) : null,
            )}
          </View>
        ) : (
          results.map((team) => (
            <Pressable
              key={team.id}
              onPress={() => void onDeclare(team.id)}
              disabled={busy}
              style={styles.card}
              accessibilityRole="button"
              accessibilityLabel={`Declare ${team.name}`}
            >
              <Crest team={team} size={28} />
              <Text style={styles.cardTitle}>{team.name}</Text>
            </Pressable>
          ))
        )}

        <Text style={styles.section}>Bonds</Text>
        {!rivalry.ready ? <Text style={styles.rules}>Loading bonds…</Text> : null}
        {rivalry.ready && rivalry.bonds.length === 0 ? (
          <EmptyState
            compact
            title="No rivalry yet"
            body="Invite a friend who follows you back. You each lock a different club for the season."
          />
        ) : (
          rivalry.bonds.map((bond) => {
            const board = rivalry.userId ? scoreboardFor(bond, rivalry.userId) : null;
            const peerId = rivalry.userId ? peerOnBond(bond, rivalry.userId) : null;
            const peer = peerId ? nameOf(peerId) : 'Friend';
            const waiting = bond.status === 'invite';
            const incoming = waiting && bond.invitedBy !== rivalry.userId;
            return (
              <Pressable
                key={bond.id}
                onPress={() => router.push(`/rivalry/${bond.id}`)}
                style={styles.card}
                accessibilityRole="button"
                accessibilityLabel={`${peer}, ${bond.pointsA} to ${bond.pointsB}`}
              >
                {board ? <Crest team={teamFromClub(board.right.club)} size={32} /> : null}
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{peer}</Text>
                  <Text style={styles.cardMeta}>
                    {waiting
                      ? incoming
                        ? 'Invite waiting for you'
                        : 'Invite sent'
                      : `${board?.left.points ?? 0}–${board?.right.points ?? 0} · ${bond.season}`}
                  </Text>
                </View>
                <Text style={styles.link}>Open</Text>
              </Pressable>
            );
          })
        )}

        <Text style={styles.section}>Invite</Text>
        <Text style={styles.rules}>
          {rivalry.live
            ? 'People you follow. They need to follow you back, and both of you need a club.'
            : 'Mutual friends on this device.'}
        </Text>
        {peerHint && !rivalry.candidates.includes(peerHint) ? (
          <Text style={styles.note}>Follow each other before starting a bond.</Text>
        ) : null}
        {rivalry.candidates.length === 0 ? (
          <Text style={styles.rules}>No one to invite yet.</Text>
        ) : (
          rivalry.candidates.map((id) => {
            const existing = rivalry.bonds.find((bond) => bond.userA === id || bond.userB === id);
            return (
              <Pressable
                key={id}
                onPress={() => (existing ? router.push(`/rivalry/${existing.id}`) : void onInvite(id))}
                disabled={busy}
                style={[styles.card, peerHint === id && styles.chipOn]}
                accessibilityRole="button"
                accessibilityLabel={existing ? `Open bond with ${nameOf(id)}` : `Invite ${nameOf(id)}`}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{nameOf(id)}</Text>
                  <Text style={styles.cardMeta}>{existing ? 'Bond already open' : rivalry.season}</Text>
                </View>
                <Text style={styles.link}>{existing ? 'Open' : 'Invite'}</Text>
              </Pressable>
            );
          })
        )}
        {note ? <Text style={styles.note}>{note}</Text> : null}
        {rivalry.error ? <Text style={styles.note}>{rivalryErrorMessage(rivalry.error)}</Text> : null}
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
  clubRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
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
  link: { ...type.caption, color: colors.accent, fontWeight: '800' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: 10,
    paddingVertical: 6,
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
  note: { ...type.caption, color: colors.danger },
});

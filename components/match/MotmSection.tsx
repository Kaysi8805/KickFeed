import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Crest } from '@/components/ui/Crest';
import { EmptyState } from '@/components/ui/EmptyState';
import type { Fixture, MotmVote, Team } from '@/data/types';
import { entityHref } from '@/lib/entityNav';
import { isMotmOpen, type MotmCandidate, tallyMotmVotes } from '@/lib/engagement';
import { colors, radius, spacing, type } from '@/theme';

export function MotmSection({
  fixture,
  home,
  away,
  candidates,
  mine,
  community,
  signedIn,
  onVote,
}: {
  fixture: Fixture;
  home: Team;
  away: Team;
  candidates: MotmCandidate[];
  mine?: MotmVote;
  community: MotmVote[];
  signedIn: boolean;
  onVote: (candidate: MotmCandidate) => void;
}) {
  const open = isMotmOpen(fixture.status);
  const tallies = tallyMotmVotes(community);
  const maxVotes = Math.max(1, ...tallies.map((row) => row.votes));
  const tallyByKey = new Map(tallies.map((row) => [row.key, row]));
  const ranked = [...candidates].sort((a, b) => {
    const va = tallyByKey.get(a.key)?.votes ?? 0;
    const vb = tallyByKey.get(b.key)?.votes ?? 0;
    if (vb !== va) return vb - va;
    return a.number - b.number;
  });
  const canVote = signedIn && open && !mine;

  return (
    <View style={styles.block}>
      <Text style={styles.kicker}>
        {fixture.status === 'finished' ? 'Man of the Match' : open ? 'Vote Man of the Match' : 'MOTM after kickoff'}
      </Text>
      <Text style={styles.lede}>
        {!open
          ? 'Voting opens when the match goes live. One vote per user — no take-backs.'
          : mine
            ? `You voted for ${mine.playerName}. That pick is locked; tallies still update as others vote.`
            : 'Pick one player from the lineups (or squad if XIs are not cached). One vote, no take-backs.'}
      </Text>

      {!open ? (
        <EmptyState
          compact
          title="Voting hasn’t opened"
          body="Come back once this match is live. The ballot uses the starting XI, or both squads if lineups aren’t cached."
        />
      ) : candidates.length === 0 ? (
        <EmptyState
          compact
          title="Players not cached"
          body="Free-tier quota may skip lineups and squads. Scores still load; MOTM needs a player list."
        />
      ) : (
        ranked.map((player) => {
          const votes = tallyByKey.get(player.key)?.votes ?? 0;
          const selected = mine?.playerKey === player.key;
          const team = player.teamId === home.id ? home : player.teamId === away.id ? away : undefined;
          const voteLocked = open && !!mine;
          const Row = canVote ? Pressable : View;
          return (
            <Row
              key={player.key}
              {...(canVote
                ? {
                    onPress: () => onVote(player),
                    accessibilityRole: 'button' as const,
                    accessibilityState: { disabled: false, selected },
                    accessibilityLabel: `Vote ${player.name} for Man of the Match`,
                  }
                : {
                    accessibilityRole: 'none' as const,
                    accessibilityState: { disabled: true, selected },
                    accessibilityLabel: selected
                      ? `${player.name}, your Man of the Match vote`
                      : voteLocked
                        ? `${player.name}, voting closed — you already voted`
                        : `${player.name}`,
                  })}
              style={[styles.row, selected && styles.rowMine, voteLocked && !selected && styles.rowLocked]}
            >
              <View style={styles.numWrap}>
                <Text style={styles.num}>{player.number}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Pressable
                  disabled={!player.playerId}
                  onPress={() => player.playerId && router.push(entityHref('player', player.playerId))}
                  hitSlop={4}
                >
                  <Text style={[styles.name, player.playerId ? styles.link : null]} numberOfLines={1}>
                    {player.name}
                  </Text>
                </Pressable>
                <View style={styles.metaRow}>
                  <Text style={styles.meta}>{player.pos}</Text>
                  {team ? <Crest team={team} size={16} /> : null}
                  {selected ? <Text style={styles.meta}>your vote</Text> : voteLocked ? <Text style={styles.meta}>locked</Text> : null}
                </View>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { flex: votes }, votes === 0 && styles.barEmpty]} />
                  <View style={{ flex: maxVotes - votes }} />
                </View>
              </View>
              <View style={styles.trail}>
                {selected ? (
                  <View style={styles.voted}>
                    <Text style={styles.votedText}>Voted</Text>
                  </View>
                ) : null}
                <Text style={styles.count}>{votes}</Text>
              </View>
            </Row>
          );
        })
      )}

      {!signedIn && open ? <Text style={styles.hint}>Sign in to vote.</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { marginTop: spacing.lg, gap: 8 },
  kicker: { ...type.micro, color: colors.limeMuted, textTransform: 'uppercase' },
  lede: { ...type.caption, color: colors.textMuted, fontWeight: '500', lineHeight: 18, marginBottom: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    padding: spacing.md,
    minHeight: 56,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowMine: { borderColor: colors.limeMuted, backgroundColor: colors.surfaceAlt },
  rowLocked: { opacity: 0.62 },
  numWrap: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  num: { ...type.caption, color: colors.lime },
  name: { ...type.subtitle, fontSize: 14, color: colors.text },
  link: { color: colors.lime },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 1, marginBottom: 6 },
  meta: { ...type.caption, color: colors.textMuted, fontWeight: '500' },
  barTrack: { flexDirection: 'row', height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: colors.bgElevated },
  barFill: { backgroundColor: colors.pitchBright, borderRadius: 3 },
  barEmpty: { flex: 0, width: 0 },
  trail: { alignItems: 'flex-end', gap: 4, minWidth: 44 },
  voted: {
    backgroundColor: colors.lime,
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  votedText: { ...type.micro, color: colors.bg, letterSpacing: 0.4 },
  count: { ...type.subtitle, color: colors.text, minWidth: 22, textAlign: 'right' },
  hint: { ...type.caption, color: colors.textDim, fontWeight: '500', marginTop: 4 },
});

import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

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
          ? 'Voting opens when the match goes live. One vote per demo user.'
          : mine
            ? `You voted for ${mine.playerName}. Tallies update as other fans vote.`
            : 'Pick one player from the lineups (or squad if XIs are not cached). One vote, no take-backs.'}
      </Text>

      {!open ? null : candidates.length === 0 ? (
        <EmptyState
          title="Players not cached"
          body="Free-tier quota may skip lineups and squads. Scores still load; MOTM needs a player list."
        />
      ) : (
        ranked.map((player) => {
          const votes = tallyByKey.get(player.key)?.votes ?? 0;
          const selected = mine?.playerKey === player.key;
          const team = player.teamId === home.id ? home : player.teamId === away.id ? away : undefined;
          return (
            <Pressable
              key={player.key}
              onPress={() => {
                if (canVote) onVote(player);
              }}
              style={[styles.row, selected && styles.rowMine]}
            >
              <View style={styles.numWrap}>
                <Text style={styles.num}>{player.number}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Pressable
                  disabled={!player.playerId}
                  onPress={() => player.playerId && router.push(entityHref('player', player.playerId))}
                >
                  <Text style={[styles.name, player.playerId ? styles.link : null]} numberOfLines={1}>
                    {player.name}
                  </Text>
                </Pressable>
                <Text style={styles.meta}>
                  {player.pos}
                  {team ? ` · ${team.code}` : ''}
                  {selected ? ' · your vote' : ''}
                </Text>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { flex: votes }, votes === 0 && styles.barEmpty]} />
                  <View style={{ flex: maxVotes - votes }} />
                </View>
              </View>
              <Text style={styles.count}>{votes}</Text>
            </Pressable>
          );
        })
      )}

      {!signedIn && open ? <Text style={styles.hint}>Sign in with a demo profile to vote.</Text> : null}
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
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowMine: { borderColor: colors.limeMuted, backgroundColor: colors.surfaceAlt },
  numWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  num: { ...type.caption, color: colors.lime },
  name: { ...type.subtitle, fontSize: 14, color: colors.text },
  link: { color: colors.lime },
  meta: { ...type.caption, color: colors.textMuted, fontWeight: '500', marginTop: 1, marginBottom: 6 },
  barTrack: { flexDirection: 'row', height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: colors.bgElevated },
  barFill: { backgroundColor: colors.pitchBright, borderRadius: 3 },
  barEmpty: { flex: 0, width: 0 },
  count: { ...type.subtitle, color: colors.text, minWidth: 22, textAlign: 'right' },
  hint: { ...type.caption, color: colors.textDim, fontWeight: '500', marginTop: 4 },
});

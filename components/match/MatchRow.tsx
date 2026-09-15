import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Crest } from '@/components/ui/Crest';
import { LiveBadge } from '@/components/match/LiveBadge';
import type { Fixture } from '@/data/types';
import { kickoffLabel } from '@/lib/format';
import { football } from '@/services/football';
import { colors, radius, spacing, type } from '@/theme';

export function MatchRow({ fixture, compact }: { fixture: Fixture; compact?: boolean }) {
  const home = football.getTeam(fixture.homeTeamId);
  const away = football.getTeam(fixture.awayTeamId);
  const league = football.getLeague(fixture.leagueId);
  if (!home || !away) return null;
  const live = fixture.status === 'live' || fixture.status === 'ht';
  const done = fixture.status === 'finished';

  return (
    <Pressable
      onPress={() => router.push(`/match/${fixture.id}`)}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.86 }]}
    >
      {!compact && league ? <Text style={styles.league}>{league.shortName}</Text> : null}
      <View style={styles.row}>
        <View style={styles.side}>
          <Crest team={home} size={compact ? 28 : 34} />
          <Text style={styles.team} numberOfLines={1}>
            {home.shortName}
          </Text>
        </View>
        <View style={styles.mid}>
          {live || done ? (
            <Text style={styles.score}>
              {fixture.homeScore}–{fixture.awayScore}
            </Text>
          ) : (
            <Text style={styles.ko}>{kickoffLabel(fixture.kickoff)}</Text>
          )}
          {live ? <LiveBadge minute={fixture.minute} ht={fixture.status === 'ht'} /> : null}
          {done ? <Text style={styles.ft}>FT</Text> : null}
        </View>
        <View style={[styles.side, styles.right]}>
          <Text style={[styles.team, styles.teamRight]} numberOfLines={1}>
            {away.shortName}
          </Text>
          <Crest team={away} size={compact ? 28 : 34} />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  league: { ...type.micro, color: colors.limeMuted, marginBottom: 8, textTransform: 'uppercase' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  side: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  right: { justifyContent: 'flex-end' },
  team: { ...type.caption, color: colors.text, flexShrink: 1 },
  teamRight: { textAlign: 'right' },
  mid: { alignItems: 'center', minWidth: 78, gap: 4 },
  score: { ...type.score, fontSize: 22, color: colors.text },
  ko: { ...type.caption, color: colors.textMuted },
  ft: { ...type.micro, color: colors.textDim },
});

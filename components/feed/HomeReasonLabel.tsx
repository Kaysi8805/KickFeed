import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Crest, LeagueMark } from '@/components/ui/Crest';
import type { HomeReason } from '@/lib/homeFeed';
import { entityHref } from '@/lib/entityNav';
import { football } from '@/services/football';
import { colors, radius, type } from '@/theme';

/** Soft green Friend pill + muted follow reasons. Green is brand/Friend only — never LIVE. */
export function HomeReasonLabel({ reason }: { reason: HomeReason }) {
  if (reason.kind === 'friend') {
    return (
      <View style={styles.row} accessibilityLabel="Friend">
        <View style={styles.friendPill}>
          <Text style={styles.friendText}>Friend</Text>
        </View>
      </View>
    );
  }

  if (reason.kind === 'you') {
    return (
      <View style={styles.row} accessibilityLabel="Your post">
        <Text style={styles.muted}>Your post</Text>
      </View>
    );
  }

  if (reason.kind === 'following') {
    return (
      <View style={styles.row} accessibilityLabel="Following">
        <Text style={styles.muted}>Following</Text>
      </View>
    );
  }

  if (reason.kind === 'follow_entity') {
    const team = reason.entityKind === 'team' ? football.getTeam(reason.entityId) : undefined;
    const href =
      reason.entityKind === 'team'
        ? entityHref('team', reason.entityId)
        : entityHref('player', reason.entityId);
    return (
      <View style={styles.row} accessibilityLabel={`Because you follow ${reason.name}`}>
        <Text style={styles.muted}>Because you follow </Text>
        <Pressable onPress={() => router.push(href)} style={styles.chip} accessibilityRole="link">
          {team ? <Crest team={team} size={14} /> : null}
          <Text style={styles.chipText}>{reason.name}</Text>
        </Pressable>
      </View>
    );
  }

  const league = football.getLeague(reason.leagueId);
  return (
    <View style={styles.row} accessibilityLabel={`${reason.name} · Following`}>
      <Pressable
        onPress={() => router.push(entityHref('league', reason.leagueId))}
        style={styles.leagueRow}
        accessibilityRole="link"
      >
        {league ? <LeagueMark league={league} size={14} /> : null}
        <Text style={styles.muted}>{reason.name}</Text>
        <Text style={styles.dot}>·</Text>
        <Text style={styles.following}>Following</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  friendPill: {
    backgroundColor: 'rgba(34, 197, 94, 0.16)',
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.35)',
  },
  friendText: {
    ...type.badge,
    color: colors.accentSoft,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  muted: { ...type.meta, color: colors.textMuted, fontWeight: '500' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipText: { ...type.meta, color: colors.text, fontWeight: '700' },
  leagueRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { ...type.meta, color: colors.textMuted },
  following: { ...type.meta, color: colors.textMuted, fontWeight: '700' },
});

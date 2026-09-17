import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/ui/Avatar';
import type { LeaderboardRow } from '@/lib/leaderboard';
import { breakdownLine } from '@/lib/leaderboard';
import { colors, radius, spacing, type } from '@/theme';

export function RankRow({
  row,
  onPress,
}: {
  row: LeaderboardRow;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={`${row.rank}. ${row.name}, ${row.points} points`}
      style={[styles.row, row.isCurrentUser && styles.mine]}
    >
      <Text style={[styles.rank, row.rank <= 3 && styles.rankHot]}>{row.rank}</Text>
      <Avatar initials={row.initials} color={row.avatarColor} size={36} />
      <View style={styles.meta}>
        <Text style={styles.name} numberOfLines={1}>
          {row.name}
          {row.isCurrentUser ? ' · you' : ''}
        </Text>
        <Text style={styles.handle} numberOfLines={1}>
          @{row.handle} · {breakdownLine(row)}
        </Text>
      </View>
      <Text style={styles.pts}>{row.points}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    minHeight: 52,
  },
  mine: { borderColor: colors.lime, backgroundColor: colors.surfaceAlt },
  rank: { ...type.subtitle, color: colors.textDim, width: 28, textAlign: 'center' },
  rankHot: { color: colors.gold },
  meta: { flex: 1, minWidth: 0 },
  name: { ...type.caption, color: colors.text, fontWeight: '700' },
  handle: { ...type.micro, color: colors.textMuted, letterSpacing: 0, textTransform: 'none', fontWeight: '500' },
  pts: { ...type.subtitle, color: colors.lime, minWidth: 28, textAlign: 'right' },
});

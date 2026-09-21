import { StyleSheet, Text, View } from 'react-native';

import { LiveBadge } from '@/components/match/LiveBadge';
import { MatchRow } from '@/components/match/MatchRow';
import type { Fixture } from '@/data/types';
import { colors, spacing, type } from '@/theme';

function isLive(fixture: Fixture): boolean {
  return fixture.status === 'live' || fixture.status === 'ht';
}

export function LiveFixtureTray({
  title,
  fixtures,
}: {
  title: string;
  fixtures: Fixture[];
}) {
  if (fixtures.length === 0) return null;
  const anyLive = fixtures.some(isLive);

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={styles.title}>{title}</Text>
        {anyLive ? <LiveBadge clock={false} /> : null}
      </View>
      {fixtures.map((fixture) => (
        <MatchRow key={fixture.id} fixture={fixture} compact />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.md },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
    minHeight: 28,
  },
  title: {
    ...type.badge,
    color: colors.textMuted,
    flex: 1,
  },
});

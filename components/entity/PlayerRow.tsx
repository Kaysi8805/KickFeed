import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Player } from '@/data/types';
import { entityHref } from '@/lib/entityNav';
import { colors, radius, spacing, type } from '@/theme';

export function PlayerRow({
  player,
  meta,
}: {
  player: Player;
  meta?: string;
}) {
  return (
    <Pressable
      onPress={() => router.push(entityHref('player', player.id))}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.86 }]}
    >
      <View style={styles.numWrap}>
        <Text style={styles.num}>{player.number}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.name} numberOfLines={1}>
          {player.name}
        </Text>
        <Text style={styles.meta}>
          {player.pos}
          {meta ? ` · ${meta}` : ` · ${player.nationality}`}
        </Text>
      </View>
      <Text style={styles.chev}>→</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radius.md,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
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
  meta: { ...type.caption, color: colors.textMuted, fontWeight: '500', marginTop: 1 },
  chev: { color: colors.limeMuted },
});

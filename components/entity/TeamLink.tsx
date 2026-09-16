import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, TextStyle, ViewStyle } from 'react-native';

import { Crest } from '@/components/ui/Crest';
import type { Team } from '@/data/types';
import { entityHref } from '@/lib/entityNav';
import { colors, type } from '@/theme';

export function TeamLink({
  team,
  size = 28,
  label,
  textStyle,
  style,
  showName = true,
}: {
  team: Team;
  size?: number;
  label?: string;
  textStyle?: TextStyle;
  style?: ViewStyle;
  showName?: boolean;
}) {
  return (
    <Pressable
      onPress={() => router.push(entityHref('team', team.id))}
      style={({ pressed }) => [styles.row, style, pressed && { opacity: 0.8 }]}
    >
      <Crest team={team} size={size} />
      {showName ? (
        <Text style={[styles.name, textStyle]} numberOfLines={1}>
          {label ?? team.shortName}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  name: { ...type.caption, color: colors.text, flexShrink: 1 },
});

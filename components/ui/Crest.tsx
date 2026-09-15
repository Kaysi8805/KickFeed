import { StyleSheet, Text, View } from 'react-native';

import type { Team } from '@/data/types';
import { colors } from '@/theme';

export function Crest({ team, size = 36 }: { team: Team; size?: number }) {
  return (
    <View
      style={[
        styles.wrap,
        {
          width: size,
          height: size,
          borderRadius: size / 4,
          backgroundColor: team.color,
          borderColor: team.accent,
        },
      ]}
    >
      <Text style={[styles.code, { fontSize: Math.max(9, size * 0.28), color: colors.white }]}>{team.code}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  code: { fontWeight: '800', letterSpacing: 0.4 },
});

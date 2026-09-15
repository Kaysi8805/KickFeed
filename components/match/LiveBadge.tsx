import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, type } from '@/theme';

export function LiveBadge({ minute, ht }: { minute?: number; ht?: boolean }) {
  return (
    <View style={styles.wrap}>
      <View style={styles.dot} />
      <Text style={styles.text}>{ht ? 'HT' : `${minute ?? 1}'`}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255, 59, 92, 0.16)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.live },
  text: { ...type.micro, color: colors.live, letterSpacing: 0.2 },
});

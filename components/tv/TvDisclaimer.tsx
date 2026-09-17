import { StyleSheet, Text, View } from 'react-native';

import { TV_EDITORIAL_DISCLAIMER } from '@/lib/honesty';
import { colors, radius, spacing, type } from '@/theme';

export function TvDisclaimer({ compact }: { compact?: boolean }) {
  return (
    <View style={[styles.banner, compact && styles.compact]} accessibilityRole="text">
      <Text style={[styles.text, compact && styles.textCompact]}>{TV_EDITORIAL_DISCLAIMER}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  compact: { paddingVertical: 8 },
  text: { ...type.caption, color: colors.gold, fontWeight: '600', lineHeight: 18 },
  textCompact: { fontSize: 12, lineHeight: 16 },
});

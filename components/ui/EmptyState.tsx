import { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing, type } from '@/theme';

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <View style={styles.wrap}>
      <View style={styles.pitch} />
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: spacing.xxxl, paddingHorizontal: spacing.xl, gap: spacing.sm },
  pitch: {
    width: 54,
    height: 54,
    borderRadius: 16,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 2,
    borderColor: colors.pitchBright,
    marginBottom: spacing.sm,
  },
  title: { ...type.subtitle, color: colors.text, textAlign: 'center' },
  body: { ...type.body, color: colors.textMuted, textAlign: 'center', lineHeight: 22 },
});

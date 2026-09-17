import { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, type } from '@/theme';

export function EmptyState({
  title,
  body,
  action,
  compact,
  actionLabel,
  onAction,
}: {
  title: string;
  body: string;
  action?: ReactNode;
  compact?: boolean;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const cta =
    action ??
    (actionLabel && onAction ? (
      <Pressable
        onPress={onAction}
        accessibilityRole="button"
        accessibilityLabel={actionLabel}
        style={styles.cta}
      >
        <Text style={styles.ctaText}>{actionLabel}</Text>
      </Pressable>
    ) : null);

  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      {compact ? null : <View style={styles.pitch} />}
      <Text style={[styles.title, compact && styles.titleCompact]}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
      {cta}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: spacing.xxxl, paddingHorizontal: spacing.xl, gap: spacing.sm },
  wrapCompact: { paddingVertical: spacing.md, paddingHorizontal: 0, gap: 6 },
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
  titleCompact: { fontSize: 15 },
  body: { ...type.body, color: colors.textMuted, textAlign: 'center', lineHeight: 22 },
  cta: {
    backgroundColor: colors.lime,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 44,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  ctaText: { ...type.caption, color: colors.bg, fontWeight: '800' },
});

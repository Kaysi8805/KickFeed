import { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
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
    (actionLabel && onAction ? <Button label={actionLabel} onPress={onAction} /> : null);

  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      {compact ? null : <View style={styles.mark} />}
      <Text style={[styles.title, compact && styles.titleCompact]}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
      {cta}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: spacing.xxxl, paddingHorizontal: spacing.xl, gap: spacing.sm },
  wrapCompact: { paddingVertical: spacing.md, paddingHorizontal: 0, gap: 6 },
  mark: {
    width: 54,
    height: 54,
    borderRadius: 16,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  title: { ...type.title, fontSize: 16, color: colors.text, textAlign: 'center' },
  titleCompact: { fontSize: 15 },
  body: { ...type.body, color: colors.textMuted, textAlign: 'center', lineHeight: 22 },
});

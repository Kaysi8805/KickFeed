import { useState } from 'react';
import { Alert, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { ReportSheet } from '@/components/moderation/ReportSheet';
import type { ReportTargetType } from '@/data/types';
import { moderationDisclaimer } from '@/lib/honesty';
import { shouldPersistModeration } from '@/lib/moderation';
import { useApp } from '@/services/AppProvider';
import { colors, radius, spacing, type } from '@/theme';

export function SafetyMenu({
  targetType,
  targetId,
  targetUserId,
  targetName,
  compact,
}: {
  targetType: ReportTargetType;
  targetId: string;
  targetUserId: string;
  targetName?: string;
  compact?: boolean;
}) {
  const { currentUser, authMode, supabaseConfigured, isBlocked, blockUser, unblockUser, report } = useApp();
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  if (!currentUser || currentUser.id === targetUserId) return null;

  const blocked = isBlocked(targetUserId);
  const honesty = moderationDisclaimer(shouldPersistModeration(supabaseConfigured, authMode));
  const label = targetName ?? 'this fan';

  function onBlock() {
    setMenuOpen(false);
    if (blocked) {
      unblockUser(targetUserId);
      return;
    }
    blockUser(targetUserId);
    if (Platform.OS !== 'web') {
      Alert.alert('Blocked', `${label}’s posts and match-chat messages are hidden on this account.`);
    }
  }

  return (
    <>
      <Pressable
        onPress={() => setMenuOpen(true)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`Safety options for ${label}`}
        style={[styles.trigger, compact && styles.triggerCompact]}
      >
        <Text style={styles.triggerText}>···</Text>
      </Pressable>
      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setMenuOpen(false)} accessibilityLabel="Dismiss safety menu">
          <Pressable style={styles.menu} onPress={() => undefined}>
            <Text style={styles.menuTitle}>{label}</Text>
            <Pressable
              onPress={() => {
                setMenuOpen(false);
                setReportOpen(true);
              }}
              accessibilityRole="button"
              accessibilityLabel={`Report ${label}`}
              style={styles.row}
            >
              <Text style={styles.rowText}>Report {targetType === 'profile' ? 'profile' : targetType === 'post' ? 'post' : 'message'}</Text>
            </Pressable>
            <Pressable onPress={onBlock} accessibilityRole="button" accessibilityLabel={blocked ? `Unblock ${label}` : `Block ${label}`} style={styles.row}>
              <Text style={[styles.rowText, !blocked && styles.danger]}>{blocked ? 'Unblock' : 'Block'}</Text>
            </Pressable>
            <Pressable onPress={() => setMenuOpen(false)} accessibilityRole="button" accessibilityLabel="Cancel" style={styles.row}>
              <Text style={styles.cancel}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
      <ReportSheet
        visible={reportOpen}
        targetType={targetType}
        targetName={targetName}
        honesty={honesty}
        onClose={() => setReportOpen(false)}
        onSubmit={(reason) =>
          report({
            targetType,
            targetId,
            targetUserId,
            reason,
          })
        }
      />
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  triggerCompact: { minWidth: 36, minHeight: 36 },
  triggerText: { ...type.subtitle, color: colors.textMuted, letterSpacing: 1 },
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
    padding: spacing.lg,
  },
  menu: {
    backgroundColor: colors.bgElevated,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    overflow: 'hidden',
  },
  menuTitle: {
    ...type.caption,
    color: colors.textDim,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  row: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  rowText: { ...type.subtitle, fontSize: 16, color: colors.text },
  danger: { color: colors.danger },
  cancel: { ...type.caption, color: colors.textMuted },
});

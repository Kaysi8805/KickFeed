import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { ReportTargetType } from '@/data/types';
import {
  REPORT_DETAIL_MAX,
  REPORT_REASON_PRESETS,
  composeReportReason,
  type ReportResult,
} from '@/lib/moderation';
import { colors, radius, spacing, type } from '@/theme';

const TARGET_COPY: Record<ReportTargetType, string> = {
  post: 'this post',
  profile: 'this profile',
  comment: 'this match-chat message',
};

export function ReportSheet({
  visible,
  targetType,
  targetName,
  honesty,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  targetType: ReportTargetType;
  targetName?: string;
  honesty: string;
  onClose: () => void;
  onSubmit: (reason: string) => ReportResult;
}) {
  const [presetId, setPresetId] = useState<(typeof REPORT_REASON_PRESETS)[number]['id'] | null>(null);
  const [detail, setDetail] = useState('');
  const [note, setNote] = useState<string | null>(null);

  function reset() {
    setPresetId(null);
    setDetail('');
    setNote(null);
  }

  function close() {
    reset();
    onClose();
  }

  function submit() {
    if (!presetId) {
      setNote('Pick a reason.');
      return;
    }
    const reason = composeReportReason(presetId, detail);
    if (!reason) {
      setNote(presetId === 'other' ? 'Add a short note (at least 3 characters).' : 'Add a short reason.');
      return;
    }
    const result = onSubmit(reason);
    if (!result.ok) {
      setNote(result.error);
      return;
    }
    setNote(result.duplicate ? 'You already reported this.' : 'Thanks — KickFeed recorded this report.');
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <Pressable style={styles.overlay} onPress={close} accessibilityLabel="Dismiss report sheet">
        <Pressable style={styles.sheet} onPress={() => undefined}>
          <Text style={styles.kicker}>REPORT</Text>
          <Text style={styles.title}>
            Report {TARGET_COPY[targetType]}
            {targetName ? ` · ${targetName}` : ''}
          </Text>
          <Text style={styles.body}>KickFeed stores a short reason. There is no public moderation inbox in this app.</Text>
          <View style={styles.chips}>
            {REPORT_REASON_PRESETS.map((preset) => {
              const on = presetId === preset.id;
              return (
                <Pressable
                  key={preset.id}
                  onPress={() => {
                    setPresetId(preset.id);
                    setNote(null);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={preset.label}
                  style={[styles.chip, on && styles.chipOn]}
                >
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>{preset.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <TextInput
            value={detail}
            onChangeText={(value) => {
              setDetail(value.slice(0, REPORT_DETAIL_MAX));
              setNote(null);
            }}
            placeholder={presetId === 'other' ? 'What happened?' : 'Optional detail'}
            placeholderTextColor={colors.textDim}
            multiline
            accessibilityLabel="Report detail"
            style={styles.input}
          />
          {note ? <Text style={styles.note}>{note}</Text> : null}
          <Text style={styles.honesty}>{honesty}</Text>
          <View style={styles.actions}>
            <Pressable onPress={close} style={styles.ghost} accessibilityRole="button" accessibilityLabel="Cancel report">
              <Text style={styles.ghostText}>Cancel</Text>
            </Pressable>
            <Pressable onPress={submit} style={styles.solid} accessibilityRole="button" accessibilityLabel="Submit report">
              <Text style={styles.solidText}>Submit</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
    padding: spacing.lg,
  },
  sheet: {
    backgroundColor: colors.bgElevated,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  kicker: { ...type.micro, color: colors.limeMuted },
  title: { ...type.subtitle, color: colors.text },
  body: { ...type.caption, color: colors.textMuted, fontWeight: '500', lineHeight: 18 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: spacing.xs },
  chip: {
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 44,
    justifyContent: 'center',
  },
  chipOn: { borderColor: colors.lime, backgroundColor: colors.surfaceAlt },
  chipText: { ...type.caption, color: colors.textMuted },
  chipTextOn: { color: colors.lime },
  input: {
    minHeight: 72,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    padding: spacing.md,
    textAlignVertical: 'top',
  },
  note: { ...type.caption, color: colors.lime, fontWeight: '600' },
  honesty: { ...type.caption, color: colors.textDim, fontWeight: '500', lineHeight: 18 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: spacing.sm },
  ghost: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderRadius: radius.full,
  },
  ghostText: { ...type.caption, color: colors.textMuted },
  solid: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 18,
    borderRadius: radius.full,
    backgroundColor: colors.lime,
  },
  solidText: { ...type.caption, color: colors.bg, fontWeight: '800' },
});

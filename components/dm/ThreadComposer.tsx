import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, radius, spacing, type } from '@/theme';

export function ThreadComposer({
  draft,
  onChange,
  onSend,
  canSend,
  editable = true,
  placeholder,
  hint,
  inputLabel,
  accessory,
}: {
  draft: string;
  onChange: (value: string) => void;
  onSend: () => void;
  canSend: boolean;
  editable?: boolean;
  placeholder: string;
  hint: string;
  inputLabel: string;
  accessory?: ReactNode;
}) {
  return (
    <View style={styles.composer}>
      {accessory}
      <Text style={styles.composerHint}>{hint}</Text>
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder={placeholder}
          placeholderTextColor={colors.textDim}
          value={draft}
          editable={editable}
          onChangeText={onChange}
          accessibilityLabel={inputLabel}
          multiline
        />
        <Pressable
          onPress={onSend}
          disabled={!canSend}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSend }}
          accessibilityLabel="Send message"
          style={[styles.send, !canSend && styles.sendOff]}
        >
          <Ionicons name="send" size={16} color={!canSend ? colors.textDim : colors.bg} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  composer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bgElevated,
  },
  composerHint: { ...type.micro, color: colors.textDim, marginBottom: 6 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.lime,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendOff: { backgroundColor: colors.surface },
});

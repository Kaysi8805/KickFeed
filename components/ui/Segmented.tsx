import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, type } from '@/theme';

export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { key: T; label: string }[];
}) {
  return (
    <View style={styles.row}>
      {options.map((opt) => {
        const active = opt.key === value;
        return (
          <Pressable
            key={opt.key}
            onPress={() => onChange(opt.key)}
            style={[styles.item, options.length > 4 && styles.itemTight, active && styles.active]}
          >
            <Text style={[styles.label, options.length > 4 && styles.labelTight, active && styles.labelActive]}>{opt.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 4,
    gap: 4,
  },
  item: { flexGrow: 1, flexBasis: 0, minWidth: 48, paddingVertical: spacing.sm, borderRadius: radius.md, alignItems: 'center' },
  itemTight: { minWidth: 44, paddingVertical: 6 },
  active: { backgroundColor: colors.pitchBright },
  label: { ...type.caption, color: colors.textMuted },
  labelTight: { fontSize: 11 },
  labelActive: { color: colors.bg, fontWeight: '800' },
});

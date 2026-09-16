import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { TvAiring } from '@/data/types';
import { colors, radius, spacing, type } from '@/theme';

export function ChannelChips({
  airings,
  compact,
}: {
  airings: TvAiring[];
  compact?: boolean;
}) {
  if (!airings.length) return null;
  return (
    <View style={styles.row}>
      {airings.map((air) => (
        <View key={air.channel.id} style={[styles.chip, compact && styles.chipCompact]}>
          <Text style={[styles.label, compact && styles.labelCompact]} numberOfLines={1}>
            {air.channel.shortName}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function CountryChips({
  countries,
  value,
  onChange,
}: {
  countries: { id: string; flag: string; shortName: string }[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <View style={styles.row}>
      {countries.map((c) => {
        const active = c.id === value;
        return (
          <Pressable
            key={c.id}
            onPress={() => onChange(c.id)}
            hitSlop={4}
            style={[styles.country, active && styles.countryActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={c.shortName}
          >
            <Text style={[styles.countryText, active && styles.countryTextActive]}>
              {c.flag} {c.shortName}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    backgroundColor: colors.bgElevated,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.limeMuted,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  chipCompact: { paddingHorizontal: 8, paddingVertical: 3 },
  label: { ...type.caption, color: colors.lime, fontSize: 12 },
  labelCompact: { fontSize: 11 },
  country: {
    backgroundColor: colors.surface,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 36,
    justifyContent: 'center',
  },
  countryActive: { backgroundColor: colors.pitchBright, borderColor: colors.pitchBright },
  countryText: { ...type.caption, color: colors.textMuted },
  countryTextActive: { color: colors.bg, fontWeight: '800' },
});

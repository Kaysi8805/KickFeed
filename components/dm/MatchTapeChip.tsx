import { StyleSheet, Text, View } from 'react-native';

import type { MatchTapeAnchor } from '@/data/types';
import { isSampleAnchor } from '@/lib/matchTape';
import { colors, radius, type } from '@/theme';

export function MatchTapeChip({ anchor, mine }: { anchor: MatchTapeAnchor; mine: boolean }) {
  const sample = isSampleAnchor(anchor);
  return (
    <View style={[styles.chip, mine ? styles.chipMine : styles.chipTheirs]}>
      <Text style={[styles.text, mine && styles.textMine]} numberOfLines={2}>
        {sample ? `Sample · ${anchor.label}` : anchor.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: 'flex-start',
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 6,
    borderWidth: 1,
  },
  chipTheirs: { backgroundColor: colors.bg, borderColor: colors.accent },
  chipMine: { backgroundColor: 'rgba(5, 8, 5, 0.16)', borderColor: 'rgba(5, 8, 5, 0.28)' },
  text: { ...type.micro, color: colors.accentSoft, letterSpacing: 0 },
  textMine: { color: colors.bg, fontWeight: '700' },
});

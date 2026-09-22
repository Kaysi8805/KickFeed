import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { FormResult } from '@/data/types';
import type { TeamFormChip } from '@/lib/teamPhaseA';
import { entityHref } from '@/lib/entityNav';
import { colors, radius, type } from '@/theme';

const RESULT_LABEL = { W: 'Win', D: 'Draw', L: 'Loss' } as const;

export function FormStrip({ chips }: { chips: TeamFormChip[] }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {chips.map((chip) => (
        <Pressable
          key={chip.fixtureId}
          onPress={() => router.push(entityHref('match', chip.fixtureId))}
          accessibilityRole="button"
          accessibilityLabel={`${RESULT_LABEL[chip.result]} ${chip.goalsFor}–${chip.goalsAgainst}`}
          style={({ pressed }) => [styles.item, pressed && { opacity: 0.86 }]}
        >
          <View
            style={[
              styles.pill,
              chip.result === 'W' && styles.win,
              chip.result === 'D' && styles.draw,
              chip.result === 'L' && styles.loss,
            ]}
          >
            <Text
              style={[
                styles.letter,
                chip.result === 'W' && styles.letterWin,
                chip.result === 'D' && styles.letterDraw,
                chip.result === 'L' && styles.letterLoss,
              ]}
            >
              {chip.result}
            </Text>
          </View>
          <Text style={styles.score}>
            {chip.goalsFor}–{chip.goalsAgainst}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

/** Season-form letters from a statistics string. No scores, so these are not match links. */
export function ResultLetters({ results }: { results: FormResult[] }) {
  if (results.length === 0) return null;
  return (
    <View style={styles.row}>
      {results.map((result, index) => (
        <View
          key={`${result}-${index}`}
          style={[
            styles.pill,
            result === 'W' && styles.win,
            result === 'D' && styles.draw,
            result === 'L' && styles.loss,
          ]}
        >
          <Text
            style={[
              styles.letter,
              result === 'W' && styles.letterWin,
              result === 'D' && styles.letterDraw,
              result === 'L' && styles.letterLoss,
            ]}
          >
            {result}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, paddingVertical: 2 },
  item: { alignItems: 'center', gap: 4 },
  pill: {
    minWidth: 28,
    height: 22,
    paddingHorizontal: 7,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  win: { backgroundColor: colors.accent, borderColor: colors.accent },
  draw: { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
  loss: { backgroundColor: 'transparent', borderColor: colors.live },
  letter: { ...type.micro, fontSize: 11, letterSpacing: 0.2 },
  letterWin: { color: colors.onCta },
  letterDraw: { color: colors.textMuted },
  letterLoss: { color: colors.live },
  score: {
    ...type.caption,
    color: colors.text,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
  },
});

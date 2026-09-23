import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import type { MatchDay } from '@/lib/matchesWindow';
import { colors, radius, spacing, type } from '@/theme';

const CHIP_WIDTH = 56;
const CHIP_GAP = 8;
const CHIP_STRIDE = CHIP_WIDTH + CHIP_GAP;

export function MatchDateStrip({
  days,
  selected,
  onSelect,
}: {
  days: MatchDay[];
  selected: string;
  onSelect: (iso: string) => void;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const [viewport, setViewport] = useState(0);
  const scrolled = useRef(false);

  useEffect(() => {
    if (viewport <= 0) return;
    const index = days.findIndex((day) => day.iso === selected);
    if (index < 0) return;
    const chipLeft = spacing.lg + index * CHIP_STRIDE;
    const x = Math.max(0, chipLeft - (viewport - CHIP_WIDTH) / 2);
    scrollRef.current?.scrollTo({ x, animated: scrolled.current });
    scrolled.current = true;
  }, [days, selected, viewport]);

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroller}
      contentContainerStyle={styles.row}
      onLayout={(event) => {
        const width = event.nativeEvent.layout.width;
        setViewport((prev) => (Math.abs(prev - width) < 1 ? prev : width));
      }}
    >
      {days.map((day) => {
        const active = day.iso === selected;
        const today = day.relation === 'today';
        return (
          <Pressable
            key={day.iso}
            onPress={() => onSelect(day.iso)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={day.accessibilityLabel}
            style={[styles.chip, active && styles.chipActive, today && styles.chipToday]}
          >
            <Text style={[styles.weekday, (today || active) && styles.weekdayOn]}>
              {day.weekday}
            </Text>
            <Text style={styles.num}>{day.dayNum}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroller: { flexGrow: 0, height: 64 },
  row: {
    paddingHorizontal: spacing.lg,
    gap: CHIP_GAP,
    alignItems: 'center',
  },
  chip: {
    width: CHIP_WIDTH,
    height: 64,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.text,
  },
  chipToday: {
    borderColor: colors.text,
  },
  weekday: {
    ...type.micro,
    color: colors.textMuted,
    letterSpacing: 0.2,
  },
  weekdayOn: { color: colors.text },
  num: {
    ...type.subtitle,
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
});

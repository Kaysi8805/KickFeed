import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { colors, radius, type } from '@/theme';

export function LiveBadge({
  minute,
  ht,
  clock = true,
  compact,
}: {
  minute?: number;
  ht?: boolean;
  /** When false, only the LIVE label is shown (tray headers). */
  clock?: boolean;
  compact?: boolean;
}) {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.35,
          duration: 720,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 720,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const clockLabel = ht ? 'HT' : minute != null ? `${minute}'` : undefined;
  const a11y = ht ? 'Live, half time' : minute != null ? `Live, ${minute} minutes` : 'Live';

  return (
    <View
      style={[styles.wrap, compact && styles.wrapCompact]}
      accessibilityRole="text"
      accessibilityLabel={a11y}
    >
      <Animated.View style={[styles.dot, compact && styles.dotCompact, { opacity: pulse }]} />
      <Text style={styles.label}>LIVE</Text>
      {clock && clockLabel ? <Text style={styles.clock}>{clockLabel}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(239, 68, 68, 0.16)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.45)',
  },
  wrapCompact: { paddingHorizontal: 6, paddingVertical: 2, gap: 4 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.live },
  dotCompact: { width: 5, height: 5, borderRadius: 2.5 },
  label: { ...type.badge, color: colors.live, letterSpacing: 0.9 },
  clock: { ...type.badge, color: colors.live, letterSpacing: 0.2, fontVariant: ['tabular-nums'] as Array<'tabular-nums'> },
});

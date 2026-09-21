import { StyleSheet, Text, View } from 'react-native';

import { colors } from '@/theme';

export function Avatar({
  initials,
  color,
  size = 44,
  ringColor,
}: {
  initials: string;
  color: string;
  size?: number;
  ringColor?: string;
}) {
  const ring = ringColor ? 2 : 0;
  return (
    <View
      style={[
        styles.wrap,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          borderWidth: ring,
          borderColor: ringColor ?? 'transparent',
        },
      ]}
    >
      <Text style={[styles.text, { fontSize: size * 0.34 }]}>{initials}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  text: { color: colors.white, fontWeight: '800' },
});

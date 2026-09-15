import { StyleSheet, Text, View } from 'react-native';

import { colors } from '@/theme';

export function Avatar({
  initials,
  color,
  size = 44,
}: {
  initials: string;
  color: string;
  size?: number;
}) {
  return (
    <View style={[styles.wrap, { width: size, height: size, borderRadius: size / 2, backgroundColor: color }]}>
      <Text style={[styles.text, { fontSize: size * 0.34 }]}>{initials}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  text: { color: colors.white, fontWeight: '800' },
});

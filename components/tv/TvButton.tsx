import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { colors } from '@/theme';

export function TvButton() {
  return (
    <Pressable
      onPress={() => router.push('/tv')}
      accessibilityRole="button"
      accessibilityLabel="TV schedule"
      style={styles.icon}
    >
      <Ionicons name="tv-outline" size={20} color={colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  icon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

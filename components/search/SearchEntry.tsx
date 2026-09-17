import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

import { colors, radius, spacing, type } from '@/theme';

export function SearchButton() {
  return (
    <Pressable
      onPress={() => router.push('/search')}
      accessibilityRole="button"
      accessibilityLabel="Search"
      style={styles.icon}
    >
      <Ionicons name="search" size={20} color={colors.text} />
    </Pressable>
  );
}

export function SearchBarPrompt() {
  return (
    <Pressable
      onPress={() => router.push('/search')}
      accessibilityRole="button"
      accessibilityLabel="Search clubs, players, leagues, and fans"
      style={styles.bar}
    >
      <Ionicons name="search" size={18} color={colors.textDim} />
      <Text style={styles.placeholder}>Search clubs, players, leagues, fans</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  icon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    minHeight: 44,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  placeholder: { ...type.body, color: colors.textDim },
});

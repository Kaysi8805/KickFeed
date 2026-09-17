import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { colors } from '@/theme';

export function LeaderboardButton({ leagueId }: { leagueId?: string }) {
  return (
    <Pressable
      onPress={() =>
        router.push(leagueId ? { pathname: '/leaderboard', params: { leagueId } } : '/leaderboard')
      }
      accessibilityRole="button"
      accessibilityLabel="Prediction leaderboard"
      style={styles.icon}
    >
      <Ionicons name="trophy-outline" size={20} color={colors.text} />
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
});

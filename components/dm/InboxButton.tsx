import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useApp } from '@/services/AppProvider';
import { colors, type } from '@/theme';

export function InboxButton() {
  const { unreadDmCount } = useApp();
  return (
    <Pressable
      onPress={() => router.push('/messages')}
      accessibilityRole="button"
      accessibilityLabel={unreadDmCount > 0 ? `Messages, ${unreadDmCount} unread` : 'Messages'}
      style={styles.icon}
    >
      <Ionicons name="chatbubble" size={20} color={colors.text} />
      {unreadDmCount > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{unreadDmCount > 9 ? '9+' : unreadDmCount}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  icon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: colors.live,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: { color: colors.white, fontSize: 9, fontWeight: '800' },
});

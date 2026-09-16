import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { EmptyState } from '@/components/ui/EmptyState';
import { HeaderBar } from '@/components/ui/HeaderBar';
import { Screen } from '@/components/ui/Screen';
import { timeAgo } from '@/lib/format';
import { useApp } from '@/services/AppProvider';
import { colors, radius, spacing, type } from '@/theme';

const icons: Record<string, string> = {
  goal: '⚽',
  kickoff: '🕐',
  follow: '🤝',
  comment: '💬',
  friend_post: '📣',
};

export default function NotificationsScreen() {
  const { notifications, markNotificationsRead } = useApp();

  return (
    <Screen padded={false}>
      <View style={styles.pad}>
        <HeaderBar
          title="Notifications"
          onBack={() => router.back()}
          right={
            <Pressable onPress={markNotificationsRead}>
              <Text style={styles.mark}>Mark read</Text>
            </Pressable>
          }
        />
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        {notifications.length === 0 ? (
          <EmptyState title="All quiet" body="Match chat replies, goals, kickoffs, and friend posts will land here." />
        ) : (
          notifications.map((n) => (
            <Pressable
              key={n.id}
              onPress={() => {
                if (n.matchId) {
                  router.push(n.type === 'comment' ? `/match/${n.matchId}?tab=chat` : `/match/${n.matchId}`);
                } else if (n.userId) router.push(`/user/${n.userId}`);
              }}
              style={[styles.card, !n.read && styles.unread]}
            >
              <Text style={styles.icon}>{icons[n.type] ?? '•'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{n.title}</Text>
                <Text style={styles.body}>{n.body}</Text>
                <Text style={styles.time}>{timeAgo(n.createdAt)}</Text>
              </View>
            </Pressable>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: spacing.lg },
  mark: { ...type.caption, color: colors.lime },
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: 32 },
  card: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  unread: { borderColor: colors.limeMuted, backgroundColor: colors.surfaceAlt },
  icon: { fontSize: 22, width: 28 },
  title: { ...type.subtitle, fontSize: 15, color: colors.text },
  body: { ...type.caption, color: colors.textMuted, fontWeight: '500', marginTop: 2 },
  time: { ...type.micro, color: colors.textDim, marginTop: 6 },
});

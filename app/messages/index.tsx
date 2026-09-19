import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/ui/Avatar';
import { EmptyState } from '@/components/ui/EmptyState';
import { HeaderBar } from '@/components/ui/HeaderBar';
import { Screen } from '@/components/ui/Screen';
import { DM_INBOX_EMPTY_BODY, DM_INBOX_EMPTY_TITLE, dmDisclaimer } from '@/lib/honesty';
import { shouldPersistDms } from '@/lib/dms';
import { timeAgo } from '@/lib/format';
import { safeBack } from '@/lib/navBack';
import { userFromProfile } from '@/lib/userIdentity';
import { useApp } from '@/services/AppProvider';
import { colors, radius, spacing, type } from '@/theme';

export default function MessagesInboxScreen() {
  const { dmThreads, users, authMode, supabaseConfigured } = useApp();
  const honesty = dmDisclaimer(shouldPersistDms(supabaseConfigured, authMode));

  return (
    <Screen padded={false}>
      <View style={styles.pad}>
        <HeaderBar title="Messages" onBack={() => safeBack('/')} />
      </View>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.honesty}>{honesty}</Text>
        {dmThreads.length === 0 ? (
          <EmptyState
            title={DM_INBOX_EMPTY_TITLE}
            body={DM_INBOX_EMPTY_BODY}
            actionLabel="Find a fan"
            onAction={() => router.push('/search')}
          />
        ) : (
          dmThreads.map((thread) => {
            const peer = users.find((u) => u.id === thread.peerId) ?? userFromProfile(thread.peerId, undefined);
            const unread = thread.unreadCount > 0;
            return (
              <Pressable
                key={thread.id}
                onPress={() => router.push(`/messages/${thread.peerId}`)}
                accessibilityRole="button"
                accessibilityLabel={`Message ${peer.name}`}
                style={[styles.row, unread && styles.unread]}
              >
                <Avatar initials={peer.initials} color={peer.avatarColor} size={44} />
                <View style={styles.meta}>
                  <View style={styles.head}>
                    <Text style={styles.name} numberOfLines={1}>
                      {peer.name}
                    </Text>
                    <Text style={styles.time}>{timeAgo(thread.lastMessage.createdAt)}</Text>
                  </View>
                  <Text style={styles.handle}>@{peer.handle}</Text>
                  <Text style={[styles.preview, unread && styles.previewUnread]} numberOfLines={2}>
                    {thread.lastMessage.text}
                  </Text>
                </View>
                {unread ? (
                  <View style={styles.dot}>
                    <Text style={styles.dotText}>{thread.unreadCount > 9 ? '9+' : thread.unreadCount}</Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: spacing.lg },
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: 40 },
  honesty: {
    ...type.caption,
    color: colors.textDim,
    fontWeight: '500',
    marginBottom: spacing.md,
    lineHeight: 18,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  unread: { borderColor: colors.limeMuted, backgroundColor: colors.surfaceAlt },
  meta: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { ...type.subtitle, fontSize: 15, color: colors.text, flex: 1 },
  time: { ...type.micro, color: colors.textDim },
  handle: { ...type.caption, color: colors.limeMuted, marginTop: 2 },
  preview: { ...type.caption, color: colors.textMuted, fontWeight: '500', marginTop: 4, lineHeight: 18 },
  previewUnread: { color: colors.text, fontWeight: '700' },
  dot: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.lime,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  dotText: { ...type.micro, color: colors.bg, letterSpacing: 0 },
});

import { Ionicons } from '@expo/vector-icons';
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
  const { inbox, users, authMode, supabaseConfigured } = useApp();
  const honesty = dmDisclaimer(shouldPersistDms(supabaseConfigured, authMode));

  return (
    <Screen padded={false}>
      <View style={styles.pad}>
        <HeaderBar
          title="Messages"
          onBack={() => safeBack('/')}
          right={
            <Pressable
              onPress={() => router.push('/messages/new')}
              accessibilityRole="button"
              accessibilityLabel="New group"
              style={styles.newGroup}
            >
              <Ionicons name="people" size={14} color={colors.onCta} />
              <Text style={styles.newGroupText}>New group</Text>
            </Pressable>
          }
        />
      </View>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.honesty}>{honesty}</Text>
        {inbox.length === 0 ? (
          <EmptyState
            title={DM_INBOX_EMPTY_TITLE}
            body={DM_INBOX_EMPTY_BODY}
            actionLabel="New group"
            onAction={() => router.push('/messages/new')}
          />
        ) : (
          inbox.map((row) => {
            if (row.kind === 'group') {
              const unread = row.unreadCount > 0;
              return (
                <Pressable
                  key={row.id}
                  onPress={() => router.push(`/messages/group/${row.id}`)}
                  accessibilityRole="button"
                  accessibilityLabel={`Group ${row.title}, ${row.memberCount} members`}
                  style={[styles.row, unread && styles.unread]}
                >
                  <View style={styles.groupMark}>
                    <Ionicons name="people" size={20} color={colors.onCta} />
                  </View>
                  <View style={styles.meta}>
                    <View style={styles.head}>
                      <Text style={styles.name} numberOfLines={1}>
                        {row.title}
                      </Text>
                      <Text style={styles.time}>{timeAgo(row.sortAt)}</Text>
                    </View>
                    <Text style={styles.handle}>GROUP · {row.memberCount}</Text>
                    <Text style={[styles.preview, unread && styles.previewUnread]} numberOfLines={2}>
                      {row.preview}
                    </Text>
                  </View>
                  {unread ? <UnreadDot count={row.unreadCount} /> : null}
                </Pressable>
              );
            }
            const peer = users.find((u) => u.id === row.peerId) ?? userFromProfile(row.peerId, undefined);
            const unread = row.unreadCount > 0;
            return (
              <Pressable
                key={row.id}
                onPress={() => router.push(`/messages/${row.peerId}`)}
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
                    <Text style={styles.time}>{timeAgo(row.sortAt)}</Text>
                  </View>
                  <Text style={styles.handle}>@{peer.handle}</Text>
                  <Text style={[styles.preview, unread && styles.previewUnread]} numberOfLines={2}>
                    {row.preview}
                  </Text>
                </View>
                {unread ? <UnreadDot count={row.unreadCount} /> : null}
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </Screen>
  );
}

function UnreadDot({ count }: { count: number }) {
  return (
    <View style={styles.dot}>
      <Text style={styles.dotText}>{count > 9 ? '9+' : count}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: spacing.lg },
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: 40 },
  newGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.accent,
    borderRadius: radius.full,
    paddingHorizontal: 10,
    minHeight: 32,
  },
  newGroupText: { ...type.micro, color: colors.onCta, letterSpacing: 0 },
  groupMark: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
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

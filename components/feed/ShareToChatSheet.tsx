import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/ui/Avatar';
import type { SharedPostPayload } from '@/data/types';
import { userFromProfile } from '@/lib/userIdentity';
import { useApp } from '@/services/AppProvider';
import { colors, radius, spacing, type } from '@/theme';

export function ShareToChatSheet({
  visible,
  payload,
  onClose,
}: {
  visible: boolean;
  payload: SharedPostPayload | null;
  onClose: () => void;
}) {
  const { users, friendIds, canMessage, inbox, groupBlockReason, sendPostToChat } = useApp();
  const [note, setNote] = useState<string | null>(null);

  function close() {
    setNote(null);
    onClose();
  }

  function person(id: string) {
    return users.find((user) => user.id === id) ?? userFromProfile(id, undefined);
  }

  function send(target: { kind: 'direct'; peerId: string } | { kind: 'group'; groupId: string }) {
    if (!payload) return;
    const result = sendPostToChat(target, payload);
    if (!result.ok) {
      setNote(result.error);
      return;
    }
    close();
    if (target.kind === 'direct') router.push(`/messages/${target.peerId}`);
    else router.push(`/messages/group/${target.groupId}`);
  }

  const chats: Array<{
    key: string;
    title: string;
    subtitle: string;
    initials: string;
    color: string;
    target: { kind: 'direct'; peerId: string } | { kind: 'group'; groupId: string };
  }> = [];
  const directIds = new Set<string>();
  for (const row of inbox) {
    if (row.kind === 'direct') {
      if (!canMessage(row.peerId)) continue;
      const peer = person(row.peerId);
      directIds.add(row.peerId);
      chats.push({
        key: `dm-${row.peerId}`,
        title: peer.name,
        subtitle: 'Direct message',
        initials: peer.initials,
        color: peer.avatarColor,
        target: { kind: 'direct', peerId: row.peerId },
      });
    } else if (!groupBlockReason(row.id)) {
      chats.push({
        key: `group-${row.id}`,
        title: row.title,
        subtitle: `Group · ${row.memberCount}`,
        initials: 'GR',
        color: colors.accent,
        target: { kind: 'group', groupId: row.id },
      });
    }
  }
  const starters = users.filter(
    (user) => friendIds.includes(user.id) && canMessage(user.id) && !directIds.has(user.id),
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <Pressable style={styles.overlay} onPress={close} accessibilityLabel="Dismiss send sheet">
        <Pressable style={styles.sheet} onPress={() => undefined}>
          <Text style={styles.kicker}>SEND IN KICKFEED</Text>
          <Text style={styles.title}>Share to a chat</Text>
          {payload ? (
            <Text style={styles.preview} numberOfLines={2}>
              {payload.authorName}: {payload.snippet}
            </Text>
          ) : null}
          <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
            <Pressable
              onPress={() => {
                if (!payload) return;
                close();
                router.push(`/messages/new?sharePostId=${encodeURIComponent(payload.postId)}`);
              }}
              accessibilityRole="button"
              accessibilityLabel="New group"
              style={styles.row}
            >
              <View style={styles.groupMark}>
                <Ionicons name="people" size={18} color={colors.onCta} />
              </View>
              <View style={styles.meta}>
                <Text style={styles.name}>New group</Text>
                <Text style={styles.sub}>Pick two or more friends</Text>
              </View>
            </Pressable>
            {chats.map((row) => (
              <Pressable
                key={row.key}
                onPress={() => send(row.target)}
                accessibilityRole="button"
                accessibilityLabel={`Send to ${row.title}`}
                style={styles.row}
              >
                <Avatar initials={row.initials} color={row.color} size={36} />
                <View style={styles.meta}>
                  <Text style={styles.name} numberOfLines={1}>
                    {row.title}
                  </Text>
                  <Text style={styles.sub}>{row.subtitle}</Text>
                </View>
              </Pressable>
            ))}
            {starters.map((friend) => (
              <Pressable
                key={friend.id}
                onPress={() => send({ kind: 'direct', peerId: friend.id })}
                accessibilityRole="button"
                accessibilityLabel={`Send to ${friend.name}`}
                style={styles.row}
              >
                <Avatar initials={friend.initials} color={friend.avatarColor} size={36} />
                <View style={styles.meta}>
                  <Text style={styles.name} numberOfLines={1}>
                    {friend.name}
                  </Text>
                  <Text style={styles.sub}>Start a chat</Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
          {note ? <Text style={styles.note}>{note}</Text> : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
    padding: spacing.lg,
  },
  sheet: {
    backgroundColor: colors.bgElevated,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    maxHeight: '80%',
    gap: spacing.sm,
  },
  kicker: { ...type.badge, color: colors.accent },
  title: { ...type.title, fontSize: 20, color: colors.text },
  preview: { ...type.caption, color: colors.textMuted, fontWeight: '500', lineHeight: 18 },
  list: { maxHeight: 360 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    minHeight: 52,
  },
  groupMark: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  meta: { flex: 1 },
  name: { ...type.subtitle, fontSize: 15, color: colors.text },
  sub: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  note: { ...type.caption, color: colors.danger },
});

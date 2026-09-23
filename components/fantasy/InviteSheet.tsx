import { router } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/ui/Avatar';
import type { FantasyLeague } from '@/lib/fantasy';
import { fantasyInviteLink, fantasyInviteMessage } from '@/lib/fantasy';
import { userFromProfile } from '@/lib/userIdentity';
import { useApp } from '@/services/AppProvider';
import { colors, radius, spacing, type } from '@/theme';

export function InviteSheet({
  visible,
  league,
  onClose,
}: {
  visible: boolean;
  league: FantasyLeague | null;
  onClose: () => void;
}) {
  const { users, friendIds, canMessage, inbox, groupBlockReason, sendDirectMessage, sendGroupMessage } = useApp();
  const [note, setNote] = useState<string | null>(null);
  if (!league) return null;
  const message = fantasyInviteMessage(league);

  function close() {
    setNote(null);
    onClose();
  }

  function person(id: string) {
    return users.find((user) => user.id === id) ?? userFromProfile(id, undefined);
  }

  async function shareOut() {
    try {
      await Share.share({ message });
    } catch {
      setNote('Couldn’t open the share sheet. The code is still on this screen.');
    }
  }

  function send(target: { kind: 'direct'; peerId: string } | { kind: 'group'; groupId: string }) {
    const result =
      target.kind === 'direct' ? sendDirectMessage(target.peerId, message) : sendGroupMessage(target.groupId, message);
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
  for (const user of users) {
    if (!friendIds.includes(user.id) || !canMessage(user.id) || directIds.has(user.id)) continue;
    chats.push({
      key: `friend-${user.id}`,
      title: user.name,
      subtitle: 'Friend',
      initials: user.initials,
      color: user.avatarColor,
      target: { kind: 'direct', peerId: user.id },
    });
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close} accessibilityLabel="Close invite" />
      <View style={styles.sheet}>
        <Text style={styles.title}>Invite</Text>
        <Text style={styles.code} selectable>
          {league.inviteCode}
        </Text>
        <Text style={styles.link} selectable>
          {fantasyInviteLink(league.inviteCode)}
        </Text>
        <Pressable onPress={() => void shareOut()} style={styles.share} accessibilityRole="button" accessibilityLabel="Share invite link">
          <Text style={styles.shareText}>Share link</Text>
        </Pressable>
        <Text style={styles.section}>Send in a chat</Text>
        <ScrollView style={styles.list}>
          {chats.length === 0 ? (
            <Text style={styles.empty}>No open chats yet. Share the link, or message a friend from Profile first.</Text>
          ) : (
            chats.map((chat) => (
              <Pressable
                key={chat.key}
                onPress={() => send(chat.target)}
                style={styles.row}
                accessibilityRole="button"
                accessibilityLabel={`Send invite to ${chat.title}`}
              >
                <Avatar initials={chat.initials} color={chat.color} size={36} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{chat.title}</Text>
                  <Text style={styles.subtitle}>{chat.subtitle}</Text>
                </View>
              </Pressable>
            ))
          )}
        </ScrollView>
        {note ? <Text style={styles.note}>{note}</Text> : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    maxHeight: '70%',
    gap: spacing.sm,
  },
  title: { ...type.badge, color: colors.textMuted },
  code: { ...type.hero, color: colors.text, letterSpacing: 2 },
  link: { ...type.caption, color: colors.accent },
  share: {
    backgroundColor: colors.accent,
    borderRadius: radius.full,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareText: { ...type.caption, color: colors.onCta, fontWeight: '800' },
  section: { ...type.badge, color: colors.textMuted, marginTop: spacing.sm },
  list: { maxHeight: 240 },
  empty: { ...type.caption, color: colors.textMuted, lineHeight: 18 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 8 },
  name: { ...type.body, color: colors.text },
  subtitle: { ...type.caption, color: colors.textMuted },
  note: { ...type.caption, color: colors.danger },
});

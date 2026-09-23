import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { sharedPayloadForPost } from '@/components/feed/postShare';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { HeaderBar } from '@/components/ui/HeaderBar';
import { Screen } from '@/components/ui/Screen';
import { safeBack } from '@/lib/navBack';
import { routeId } from '@/lib/routeParams';
import { useApp } from '@/services/AppProvider';
import { colors, radius, spacing, type } from '@/theme';

export default function NewGroupScreen() {
  const params = useLocalSearchParams<{ sharePostId?: string | string[] }>();
  const sharePostId = routeId(params.sharePostId);
  const { users, friendIds, canMessage, posts, createDmGroup, sendPostToChat } = useApp();
  const [picked, setPicked] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [note, setNote] = useState<string | null>(null);

  const friends = users.filter((user) => friendIds.includes(user.id) && canMessage(user.id));
  const ready = picked.length >= 2;

  function toggle(id: string) {
    setPicked((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
    setNote(null);
  }

  function create() {
    if (!ready) {
      setNote('Pick at least two friends.');
      return;
    }
    const result = createDmGroup(picked, title);
    if (!result.ok) {
      setNote(result.error);
      return;
    }
    const post = sharePostId ? posts.find((row) => row.id === sharePostId) : undefined;
    const author = post ? users.find((user) => user.id === post.authorId) : undefined;
    if (post && author) {
      const payload = sharedPayloadForPost(post, author);
      if (payload) {
        const sent = sendPostToChat({ kind: 'group', groupId: result.group.id }, payload);
        if (!sent.ok) setNote(sent.error);
      }
    }
    router.replace(`/messages/group/${result.group.id}`);
  }

  return (
    <Screen padded={false}>
      <View style={styles.pad}>
        <HeaderBar title="New group" onBack={() => safeBack('/messages')} />
      </View>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.kicker}>GROUP</Text>
        <Text style={styles.lead}>
          {sharePostId ? 'Pick two friends, then this post lands in the new chat.' : 'Pick two or more mutual friends.'}
        </Text>
        <TextInput
          value={title}
          onChangeText={(value) => {
            setTitle(value.slice(0, 80));
            setNote(null);
          }}
          placeholder="Name (optional)"
          placeholderTextColor={colors.textDim}
          accessibilityLabel="Group name"
          style={styles.input}
        />
        {friends.length === 0 ? (
          <EmptyState compact title="No friends to add" body="Follow fans who follow you back. Blocked fans stay off this list." />
        ) : (
          friends.map((friend) => {
            const on = picked.includes(friend.id);
            return (
              <Pressable
                key={friend.id}
                onPress={() => toggle(friend.id)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                accessibilityLabel={friend.name}
                style={[styles.row, on && styles.rowOn]}
              >
                <Avatar initials={friend.initials} color={friend.avatarColor} size={40} />
                <View style={styles.meta}>
                  <Text style={styles.name}>{friend.name}</Text>
                  <Text style={styles.handle}>@{friend.handle}</Text>
                </View>
                <View style={[styles.check, on && styles.checkOn]}>
                  {on ? <Text style={styles.checkMark}>✓</Text> : null}
                </View>
              </Pressable>
            );
          })
        )}
        {note ? <Text style={styles.note}>{note}</Text> : null}
        <Text style={styles.count}>{picked.length} selected</Text>
        <Button label={sharePostId ? 'Create and send' : 'Create group'} onPress={create} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: spacing.lg },
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: 40, gap: spacing.sm },
  kicker: { ...type.badge, color: colors.accent },
  lead: { ...type.body, color: colors.textMuted, lineHeight: 22, marginBottom: spacing.sm },
  input: {
    minHeight: 44,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  rowOn: { borderColor: colors.accent },
  meta: { flex: 1 },
  name: { ...type.subtitle, fontSize: 15, color: colors.text },
  handle: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  check: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  checkMark: { color: colors.onCta, fontSize: 13, fontWeight: '800' },
  note: { ...type.caption, color: colors.danger },
  count: { ...type.caption, color: colors.textMuted, marginTop: spacing.sm },
});

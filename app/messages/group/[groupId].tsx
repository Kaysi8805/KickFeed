import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ChatBubble } from '@/components/dm/ChatBubble';
import { ThreadComposer } from '@/components/dm/ThreadComposer';
import { EmptyState } from '@/components/ui/EmptyState';
import { HeaderBar } from '@/components/ui/HeaderBar';
import { Screen } from '@/components/ui/Screen';
import { dmSlowModeComposerCopy, shouldPersistDms } from '@/lib/dms';
import { displayGroupTitle } from '@/lib/groups';
import { dmDisclaimer } from '@/lib/honesty';
import { safeBack } from '@/lib/navBack';
import { routeId } from '@/lib/routeParams';
import { userFromProfile } from '@/lib/userIdentity';
import { useApp } from '@/services/AppProvider';
import { colors, spacing, type } from '@/theme';

export default function GroupThreadScreen() {
  const params = useLocalSearchParams<{ groupId: string | string[] }>();
  const groupId = routeId(params.groupId);
  const scrollRef = useRef<ScrollView>(null);
  const {
    currentUser,
    users,
    dmGroups,
    groupThreadMessages,
    sendGroupMessage,
    markGroupRead,
    groupSlowModeFor,
    groupBlockReason,
    leaveDmGroup,
    authMode,
    supabaseConfigured,
  } = useApp();
  const [draft, setDraft] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);

  const group = groupId ? dmGroups.find((row) => row.id === groupId) : undefined;
  const messages = group ? groupThreadMessages(group.id) : [];
  const blocked = group ? groupBlockReason(group.id) : 'This group isn’t on KickFeed.';
  const slow = group ? groupSlowModeFor(group.id, Date.now()) : { ok: true as const };
  const slowCopy = dmSlowModeComposerCopy(slow);
  const canSend = !!group && !blocked && !!draft.trim() && slow.ok;
  const honesty = dmDisclaimer(shouldPersistDms(supabaseConfigured, authMode));
  const title =
    group && currentUser
      ? displayGroupTitle(group, currentUser.id, (id) => users.find((user) => user.id === id)?.name)
      : 'Group';

  useEffect(() => {
    if (!group) return;
    markGroupRead(group.id);
  }, [group, messages.length, markGroupRead]);

  useEffect(() => {
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: false }));
  }, [messages.length]);

  if (!group || !currentUser) {
    return (
      <Screen>
        <HeaderBar title="Messages" onBack={() => safeBack('/messages')} />
        <EmptyState title="Unknown group" body="This conversation isn’t on KickFeed." />
      </Screen>
    );
  }

  function send() {
    if (!group || !canSend) return;
    const result = sendGroupMessage(group.id, draft);
    if (!result.ok) {
      setNote(result.error);
      return;
    }
    setDraft('');
    setNote(null);
  }

  function leave() {
    leaveDmGroup(group!.id);
    safeBack('/messages');
  }

  return (
    <Screen padded={false}>
      <View style={styles.pad}>
        <HeaderBar
          title={title}
          onBack={() => safeBack('/messages')}
          right={
            <Pressable
              onPress={() => setConfirmLeave(true)}
              accessibilityRole="button"
              accessibilityLabel="Leave group"
              style={styles.leave}
            >
              <Text style={styles.leaveText}>Leave</Text>
            </Pressable>
          }
        />
        <Text style={styles.members}>{group.memberIds.length} members</Text>
      </View>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.honesty}>{honesty}</Text>
        {confirmLeave ? (
          <View style={styles.confirm}>
            <Text style={styles.confirmText}>Leave this group?</Text>
            <View style={styles.confirmRow}>
              <Pressable onPress={() => setConfirmLeave(false)} accessibilityRole="button" accessibilityLabel="Stay">
                <Text style={styles.stay}>Stay</Text>
              </Pressable>
              <Pressable onPress={leave} accessibilityRole="button" accessibilityLabel="Confirm leave group">
                <Text style={styles.leaveText}>Leave</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
        {messages.length === 0 ? (
          <EmptyState compact title={title} body="Say hi, or share a post from Home into this group." />
        ) : (
          messages.map((row) => {
            const mine = row.senderId === currentUser.id;
            const sender =
              users.find((user) => user.id === row.senderId) ?? userFromProfile(row.senderId, undefined);
            return (
              <ChatBubble
                key={row.id}
                messageId={row.id}
                mine={mine}
                text={row.text}
                createdAt={row.createdAt}
                share={row.share}
                sender={sender}
                showName
              />
            );
          })
        )}
      </ScrollView>
      {blocked ? (
        <View style={styles.blocked}>
          <Text style={styles.blockedText}>{blocked}</Text>
        </View>
      ) : (
        <ThreadComposer
          draft={draft}
          onChange={(value) => {
            setDraft(value);
            setNote(null);
          }}
          onSend={send}
          canSend={canSend}
          editable={slow.ok}
          placeholder={!slow.ok ? slowCopy : 'Message the group…'}
          hint={note ?? slowCopy}
          inputLabel="Group message"
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: spacing.lg },
  members: { ...type.caption, color: colors.textMuted, marginTop: -4, marginBottom: spacing.sm },
  leave: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  leaveText: { ...type.meta, color: colors.danger },
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: 16, flexGrow: 1 },
  honesty: {
    ...type.caption,
    color: colors.textDim,
    fontWeight: '500',
    marginBottom: spacing.md,
    lineHeight: 18,
  },
  confirm: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  confirmText: { ...type.body, color: colors.text },
  confirmRow: { flexDirection: 'row', gap: spacing.lg },
  stay: { ...type.meta, color: colors.text },
  blocked: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  blockedText: { ...type.caption, color: colors.textMuted, lineHeight: 18 },
});

import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { SafetyMenu } from '@/components/moderation/SafetyMenu';
import { Avatar } from '@/components/ui/Avatar';
import { EmptyState } from '@/components/ui/EmptyState';
import { HeaderBar } from '@/components/ui/HeaderBar';
import { Screen } from '@/components/ui/Screen';
import { DM_BLOCKED_COPY, dmDisclaimer } from '@/lib/honesty';
import { dmSlowModeComposerCopy, shouldPersistDms } from '@/lib/dms';
import { timeAgo } from '@/lib/format';
import { entityHref } from '@/lib/entityNav';
import { safeBack } from '@/lib/navBack';
import { routeId } from '@/lib/routeParams';
import { isPersistedUserId, userFromProfile } from '@/lib/userIdentity';
import { useApp } from '@/services/AppProvider';
import { colors, radius, spacing, type } from '@/theme';

export default function MessageThreadScreen() {
  const { peerId: rawId } = useLocalSearchParams<{ peerId: string | string[] }>();
  const peerId = routeId(rawId);
  const scrollRef = useRef<ScrollView>(null);
  const {
    currentUser,
    users,
    threadMessages,
    sendDirectMessage,
    markDmThreadRead,
    canMessage,
    dmSlowModeFor,
    authMode,
    supabaseConfigured,
  } = useApp();
  const [draft, setDraft] = useState('');
  const [note, setNote] = useState<string | null>(null);

  const peer =
    (peerId ? users.find((u) => u.id === peerId) : undefined) ??
    (peerId && isPersistedUserId(peerId) ? userFromProfile(peerId, undefined) : undefined);
  const allowed = !!peer && canMessage(peer.id);
  const messages = peer && currentUser ? threadMessages(peer.id) : [];
  const slow = peer ? dmSlowModeFor(peer.id, Date.now()) : { ok: true as const };
  const slowCopy = dmSlowModeComposerCopy(slow);
  const canSend = allowed && !!draft.trim() && slow.ok;
  const honesty = dmDisclaimer(shouldPersistDms(supabaseConfigured, authMode));

  useEffect(() => {
    if (!peer || !allowed) return;
    markDmThreadRead(peer.id);
  }, [peer?.id, allowed, messages.length, markDmThreadRead]);

  useEffect(() => {
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: false }));
  }, [messages.length]);

  if (!peerId || !peer || !currentUser) {
    return (
      <Screen>
        <HeaderBar title="Messages" onBack={() => safeBack('/messages')} />
        <EmptyState title="Unknown fan" body="This conversation isn’t on KickFeed." />
      </Screen>
    );
  }

  function send() {
    if (!peer || !canSend) return;
    const result = sendDirectMessage(peer.id, draft);
    if (!result.ok) {
      setNote(result.error);
      return;
    }
    setDraft('');
    setNote(null);
  }

  return (
    <Screen padded={false}>
      <View style={styles.pad}>
        <HeaderBar
          title={peer.name}
          onBack={() => safeBack('/messages')}
          right={
            <View style={styles.headRight}>
              <Pressable
                onPress={() => router.push(entityHref('user', peer.id))}
                accessibilityRole="button"
                accessibilityLabel={`${peer.name} profile`}
                style={styles.profileHit}
              >
                <Avatar initials={peer.initials} color={peer.avatarColor} size={32} />
              </Pressable>
              <SafetyMenu
                targetType="profile"
                targetId={peer.id}
                targetUserId={peer.id}
                targetName={peer.name}
                compact
              />
            </View>
          }
        />
      </View>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.honesty}>{honesty}</Text>
        {!allowed ? (
          <EmptyState title="Thread hidden" body={DM_BLOCKED_COPY} />
        ) : messages.length === 0 ? (
          <EmptyState
            compact
            title={`Message ${peer.name}`}
            body="1:1 text only. Say hi — this is not a group chat."
          />
        ) : (
          messages.map((row) => {
            const mine = row.senderId === currentUser.id;
            return (
              <View key={row.id} style={[styles.bubbleRow, mine && styles.bubbleRowMine]}>
                {mine ? null : <Avatar initials={peer.initials} color={peer.avatarColor} size={28} />}
                <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                  <View style={styles.bubbleHead}>
                    <Text style={[styles.bubbleTime, mine && styles.bubbleTimeMine]}>{timeAgo(row.createdAt)}</Text>
                    {mine ? null : (
                      <SafetyMenu
                        targetType="dm"
                        targetId={row.id}
                        targetUserId={row.senderId}
                        targetName={peer.name}
                        compact
                      />
                    )}
                  </View>
                  <Text style={[styles.bubbleText, mine && styles.bubbleTextMine]}>{row.text}</Text>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
      {allowed ? (
        <View style={styles.composer}>
          <Text style={styles.composerHint}>{note ?? slowCopy}</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder={!slow.ok ? slowCopy : `Message ${peer.name}…`}
              placeholderTextColor={colors.textDim}
              value={draft}
              editable={slow.ok}
              onChangeText={(value) => {
                setDraft(value);
                setNote(null);
              }}
              accessibilityLabel="Direct message"
              multiline
            />
            <Pressable
              onPress={send}
              disabled={!canSend}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSend }}
              accessibilityLabel="Send message"
              style={[styles.send, !canSend && styles.sendOff]}
            >
              <Ionicons name="send" size={16} color={!canSend ? colors.textDim : colors.bg} />
            </Pressable>
          </View>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: spacing.lg },
  headRight: { flexDirection: 'row', alignItems: 'center' },
  profileHit: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: 16, flexGrow: 1 },
  honesty: {
    ...type.caption,
    color: colors.textDim,
    fontWeight: '500',
    marginBottom: spacing.md,
    lineHeight: 18,
  },
  bubbleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 10, maxWidth: '92%' },
  bubbleRowMine: { alignSelf: 'flex-end', flexDirection: 'row-reverse' },
  bubble: {
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    maxWidth: '84%',
    borderWidth: 1,
  },
  bubbleTheirs: { backgroundColor: colors.surface, borderColor: colors.border },
  bubbleMine: { backgroundColor: colors.lime, borderColor: colors.lime },
  bubbleHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  bubbleTime: { ...type.micro, color: colors.textDim, letterSpacing: 0 },
  bubbleTimeMine: { color: colors.bgElevated },
  bubbleText: { ...type.body, color: colors.text, lineHeight: 22 },
  bubbleTextMine: { color: colors.bg, fontWeight: '600' },
  composer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bgElevated,
  },
  composerHint: { ...type.micro, color: colors.textDim, marginBottom: 6 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.lime,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendOff: { backgroundColor: colors.surface },
});

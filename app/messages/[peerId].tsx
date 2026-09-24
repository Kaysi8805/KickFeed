import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useMatchTapeThread } from '@/lib/useMatchTapeThread';

import { ChatBubble } from '@/components/dm/ChatBubble';
import { MatchTapeChip } from '@/components/dm/MatchTapeChip';
import { MatchTapePanel } from '@/components/dm/MatchTapePanel';
import { ThreadComposer } from '@/components/dm/ThreadComposer';
import { SafetyMenu } from '@/components/moderation/SafetyMenu';
import { Avatar } from '@/components/ui/Avatar';
import { EmptyState } from '@/components/ui/EmptyState';
import { HeaderBar } from '@/components/ui/HeaderBar';
import { Screen } from '@/components/ui/Screen';
import { DM_BLOCKED_COPY, dmDisclaimer } from '@/lib/honesty';
import { dmSlowModeComposerCopy, shouldPersistDms } from '@/lib/dms';
import { entityHref } from '@/lib/entityNav';
import { safeBack } from '@/lib/navBack';
import { routeId } from '@/lib/routeParams';
import { isPersistedUserId, userFromProfile } from '@/lib/userIdentity';
import { useApp } from '@/services/AppProvider';
import { colors, spacing, type } from '@/theme';

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
  const tape = useMatchTapeThread(peer && allowed ? { kind: 'dm', peerId: peer.id } : null, messages);
  const canSend = allowed && !!draft.trim() && slow.ok && !tape.locked;
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
    const result = sendDirectMessage(peer.id, draft, tape.pending);
    if (!result.ok) {
      setNote(result.error);
      return;
    }
    setDraft('');
    tape.setPending(null);
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
        {allowed ? <MatchTapePanel model={tape} /> : null}
        {!allowed ? (
          <EmptyState title="Thread hidden" body={DM_BLOCKED_COPY} />
        ) : messages.length === 0 ? (
          <EmptyState
            compact
            title={`Message ${peer.name}`}
            body="Say hi. Share a post from Home if you want it in this chat."
          />
        ) : (
          messages.map((row) => {
            const mine = row.senderId === currentUser.id;
            const sender = mine ? currentUser : peer;
            return (
              <ChatBubble
                key={row.id}
                messageId={row.id}
                mine={mine}
                text={row.text}
                createdAt={row.createdAt}
                share={row.share}
                tape={row.tape}
                sender={sender}
              />
            );
          })
        )}
      </ScrollView>
      {allowed && !tape.locked ? (
        <ThreadComposer
          draft={draft}
          onChange={(value) => {
            setDraft(value);
            setNote(null);
          }}
          onSend={send}
          canSend={canSend}
          editable={slow.ok}
          placeholder={!slow.ok ? slowCopy : `Message ${peer.name}…`}
          hint={note ?? (tape.pending ? `Anchored · ${tape.pending.label}` : slowCopy)}
          inputLabel="Direct message"
          accessory={
            tape.attachment?.status === 'active' ? (
              <View style={styles.anchorRow}>
                {tape.pending ? <MatchTapeChip anchor={tape.pending} mine={false} /> : null}
                <Pressable
                  onPress={() => tape.setEventOpen(true)}
                  onLongPress={() => tape.setEventOpen(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Anchor message to a match event"
                  style={styles.anchorBtn}
                >
                  <Text style={styles.anchorText}>{tape.pending ? 'Change event' : 'Event'}</Text>
                </Pressable>
                {tape.pending ? (
                  <Pressable
                    onPress={() => tape.setPending(null)}
                    accessibilityRole="button"
                    accessibilityLabel="Clear event anchor"
                  >
                    <Text style={styles.clearAnchor}>Clear</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null
          }
        />
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
  anchorRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  anchorBtn: {
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: colors.lime,
    alignItems: 'center',
    justifyContent: 'center',
  },
  anchorText: { ...type.micro, color: colors.bg, letterSpacing: 0 },
  clearAnchor: { ...type.caption, color: colors.textMuted },
});

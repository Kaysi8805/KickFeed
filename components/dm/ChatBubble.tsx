import { StyleSheet, Text, View } from 'react-native';

import { MatchTapeChip } from '@/components/dm/MatchTapeChip';
import { SharedPostCard } from '@/components/dm/SharedPostCard';
import { SafetyMenu } from '@/components/moderation/SafetyMenu';
import { Avatar } from '@/components/ui/Avatar';
import type { MatchTapeAnchor, SharedPostPayload } from '@/data/types';
import { timeAgo } from '@/lib/format';
import { colors, radius, spacing, type } from '@/theme';

export function ChatBubble({
  messageId,
  mine,
  text,
  createdAt,
  share,
  tape,
  sender,
  showName,
}: {
  messageId: string;
  mine: boolean;
  text: string;
  createdAt: string;
  share?: SharedPostPayload;
  tape?: MatchTapeAnchor;
  sender: { id: string; name: string; initials: string; avatarColor: string };
  showName?: boolean;
}) {
  return (
    <View style={[styles.bubbleRow, mine && styles.bubbleRowMine]}>
      {mine ? null : <Avatar initials={sender.initials} color={sender.avatarColor} size={28} />}
      <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
        <View style={styles.bubbleHead}>
          {showName && !mine ? <Text style={styles.sender}>{sender.name}</Text> : null}
          <Text style={[styles.bubbleTime, mine && styles.bubbleTimeMine]}>{timeAgo(createdAt)}</Text>
          {mine ? null : (
            <SafetyMenu
              targetType="dm"
              targetId={messageId}
              targetUserId={sender.id}
              targetName={sender.name}
              compact
            />
          )}
        </View>
        {tape ? <MatchTapeChip anchor={tape} mine={mine} /> : null}
        {share ? <SharedPostCard share={share} mine={mine} /> : <Text style={[styles.bubbleText, mine && styles.bubbleTextMine]}>{text}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
  sender: { ...type.micro, color: colors.textMuted, letterSpacing: 0, flex: 1 },
  bubbleTime: { ...type.micro, color: colors.textDim, letterSpacing: 0 },
  bubbleTimeMine: { color: colors.bgElevated },
  bubbleText: { ...type.body, color: colors.text, lineHeight: 22 },
  bubbleTextMine: { color: colors.bg, fontWeight: '600' },
});

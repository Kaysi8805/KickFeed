import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { SharedPostPayload } from '@/data/types';
import { entityHref } from '@/lib/entityNav';
import { colors, radius, spacing, type } from '@/theme';

export function SharedPostCard({ share, mine }: { share: SharedPostPayload; mine: boolean }) {
  const matchId = share.matchId;
  return (
    <View style={[styles.card, mine ? styles.cardMine : styles.cardTheirs]}>
      <Text style={[styles.kicker, mine && styles.kickerMine]}>Shared post</Text>
      <Pressable
        onPress={() => router.push(entityHref('user', share.authorId))}
        accessibilityRole="button"
        accessibilityLabel={`${share.authorName} profile`}
      >
        <Text style={[styles.author, mine && styles.onMine]}>{share.authorName}</Text>
        <Text style={[styles.handle, mine && styles.handleMine]}>@{share.authorHandle}</Text>
      </Pressable>
      <Text style={[styles.snippet, mine && styles.onMine]}>{share.snippet}</Text>
      {share.matchLabel ? (
        matchId ? (
          <Pressable
            onPress={() => router.push(entityHref('match', matchId))}
            accessibilityRole="button"
            accessibilityLabel={`Open match ${share.matchLabel}`}
          >
            <Text style={[styles.match, mine && styles.matchMine]}>{share.matchLabel}</Text>
          </Pressable>
        ) : (
          <Text style={[styles.match, mine && styles.matchMine]}>{share.matchLabel}</Text>
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: 2,
    marginTop: 4,
  },
  cardTheirs: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardMine: { backgroundColor: 'rgba(5, 8, 5, 0.14)' },
  kicker: { ...type.badge, color: colors.accent, letterSpacing: 0.6 },
  kickerMine: { color: colors.bg },
  author: { ...type.subtitle, fontSize: 14, color: colors.text },
  handle: { ...type.caption, color: colors.textMuted, fontWeight: '600' },
  handleMine: { color: colors.bgElevated },
  snippet: { ...type.body, color: colors.text, lineHeight: 20, marginTop: 4 },
  onMine: { color: colors.bg },
  match: { ...type.meta, color: colors.accent, marginTop: 6 },
  matchMine: { color: colors.bg },
});

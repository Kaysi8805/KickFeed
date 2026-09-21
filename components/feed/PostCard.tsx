import { Image } from 'expo-image';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { EntityText } from '@/components/feed/EntityText';
import { LiveBadge } from '@/components/match/LiveBadge';
import { SafetyMenu } from '@/components/moderation/SafetyMenu';
import { Avatar } from '@/components/ui/Avatar';
import type { Post, User } from '@/data/types';
import { entityHref } from '@/lib/entityNav';
import { timeAgo } from '@/lib/format';
import { canonicalMatchId, fixtureScoreLabel, resolvePostFixture } from '@/lib/matchSocial';
import { football } from '@/services/football';
import { colors, glow, radius, spacing, type } from '@/theme';

export function PostCard({
  post,
  author,
  liked,
  onLike,
  compact,
}: {
  post: Post;
  author: User;
  liked: boolean;
  onLike: () => void;
  compact?: boolean;
}) {
  const match = resolvePostFixture(post, football);
  const home = match ? football.getTeam(match.homeTeamId) : undefined;
  const away = match ? football.getTeam(match.awayTeamId) : undefined;
  const matchHrefId = post.matchId ? canonicalMatchId(football, post.matchId) : undefined;
  const live = match?.status === 'live' || match?.status === 'ht';

  return (
    <View style={[styles.card, live && styles.liveCard]}>
      <Pressable style={styles.head} onPress={() => router.push(entityHref('user', author.id))}>
        <View style={live ? styles.avatarLive : undefined}>
          <Avatar
            initials={author.initials}
            color={author.avatarColor}
            size={compact ? 36 : 42}
            ringColor={live ? colors.live : colors.border}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{author.name}</Text>
          <Text style={styles.handle}>
            @{author.handle} · {timeAgo(post.createdAt)}
          </Text>
        </View>
        {live ? <LiveBadge minute={match?.minute} ht={match?.status === 'ht'} /> : null}
        <SafetyMenu
          targetType="post"
          targetId={post.id}
          targetUserId={author.id}
          targetName={author.name}
          compact={compact}
        />
      </Pressable>
      <EntityText text={post.text} style={styles.body} />
      {post.imageUri ? (
        <Image source={{ uri: post.imageUri }} style={styles.photo} contentFit="cover" />
      ) : post.imageTone ? (
        <View style={[styles.image, { backgroundColor: post.imageTone }]}>
          <Text style={styles.imageHint}>Match night</Text>
        </View>
      ) : null}
      {match && home && away ? (
        <Pressable
          onPress={() => router.push(entityHref('match', match.id))}
          style={[styles.matchChip, live && styles.matchChipLive]}
        >
          <Text style={styles.matchChipText}>{fixtureScoreLabel(football, match)}</Text>
        </Pressable>
      ) : matchHrefId ? (
        <Pressable onPress={() => router.push(entityHref('match', matchHrefId))} style={styles.matchChip}>
          <Text style={styles.matchChipText}>Open match discussion</Text>
        </Pressable>
      ) : null}
      <View style={styles.actions}>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
            onLike();
          }}
          style={styles.action}
        >
          <Text style={[styles.actionText, liked && styles.actionLiked]}>{liked ? '♥ Liked' : '♡ Like'}</Text>
        </Pressable>
        {matchHrefId ? (
          <Pressable onPress={() => router.push(entityHref('match', matchHrefId))} style={styles.action}>
            <Text style={styles.actionText}>Chat</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  liveCard: { borderColor: colors.live },
  avatarLive: { ...glow.live, borderRadius: 24 },
  head: { flexDirection: 'row', gap: 10, alignItems: 'center', marginBottom: spacing.sm },
  name: { ...type.subtitle, color: colors.text, fontSize: 15 },
  handle: { ...type.meta, color: colors.textMuted, fontWeight: '500' },
  body: { ...type.body, color: colors.text, lineHeight: 22, marginBottom: spacing.sm },
  image: {
    height: 140,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  photo: {
    height: 140,
    width: '100%',
    borderRadius: radius.md,
    marginBottom: spacing.sm,
  },
  imageHint: { ...type.meta, color: colors.white, opacity: 0.85 },
  matchChip: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  matchChipLive: { borderColor: colors.live },
  matchChipText: { ...type.badge, color: colors.text, letterSpacing: 0.2, fontVariant: ['tabular-nums'] as Array<'tabular-nums'> },
  actions: {
    flexDirection: 'row',
    gap: spacing.lg,
    marginTop: 4,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  action: { paddingVertical: 4, minHeight: 32, justifyContent: 'center' },
  actionText: { ...type.meta, color: colors.textMuted },
  actionLiked: { color: colors.danger },
});

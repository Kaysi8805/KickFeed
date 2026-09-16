import { Image } from 'expo-image';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { EntityText } from '@/components/feed/EntityText';
import { Avatar } from '@/components/ui/Avatar';
import type { Post, User } from '@/data/types';
import { entityHref } from '@/lib/entityNav';
import { timeAgo } from '@/lib/format';
import { football } from '@/services/football';
import { colors, radius, spacing, type } from '@/theme';

export function PostCard({
  post,
  author,
  liked,
  onLike,
}: {
  post: Post;
  author: User;
  liked: boolean;
  onLike: () => void;
}) {
  const match = post.matchId ? football.getFixture(post.matchId) : undefined;
  const home = match ? football.getTeam(match.homeTeamId) : undefined;
  const away = match ? football.getTeam(match.awayTeamId) : undefined;

  return (
    <View style={styles.card}>
      <Pressable style={styles.head} onPress={() => router.push(`/user/${author.id}`)}>
        <Avatar initials={author.initials} color={author.avatarColor} size={42} />
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{author.name}</Text>
          <Text style={styles.handle}>
            @{author.handle} · {timeAgo(post.createdAt)}
          </Text>
        </View>
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
        <View style={styles.matchChip}>
          <Pressable onPress={() => router.push(entityHref('team', home.id))}>
            <Text style={styles.matchChipText}>{home.code}</Text>
          </Pressable>
          <Pressable onPress={() => router.push(entityHref('match', match.id))}>
            <Text style={styles.matchChipText}>
              {' '}
              {match.homeScore}-{match.awayScore}{' '}
            </Text>
          </Pressable>
          <Pressable onPress={() => router.push(entityHref('team', away.id))}>
            <Text style={styles.matchChipText}>{away.code}</Text>
          </Pressable>
        </View>
      ) : null}
      <View style={styles.actions}>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
            onLike();
          }}
          style={styles.action}
        >
          <Text style={[styles.actionText, liked && { color: colors.live }]}>{liked ? '♥ Liked' : '♡ Like'}</Text>
        </Pressable>
        {match ? (
          <Pressable onPress={() => router.push(`/match/${match.id}`)} style={styles.action}>
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
  head: { flexDirection: 'row', gap: 10, alignItems: 'center', marginBottom: spacing.sm },
  name: { ...type.subtitle, color: colors.text, fontSize: 15 },
  handle: { ...type.caption, color: colors.textDim, fontWeight: '500' },
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
  imageHint: { ...type.caption, color: colors.white, opacity: 0.85 },
  matchChip: {
    alignSelf: 'flex-start',
    backgroundColor: colors.bgElevated,
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginBottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
  },
  matchChipText: { ...type.micro, color: colors.lime },
  actions: { flexDirection: 'row', gap: spacing.lg, marginTop: 4 },
  action: { paddingVertical: 4 },
  actionText: { ...type.caption, color: colors.textMuted },
});

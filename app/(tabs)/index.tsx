import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PostCard } from '@/components/feed/PostCard';
import { MatchRow } from '@/components/match/MatchRow';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
import { useLiveTick } from '@/lib/useLiveTick';
import { useApp } from '@/services/AppProvider';
import { football } from '@/services/football';
import { colors, radius, spacing, type } from '@/theme';

export default function FeedScreen() {
  useLiveTick();
  const { currentUser, posts, users, followingIds, likedPostIds, toggleLike, unreadCount, favoriteTeamIds } =
    useApp();

  const feed = posts.filter(
    (p) => p.authorId === currentUser?.id || followingIds.includes(p.authorId),
  );
  const liveFav = football
    .getFixtures()
    .filter((f) => f.status === 'live' || f.status === 'ht')
    .filter((f) => favoriteTeamIds.includes(f.homeTeamId) || favoriteTeamIds.includes(f.awayTeamId) || favoriteTeamIds.length === 0)
    .slice(0, 6);

  return (
    <Screen padded={false}>
      <View style={styles.top}>
        <View>
          <Text style={styles.kicker}>KICKFEED</Text>
          <Text style={styles.hello}>Hey {currentUser?.name.split(' ')[0]}</Text>
        </View>
        <View style={styles.topRight}>
          <Pressable onPress={() => router.push('/notifications')} style={styles.bell}>
            <Ionicons name="notifications" size={22} color={colors.text} />
            {unreadCount > 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{unreadCount}</Text>
              </View>
            ) : null}
          </Pressable>
          <Pressable onPress={() => router.push('/compose')} style={styles.compose}>
            <Ionicons name="create" size={18} color={colors.bg} />
          </Pressable>
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {liveFav.length > 0 ? (
          <View style={styles.block}>
            <Text style={styles.section}>For you · live</Text>
            {liveFav.map((f) => (
              <MatchRow key={f.id} fixture={f} compact />
            ))}
          </View>
        ) : null}
        <Text style={styles.section}>Friends & you</Text>
        {feed.length === 0 ? (
          <EmptyState
            title="Your feed is a quiet stadium"
            body="Follow fans from the Following tab, then come back for posts about tonight’s matches."
          />
        ) : (
          feed.map((post) => {
            const author = users.find((u) => u.id === post.authorId);
            if (!author) return null;
            return (
              <PostCard
                key={post.id}
                post={post}
                author={author}
                liked={likedPostIds.includes(post.id)}
                onLike={() => toggleLike(post.id)}
              />
            );
          })
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  kicker: { ...type.micro, color: colors.lime },
  hello: { ...type.title, color: colors.text },
  topRight: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  bell: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: colors.live,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: { color: colors.white, fontSize: 9, fontWeight: '800' },
  compose: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.lime,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: 32 },
  block: { marginBottom: spacing.md },
  section: { ...type.micro, color: colors.textMuted, marginBottom: spacing.sm, marginTop: spacing.sm },
});

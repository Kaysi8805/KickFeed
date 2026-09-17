import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { CatalogStatus } from '@/components/football/CatalogStatus';
import { PostCard } from '@/components/feed/PostCard';
import { MatchRow } from '@/components/match/MatchRow';
import { SearchBarPrompt } from '@/components/search/SearchEntry';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
import { useLiveTick } from '@/lib/useLiveTick';
import { favoriteLiveFixtures, isSameMatch, sortFeedPosts } from '@/lib/matchSocial';
import { useFootballCatalog } from '@/lib/useFootballCatalog';
import { useApp } from '@/services/AppProvider';
import { football } from '@/services/football';
import { colors, spacing, type } from '@/theme';

export default function FeedScreen() {
  useLiveTick();
  const catalog = useFootballCatalog();
  const { currentUser, posts, users, followingIds, likedPostIds, toggleLike, unreadCount, favoriteTeamIds, favoritePlayerIds } =
    useApp();

  const liveFav = favoriteLiveFixtures(football, favoriteTeamIds, favoritePlayerIds);
  const aroundMatch = sortFeedPosts(
    posts.filter((p) => p.matchId && liveFav.some((f) => isSameMatch(football, p.matchId!, f.id))),
    football,
    favoriteTeamIds,
    favoritePlayerIds,
  );
  const aroundIds = new Set(aroundMatch.map((p) => p.id));
  const feed = sortFeedPosts(
    posts.filter(
      (p) =>
        !aroundIds.has(p.id) && (p.authorId === currentUser?.id || followingIds.includes(p.authorId)),
    ),
    football,
    favoriteTeamIds,
    favoritePlayerIds,
  );

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
          <Pressable onPress={() => router.push('/compose')} style={styles.compose} accessibilityLabel="New post">
            <Ionicons name="create" size={18} color={colors.bg} />
          </Pressable>
        </View>
      </View>
      <SearchBarPrompt />
      <View style={styles.statusPad}>
        <CatalogStatus />
      </View>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {liveFav.length > 0 ? (
          <View style={styles.block}>
            <Text style={styles.section}>{catalog.source === 'live' ? 'For you · live England' : 'For you · live'}</Text>
            {liveFav.map((f) => (
              <MatchRow key={f.id} fixture={f} compact />
            ))}
          </View>
        ) : null}
        {aroundMatch.length > 0 ? (
          <View style={styles.block}>
            <Text style={styles.section}>Around your matches</Text>
            {aroundMatch.map((post) => {
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
            })}
          </View>
        ) : null}
        <Text style={styles.section}>Friends & you</Text>
        {feed.length === 0 && aroundMatch.length === 0 ? (
          <EmptyState
            title="Your feed is a quiet stadium"
            body="Follow fans from Following, then come back for posts about tonight’s matches."
            actionLabel="Find fans to follow"
            onAction={() => router.push('/following')}
          />
        ) : feed.length === 0 ? (
          <EmptyState
            compact
            title="No friend posts yet"
            body="More friend posts will land here. Match chatter is up top."
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
    width: 44,
    height: 44,
    borderRadius: 22,
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
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.lime,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: 32 },
  statusPad: { paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  block: { marginBottom: spacing.md },
  section: {
    ...type.micro,
    color: colors.limeMuted,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
});

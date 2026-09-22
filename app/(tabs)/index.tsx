import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { CatalogStatus } from '@/components/football/CatalogStatus';
import { InboxButton } from '@/components/dm/InboxButton';
import { PostCard } from '@/components/feed/PostCard';
import { LiveFixtureTray } from '@/components/match/LiveFixtureTray';
import { MatchdayHero } from '@/components/match/MatchdayHero';
import { SearchBarPrompt } from '@/components/search/SearchEntry';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
import { Segmented } from '@/components/ui/Segmented';
import {
  MATCHDAY_EMPTY_NO_FAVORITES_TITLE,
  MATCHDAY_EMPTY_TITLE,
  matchdayEmptyBody,
} from '@/lib/honesty';
import {
  homeColdCopy,
  isHomeFeedCold,
  rankHomeFeed,
  viewerFromApp,
} from '@/lib/homeFeed';
import { pickMatchdayHome } from '@/lib/matchdayHome';
import { useFootballCatalog } from '@/lib/useFootballCatalog';
import { useLiveTick } from '@/lib/useLiveTick';
import { useApp } from '@/services/AppProvider';
import { football } from '@/services/football';
import { colors, spacing, type } from '@/theme';

type HomePane = 'matchday' | 'feed';

export default function HomeScreen() {
  const tick = useLiveTick();
  const catalog = useFootballCatalog();
  const {
    currentUser,
    posts,
    users,
    followingIds,
    friendIds,
    likedPostIds,
    toggleLike,
    unreadCount,
    favoriteTeamIds,
    favoriteLeagueIds,
    favoritePlayerIds,
  } = useApp();

  const matchday = useMemo(
    () =>
      pickMatchdayHome(football, {
        teamIds: favoriteTeamIds,
        leagueIds: favoriteLeagueIds,
        playerIds: favoritePlayerIds,
      }),
    [tick, catalog.lastSyncedAt, catalog.loading, favoriteTeamIds, favoriteLeagueIds, favoritePlayerIds],
  );

  const [pane, setPane] = useState<HomePane>('matchday');

  const viewer = useMemo(
    () =>
      currentUser
        ? viewerFromApp({
            currentUser,
            friendIds,
            followedIds: followingIds,
            favoriteTeamIds,
            favoriteLeagueIds,
            favoritePlayerIds,
          })
        : null,
    [currentUser, friendIds, followingIds, favoriteTeamIds, favoriteLeagueIds, favoritePlayerIds],
  );

  const homeFeed = useMemo(() => {
    if (!viewer) return [];
    return rankHomeFeed(posts, football, viewer);
  }, [posts, viewer, tick, catalog.lastSyncedAt]);

  const cold = viewer ? isHomeFeedCold(homeFeed) : false;
  const coldCopy = viewer ? homeColdCopy(viewer) : null;

  return (
    <Screen padded={false}>
      <View style={styles.top}>
        <View>
          <Text style={styles.kicker}>KICKFEED</Text>
          <Text style={styles.hello}>Hey {currentUser?.name.split(' ')[0]}</Text>
        </View>
        <View style={styles.topRight}>
          <InboxButton />
          <Pressable onPress={() => router.push('/notifications')} style={styles.bell}>
            <Ionicons name="notifications" size={22} color={colors.text} />
            {unreadCount > 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{unreadCount}</Text>
              </View>
            ) : null}
          </Pressable>
          <Pressable onPress={() => router.push('/compose')} style={styles.compose} accessibilityLabel="New post">
            <Ionicons name="create" size={18} color={colors.onCta} />
          </Pressable>
        </View>
      </View>
      <SearchBarPrompt />
      <View style={styles.statusPad}>
        <CatalogStatus />
        <Segmented
          value={pane}
          onChange={setPane}
          options={[
            { key: 'matchday', label: 'Matchday' },
            { key: 'feed', label: 'Feed' },
          ]}
        />
      </View>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {pane === 'matchday' ? (
          catalog.source === 'live' && catalog.loading && !matchday.hero && !catalog.lastSyncedAt ? (
            <EmptyState title="Loading matchday" body={`Fetching ${catalog.geoLabel} fixtures.`} />
          ) : matchday.hero ? (
            <>
              <MatchdayHero fixture={matchday.hero.fixture} why={matchday.hero.why} />
              <LiveFixtureTray title="Also on" fixtures={matchday.also.map((pick) => pick.fixture)} />
            </>
          ) : (
            <EmptyState
              title={matchday.hasFavorites ? MATCHDAY_EMPTY_TITLE : MATCHDAY_EMPTY_NO_FAVORITES_TITLE}
              body={matchdayEmptyBody(matchday.hasFavorites, catalog.source)}
              actionLabel={matchday.hasFavorites ? 'Open feed' : 'Edit favorites'}
              onAction={() =>
                matchday.hasFavorites ? setPane('feed') : router.push('/pick-favorites')
              }
            />
          )
        ) : (
          <>
            <Text style={styles.section}>Your pitch</Text>
            {cold && coldCopy ? (
              <View style={styles.cold}>
                <EmptyState title={coldCopy.title} body={coldCopy.body} />
                <View style={styles.coldActions}>
                  <Button label="Follow clubs" onPress={() => router.push('/pick-favorites')} />
                  <Button label="Find friends" variant="secondary" onPress={() => router.push('/following')} />
                </View>
              </View>
            ) : (
              homeFeed.map(({ post, reason }) => {
                const author = users.find((u) => u.id === post.authorId);
                if (!author) return null;
                return (
                  <PostCard
                    key={post.id}
                    post={post}
                    author={author}
                    liked={likedPostIds.includes(post.id)}
                    onLike={() => toggleLike(post.id)}
                    reason={reason}
                  />
                );
              })
            )}
          </>
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
  kicker: { ...type.badge, color: colors.accent },
  hello: { ...type.title, color: colors.text },
  topRight: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  bell: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
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
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: 72 },
  statusPad: { paddingHorizontal: spacing.lg, marginBottom: spacing.sm, gap: spacing.sm },
  section: {
    ...type.badge,
    color: colors.textMuted,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  cold: { gap: spacing.md },
  coldActions: { gap: spacing.sm, alignItems: 'stretch', paddingHorizontal: spacing.md },
});

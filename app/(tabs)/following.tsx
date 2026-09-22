import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { CatalogStatus } from '@/components/football/CatalogStatus';
import { Avatar } from '@/components/ui/Avatar';
import { Crest, LeagueMark } from '@/components/ui/Crest';
import { EmptyState } from '@/components/ui/EmptyState';
import { PostCard } from '@/components/feed/PostCard';
import { LiveFixtureTray } from '@/components/match/LiveFixtureTray';
import { MatchRow } from '@/components/match/MatchRow';
import { SearchButton } from '@/components/search/SearchEntry';
import { Screen } from '@/components/ui/Screen';
import { entityHref } from '@/lib/entityNav';
import { isPostVisibleToViewer } from '@/lib/homeFeed';
import { expandFavoriteIds } from '@/lib/favoriteIds';
import { favoriteLiveFixtures, sortFeedPosts } from '@/lib/matchSocial';
import { useFootballCatalog } from '@/lib/useFootballCatalog';
import { useApp } from '@/services/AppProvider';
import { football } from '@/services/football';
import { colors, radius, spacing, type } from '@/theme';

export default function FavoritesScreen() {
  const catalog = useFootballCatalog();
  const {
    users,
    currentUser,
    followingIds,
    friendIds,
    follow,
    unfollow,
    favoriteTeamIds,
    favoriteLeagueIds,
    favoritePlayerIds,
    toggleFavoritePlayer,
    posts,
    likedPostIds,
    toggleLike,
    blockedUserIds,
  } = useApp();
  const suggested = users.filter(
    (u) => u.id !== currentUser?.id && !followingIds.includes(u.id) && !blockedUserIds.includes(u.id),
  );
  const following = users.filter((u) => followingIds.includes(u.id));
  const teams = favoriteTeamIds.map((id) => football.getTeam(id)).filter(Boolean);
  const leagues = favoriteLeagueIds.map((id) => football.getLeague(id)).filter(Boolean);
  const players = favoritePlayerIds.map((id) => football.getPlayer(id)).filter(Boolean);
  const followedTeamIds = expandFavoriteIds(
    [
      ...favoriteTeamIds,
      ...players.map((p) => p?.teamId).filter((id): id is string => !!id),
    ],
    'team',
  );
  const followedLeagueIds = expandFavoriteIds(favoriteLeagueIds, 'league');

  const nextMatches = football
    .getFixtures()
    .filter(
      (f) =>
        followedTeamIds.has(f.homeTeamId) ||
        followedTeamIds.has(f.awayTeamId) ||
        followedLeagueIds.has(f.leagueId),
    )
    .filter((f) => f.status !== 'finished')
    .slice(0, 8);
  const liveFav = favoriteLiveFixtures(football, favoriteTeamIds, favoritePlayerIds);
  const matchPosts = sortFeedPosts(
    posts.filter(
      (p) =>
        !!p.matchId &&
        !!currentUser &&
        (p.authorId === currentUser.id || followingIds.includes(p.authorId)) &&
        isPostVisibleToViewer(p, currentUser.id, friendIds),
    ),
    football,
    favoriteTeamIds,
    favoritePlayerIds,
  ).slice(0, 8);

  return (
    <Screen padded={false}>
      <View style={styles.top}>
        <Text style={styles.title}>Following</Text>
        <View style={styles.topRight}>
          <SearchButton />
          <Pressable
            onPress={() => router.push('/pick-favorites')}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Edit favorites"
            style={styles.editBtn}
          >
            <Text style={styles.link}>Edit favorites</Text>
          </Pressable>
        </View>
      </View>
      <View style={styles.statusPad}>
        <CatalogStatus />
      </View>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.section}>Favorite clubs</Text>
        {teams.length === 0 ? (
          <EmptyState
            compact
            title="No clubs yet"
            body="Star clubs so live scores pin on Home and Following."
            actionLabel="Edit favorites"
            onAction={() => router.push('/pick-favorites')}
          />
        ) : (
          <View style={styles.chips}>
            {teams.map((t) =>
              t ? (
                <Pressable key={t.id} onPress={() => router.push(entityHref('team', t.id))} style={styles.chip}>
                  <Crest team={t} size={28} />
                  <Text style={styles.chipText}>{t.shortName}</Text>
                </Pressable>
              ) : null,
            )}
          </View>
        )}

        <Text style={styles.section}>Favorite players</Text>
        {players.length === 0 ? (
          <EmptyState
            compact
            title="No players yet"
            body="Search a footballer and tap Follow — they’ll land here."
            actionLabel="Search players"
            onAction={() => router.push('/search')}
          />
        ) : (
          <View style={styles.chips}>
            {players.map((p) =>
              p ? (
                <Pressable key={p.id} onPress={() => router.push(entityHref('player', p.id))} style={styles.chip}>
                  <View style={styles.num}>
                    <Text style={styles.numText}>{p.number}</Text>
                  </View>
                  <Text style={styles.chipText}>{p.shortName}</Text>
                  <Pressable
                    onPress={() => toggleFavoritePlayer(p.id)}
                    hitSlop={12}
                    accessibilityRole="button"
                    accessibilityLabel={`Unfavorite ${p.shortName}`}
                  >
                    <Text style={styles.star}>★</Text>
                  </Pressable>
                </Pressable>
              ) : null,
            )}
          </View>
        )}

        <Text style={styles.section}>Favorite competitions</Text>
        {leagues.length === 0 ? (
          <EmptyState
            compact
            title="No competitions yet"
            body="Add leagues so standings and fixtures bubble up first."
            actionLabel="Edit favorites"
            onAction={() => router.push('/pick-favorites')}
          />
        ) : (
          leagues.map((l) =>
            l ? (
              <Pressable key={l.id} onPress={() => router.push(entityHref('league', l.id))} style={styles.row}>
                <LeagueMark league={l} size={28} />
                <Text style={[styles.rowTitle, { flex: 1 }]}>{l.name}</Text>
                <Text style={styles.chev}>→</Text>
              </Pressable>
            ) : null,
          )
        )}

        {liveFav.length === 0 ? (
          <>
            <Text style={styles.section}>Live for you</Text>
            <EmptyState
              compact
              title="Nothing live for you"
              body={
                catalog.source === 'live'
                  ? 'Favorite a live club or player (England, Slovakia, or La Liga) to pin fixtures here.'
                  : 'Favorite a club or player to pin their live matches here.'
              }
            />
          </>
        ) : (
          <LiveFixtureTray title="Live for you" fixtures={liveFav} />
        )}

        <Text style={styles.section}>Coming up for you</Text>
        {nextMatches.length === 0 ? (
          <EmptyState
            compact
            title="Nothing coming up"
            body={
              catalog.source === 'live'
                ? 'Favorite a live club, player, or league (England, Slovakia, or La Liga) to pin their next fixtures here.'
                : 'Favorite a club, player, or competition to pin their next matches here.'
            }
          />
        ) : (
          nextMatches.map((f) => <MatchRow key={f.id} fixture={f} compact />)
        )}

        <Text style={styles.section}>Match posts</Text>
        {matchPosts.length === 0 ? (
          <EmptyState
            compact
            title="No match posts yet"
            body="Attach a fixture when you post — those land here for people you follow."
          />
        ) : (
          matchPosts.map((post) => {
            const author = users.find((u) => u.id === post.authorId);
            if (!author) return null;
            return (
              <PostCard
                key={post.id}
                post={post}
                author={author}
                liked={likedPostIds.includes(post.id)}
                onLike={() => toggleLike(post.id)}
                compact
              />
            );
          })
        )}

        <Text style={styles.section}>People you follow</Text>
        {following.length === 0 ? (
          <EmptyState
            compact
            title="Not following anyone"
            body="Follow demo fans below to fill your social feed."
          />
        ) : (
          following.map((u) => (
            <Pressable key={u.id} onPress={() => router.push(entityHref('user', u.id))} style={styles.person}>
              <Avatar initials={u.initials} color={u.avatarColor} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{u.name}</Text>
                <Text style={styles.muted}>@{u.handle}</Text>
              </View>
              <Pressable
                onPress={() => unfollow(u.id)}
                accessibilityRole="button"
                accessibilityLabel={`Unfollow ${u.name}`}
                style={styles.ghost}
              >
                <Text style={styles.ghostText}>Following</Text>
              </Pressable>
            </Pressable>
          ))
        )}

        <Text style={styles.section}>Suggested fans</Text>
        {suggested.length === 0 ? (
          <EmptyState compact title="You’re following everyone" body="No more demo fans to suggest right now." />
        ) : (
          suggested.map((u) => (
            <Pressable key={u.id} onPress={() => router.push(entityHref('user', u.id))} style={styles.person}>
              <Avatar initials={u.initials} color={u.avatarColor} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{u.name}</Text>
                <Text style={styles.muted} numberOfLines={1}>
                  {u.bio}
                </Text>
              </View>
              <Pressable
                onPress={() => follow(u.id)}
                accessibilityRole="button"
                accessibilityLabel={`Follow ${u.name}`}
                style={styles.solid}
              >
                <Text style={styles.solidText}>Follow</Text>
              </Pressable>
            </Pressable>
          ))
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
  title: { ...type.title, color: colors.text },
  statusPad: { paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  editBtn: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  link: { ...type.caption, color: colors.lime },
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: 40 },
  section: {
    ...type.micro,
    color: colors.limeMuted,
    textTransform: 'uppercase',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surface,
    padding: 8,
    paddingRight: 12,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipText: { ...type.caption, color: colors.text },
  num: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numText: { ...type.caption, color: colors.lime, fontSize: 11 },
  star: { color: colors.gold, fontSize: 14 },
  muted: { ...type.caption, color: colors.textMuted, fontWeight: '500' },
  row: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowTitle: { ...type.subtitle, fontSize: 15, color: colors.text },
  chev: { color: colors.limeMuted },
  person: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ghost: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 44,
    justifyContent: 'center',
  },
  ghostText: { ...type.caption, color: colors.textMuted },
  solid: {
    backgroundColor: colors.lime,
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minHeight: 44,
    justifyContent: 'center',
  },
  solidText: { ...type.caption, color: colors.bg, fontWeight: '800' },
});

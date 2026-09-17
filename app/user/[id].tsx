import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PostCard } from '@/components/feed/PostCard';
import { Avatar } from '@/components/ui/Avatar';
import { Crest } from '@/components/ui/Crest';
import { EmptyState } from '@/components/ui/EmptyState';
import { HeaderBar } from '@/components/ui/HeaderBar';
import { Screen } from '@/components/ui/Screen';
import { useApp } from '@/services/AppProvider';
import { football } from '@/services/football';
import { fetchRemoteProfileById } from '@/services/leaderboard';
import { colors, radius, spacing, type } from '@/theme';
import { entityBackHref, entityHref } from '@/lib/entityNav';
import { safeBack } from '@/lib/navBack';
import { routeId } from '@/lib/routeParams';
import { isPersistedUserId, isSupabaseUserId, userFromProfile } from '@/lib/userIdentity';
import type { User } from '@/data/types';

export default function UserScreen() {
  const { id: rawId } = useLocalSearchParams<{ id: string | string[] }>();
  const id = routeId(rawId);
  const { users, currentUser, followingIds, follow, unfollow, posts, likedPostIds, toggleLike, followerCount, rememberProfiles } =
    useApp();
  const fromState = id ? users.find((u) => u.id === id) : undefined;
  const [fetched, setFetched] = useState<User | undefined>();

  useEffect(() => {
    if (!id || fromState || !isPersistedUserId(id)) return;
    let cancelled = false;
    void (async () => {
      const remote = await fetchRemoteProfileById(id);
      if (cancelled || !remote) return;
      setFetched(remote);
      rememberProfiles([remote]);
    })();
    return () => {
      cancelled = true;
    };
  }, [fromState, id, rememberProfiles]);

  const user =
    fromState ?? fetched ?? (id && isPersistedUserId(id) ? userFromProfile(id, undefined) : undefined);

  if (!id || !user) {
    return (
      <Screen>
        <HeaderBar title="Fan" onBack={() => safeBack(entityBackHref('user', id))} />
        <EmptyState title="Unknown profile" body="This fan isn’t on KickFeed." />
      </Screen>
    );
  }

  const mine = currentUser?.id === user.id;
  const following = followingIds.includes(user.id);
  const userPosts = posts.filter((p) => p.authorId === user.id);
  const teams = user.favoriteTeamIds.map((tid) => football.getTeam(tid)).filter(Boolean);

  return (
    <Screen padded={false}>
      <View style={styles.pad}>
        <HeaderBar title={user.name} onBack={() => safeBack(entityBackHref('user', user.id))} />
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.head}>
          <Avatar initials={user.initials} color={user.avatarColor} size={68} />
          <Text style={styles.name}>{user.name}</Text>
          <Text style={styles.handle}>@{user.handle}</Text>
          {user.bio ? <Text style={styles.bio}>{user.bio}</Text> : null}
          <Text style={styles.counts}>
            {followerCount(user.id)} followers · {userPosts.length} posts
          </Text>
          <View style={styles.crests}>
            {teams.map((t) =>
              t ? (
                <Pressable key={t.id} onPress={() => router.push(entityHref('team', t.id))}>
                  <Crest team={t} size={28} />
                </Pressable>
              ) : null,
            )}
          </View>
          {!mine ? (
            <Pressable
              onPress={() => (following ? unfollow(user.id) : follow(user.id))}
              style={[styles.follow, following && styles.unfollow]}
            >
              <Text style={[styles.followText, following && styles.unfollowText]}>
                {following ? 'Following' : 'Follow'}
              </Text>
            </Pressable>
          ) : null}
        </View>
        {userPosts.length === 0 ? (
          <EmptyState
            title="No posts on this device"
            body={
              isSupabaseUserId(user.id)
                ? 'This fan is on the KickFeed ranking table. Feed posts stay local to each install.'
                : 'This fan hasn’t posted in the demo feed.'
            }
          />
        ) : (
          userPosts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              author={user}
              liked={likedPostIds.includes(post.id)}
              onLike={() => toggleLike(post.id)}
            />
          ))
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: spacing.lg },
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: 40 },
  head: { alignItems: 'center', marginBottom: spacing.xl },
  name: { ...type.title, color: colors.text, marginTop: spacing.sm },
  handle: { ...type.caption, color: colors.limeMuted },
  bio: { ...type.body, color: colors.textMuted, textAlign: 'center', marginTop: spacing.sm, lineHeight: 22 },
  counts: { ...type.caption, color: colors.textDim, marginTop: spacing.sm, fontWeight: '500' },
  crests: { flexDirection: 'row', gap: 8, marginTop: spacing.md },
  follow: {
    marginTop: spacing.lg,
    backgroundColor: colors.lime,
    paddingHorizontal: 22,
    paddingVertical: 8,
    borderRadius: radius.full,
  },
  followText: { ...type.caption, color: colors.bg, fontWeight: '800' },
  unfollow: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  unfollowText: { color: colors.text },
});

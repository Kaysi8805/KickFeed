import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PostCard } from '@/components/feed/PostCard';
import { Avatar } from '@/components/ui/Avatar';
import { Crest } from '@/components/ui/Crest';
import { Screen } from '@/components/ui/Screen';
import { useApp } from '@/services/AppProvider';
import { football } from '@/services/football';
import { colors, radius, spacing, type } from '@/theme';

export default function ProfileScreen() {
  const { currentUser, posts, users, likedPostIds, toggleLike, followingIds, followerCount, signOut } = useApp();
  if (!currentUser) return null;
  const mine = posts.filter((p) => p.authorId === currentUser.id);
  const teams = currentUser.favoriteTeamIds.map((id) => football.getTeam(id)).filter(Boolean);

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.cover}>
          <View style={styles.stripe} />
        </View>
        <View style={styles.identity}>
          <Avatar initials={currentUser.initials} color={currentUser.avatarColor} size={72} />
          <Text style={styles.name}>{currentUser.name}</Text>
          <Text style={styles.handle}>@{currentUser.handle}</Text>
          <Text style={styles.bio}>{currentUser.bio}</Text>
          <View style={styles.stats}>
            <View style={styles.stat}>
              <Text style={styles.statN}>{mine.length}</Text>
              <Text style={styles.statL}>Posts</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statN}>{followingIds.length}</Text>
              <Text style={styles.statL}>Following</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statN}>{followerCount(currentUser.id)}</Text>
              <Text style={styles.statL}>Followers</Text>
            </View>
          </View>
          <View style={styles.crestRow}>
            {teams.map((t) => (t ? <Crest key={t.id} team={t} size={32} /> : null))}
          </View>
          <View style={styles.actions}>
            <Pressable style={styles.btn} onPress={() => router.push('/edit-profile')}>
              <Text style={styles.btnText}>Edit profile</Text>
            </Pressable>
            <Pressable style={styles.btn} onPress={() => router.push('/pick-favorites')}>
              <Text style={styles.btnText}>Favorites</Text>
            </Pressable>
          </View>
        </View>
        <Text style={styles.section}>Your posts</Text>
        {mine.length === 0 ? (
          <Text style={styles.muted}>You haven’t posted yet. Tap compose on Home.</Text>
        ) : (
          mine.map((post) => {
            const author = users.find((u) => u.id === post.authorId) ?? currentUser;
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
        <Pressable style={styles.switcher} onPress={signOut}>
          <Text style={styles.switcherText}>Switch demo user</Text>
        </Pressable>
        <Text style={styles.demoNote}>Demo mode only — email/OAuth stubs are in services/auth.ts</Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: 48 },
  cover: {
    height: 96,
    marginHorizontal: -spacing.lg,
    backgroundColor: colors.pitch,
    overflow: 'hidden',
  },
  stripe: {
    position: 'absolute',
    right: -20,
    top: 20,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: colors.lime,
    opacity: 0.25,
  },
  identity: { alignItems: 'center', marginTop: -36, marginBottom: spacing.lg },
  name: { ...type.title, color: colors.text, marginTop: spacing.sm },
  handle: { ...type.caption, color: colors.limeMuted, marginTop: 2 },
  bio: { ...type.body, color: colors.textMuted, textAlign: 'center', marginTop: spacing.sm, lineHeight: 22 },
  stats: { flexDirection: 'row', gap: 28, marginTop: spacing.lg },
  stat: { alignItems: 'center' },
  statN: { ...type.subtitle, color: colors.text },
  statL: { ...type.micro, color: colors.textDim },
  crestRow: { flexDirection: 'row', gap: 8, marginTop: spacing.md },
  actions: { flexDirection: 'row', gap: 8, marginTop: spacing.lg },
  btn: {
    backgroundColor: colors.surface,
    borderRadius: radius.full,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  btnText: { ...type.caption, color: colors.text },
  section: { ...type.micro, color: colors.textMuted, marginBottom: spacing.sm },
  muted: { ...type.body, color: colors.textMuted, marginBottom: spacing.lg },
  switcher: {
    marginTop: spacing.xl,
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  switcherText: { ...type.caption, color: colors.lime },
  demoNote: { ...type.caption, color: colors.textDim, textAlign: 'center', marginTop: spacing.sm, fontWeight: '500' },
});

import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/ui/Avatar';
import { Crest } from '@/components/ui/Crest';
import { EmptyState } from '@/components/ui/EmptyState';
import { MatchRow } from '@/components/match/MatchRow';
import { Screen } from '@/components/ui/Screen';
import { useApp } from '@/services/AppProvider';
import { football } from '@/services/football';
import { colors, radius, spacing, type } from '@/theme';

export default function FavoritesScreen() {
  const { users, currentUser, followingIds, follow, unfollow, favoriteTeamIds, favoriteLeagueIds } = useApp();
  const suggested = users.filter((u) => u.id !== currentUser?.id && !followingIds.includes(u.id));
  const following = users.filter((u) => followingIds.includes(u.id));
  const teams = favoriteTeamIds.map((id) => football.getTeam(id)).filter(Boolean);
  const leagues = favoriteLeagueIds.map((id) => football.getLeague(id)).filter(Boolean);

  const nextMatches = football
    .getFixtures()
    .filter(
      (f) =>
        favoriteTeamIds.includes(f.homeTeamId) ||
        favoriteTeamIds.includes(f.awayTeamId) ||
        favoriteLeagueIds.includes(f.leagueId),
    )
    .filter((f) => f.status !== 'finished')
    .slice(0, 8);

  return (
    <Screen padded={false}>
      <View style={styles.top}>
        <Text style={styles.title}>Following</Text>
        <Pressable onPress={() => router.push('/pick-favorites')}>
          <Text style={styles.link}>Edit favorites</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.section}>Favorite clubs</Text>
        {teams.length === 0 ? (
          <EmptyState title="No clubs yet" body="Star teams to personalize live scores on Home." />
        ) : (
          <View style={styles.chips}>
            {teams.map((t) =>
              t ? (
                <View key={t.id} style={styles.chip}>
                  <Crest team={t} size={28} />
                  <Text style={styles.chipText}>{t.shortName}</Text>
                </View>
              ) : null,
            )}
          </View>
        )}

        <Text style={styles.section}>Favorite competitions</Text>
        {leagues.length === 0 ? (
          <Text style={styles.muted}>Add leagues so standings and fixtures bubble up first.</Text>
        ) : (
          leagues.map((l) =>
            l ? (
              <Pressable key={l.id} onPress={() => router.push(`/league/${l.id}`)} style={styles.row}>
                <Text style={styles.rowTitle}>{l.name}</Text>
                <Text style={styles.chev}>→</Text>
              </Pressable>
            ) : null,
          )
        )}

        <Text style={styles.section}>Coming up for you</Text>
        {nextMatches.length === 0 ? (
          <Text style={styles.muted}>Favorite a team to pin their next matches here.</Text>
        ) : (
          nextMatches.map((f) => <MatchRow key={f.id} fixture={f} compact />)
        )}

        <Text style={styles.section}>People you follow</Text>
        {following.length === 0 ? (
          <Text style={styles.muted}>Follow demo fans to fill your social feed.</Text>
        ) : (
          following.map((u) => (
            <Pressable key={u.id} onPress={() => router.push(`/user/${u.id}`)} style={styles.person}>
              <Avatar initials={u.initials} color={u.avatarColor} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{u.name}</Text>
                <Text style={styles.muted}>@{u.handle}</Text>
              </View>
              <Pressable onPress={() => unfollow(u.id)} style={styles.ghost}>
                <Text style={styles.ghostText}>Following</Text>
              </Pressable>
            </Pressable>
          ))
        )}

        <Text style={styles.section}>Suggested fans</Text>
        {suggested.map((u) => (
          <Pressable key={u.id} onPress={() => router.push(`/user/${u.id}`)} style={styles.person}>
            <Avatar initials={u.initials} color={u.avatarColor} />
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{u.name}</Text>
              <Text style={styles.muted} numberOfLines={1}>
                {u.bio}
              </Text>
            </View>
            <Pressable onPress={() => follow(u.id)} style={styles.solid}>
              <Text style={styles.solidText}>Follow</Text>
            </Pressable>
          </Pressable>
        ))}
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
  link: { ...type.caption, color: colors.lime },
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: 40 },
  section: { ...type.micro, color: colors.textMuted, marginTop: spacing.lg, marginBottom: spacing.sm },
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
  muted: { ...type.caption, color: colors.textMuted, fontWeight: '500' },
  row: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
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
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  ghostText: { ...type.caption, color: colors.textMuted },
  solid: {
    backgroundColor: colors.lime,
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  solidText: { ...type.caption, color: colors.bg, fontWeight: '800' },
});

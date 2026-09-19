import { router } from 'expo-router';
import { type ReactNode, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Avatar } from '@/components/ui/Avatar';
import { Crest } from '@/components/ui/Crest';
import { EmptyState } from '@/components/ui/EmptyState';
import { HeaderBar } from '@/components/ui/HeaderBar';
import { Screen } from '@/components/ui/Screen';
import type { League, Player, Team, User } from '@/data/types';
import { entityHref } from '@/lib/entityNav';
import { safeBack } from '@/lib/navBack';
import { searchEntities, searchHasHits } from '@/lib/search';
import { useFootballCatalog } from '@/lib/useFootballCatalog';
import { useApp } from '@/services/AppProvider';
import { football } from '@/services/football';
import { colors, radius, spacing, type } from '@/theme';

export default function SearchScreen() {
  useFootballCatalog();
  const { users, blockedUserIds, currentUser, canMessage } = useApp();
  const [q, setQ] = useState('');
  const searchableUsers = useMemo(
    () => users.filter((u) => !blockedUserIds.includes(u.id)),
    [users, blockedUserIds],
  );
  const results = useMemo(() => searchEntities(q, searchableUsers), [q, searchableUsers]);
  const needle = q.trim();
  const ready = needle.length >= 2;
  const hits = searchHasHits(results);

  return (
    <Screen padded={false}>
      <View style={styles.pad}>
        <HeaderBar title="Search" onBack={() => safeBack('/')} />
        <TextInput
          autoFocus
          value={q}
          onChangeText={setQ}
          placeholder="Salah, Arsenal, Premier…"
          placeholderTextColor={colors.textDim}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel="Search query"
          style={styles.input}
        />
      </View>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {!ready ? (
          <EmptyState
            title="Find clubs, players, leagues, fans"
            body="Type at least two letters. Try Salah, Arsenal, Premier, or a demo handle — results open the same entity pages as the rest of the app."
          />
        ) : !hits ? (
          <EmptyState
            title={`No results for “${needle}”`}
            body="Nothing matched a club, player, competition, or demo fan. Check the spelling or try a shorter name."
          />
        ) : (
          <>
            {results.teams.length > 0 ? (
              <Section title="Clubs">
                {results.teams.map((team) => (
                  <TeamHit key={team.id} team={team} />
                ))}
              </Section>
            ) : null}
            {results.players.length > 0 ? (
              <Section title="Players">
                {results.players.map((player) => (
                  <PlayerHit key={player.id} player={player} />
                ))}
              </Section>
            ) : null}
            {results.leagues.length > 0 ? (
              <Section title="Competitions">
                {results.leagues.map((league) => (
                  <LeagueHit key={league.id} league={league} />
                ))}
              </Section>
            ) : null}
            {results.users.length > 0 ? (
              <Section title="Fans">
                {results.users.map((user) => (
                  <UserHit
                    key={user.id}
                    user={user}
                    canMessage={!!currentUser && currentUser.id !== user.id && canMessage(user.id)}
                  />
                ))}
              </Section>
            ) : null}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function TeamHit({ team }: { team: Team }) {
  const country = football.getCountry(team.countryId);
  return (
    <Pressable
      onPress={() => router.push(entityHref('team', team.id))}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <Crest team={team} size={32} />
      <View style={styles.meta}>
        <Text style={styles.title}>{team.name}</Text>
        <Text style={styles.sub}>
          {country?.flag} {country?.name} · {team.code}
        </Text>
      </View>
      <Text style={styles.chev}>→</Text>
    </Pressable>
  );
}

function PlayerHit({ player }: { player: Player }) {
  const team = football.getTeam(player.teamId);
  return (
    <Pressable
      onPress={() => router.push(entityHref('player', player.id))}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.num}>
        <Text style={styles.numText}>{player.number}</Text>
      </View>
      <View style={styles.meta}>
        <Text style={styles.title}>{player.name}</Text>
        <Text style={styles.sub}>
          {player.pos} · {team?.shortName ?? player.teamId} · {player.nationality}
        </Text>
      </View>
      <Text style={styles.chev}>→</Text>
    </Pressable>
  );
}

function LeagueHit({ league }: { league: League }) {
  const country = football.getCountry(league.countryId);
  return (
    <Pressable
      onPress={() => router.push(entityHref('league', league.id))}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.meta}>
        <Text style={styles.title}>{league.name}</Text>
        <Text style={styles.sub}>
          {country?.flag} {country?.name} · {league.shortName}
        </Text>
      </View>
      <Text style={styles.chev}>→</Text>
    </Pressable>
  );
}

function UserHit({ user, canMessage }: { user: User; canMessage: boolean }) {
  return (
    <Pressable
      onPress={() => router.push(entityHref('user', user.id))}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <Avatar initials={user.initials} color={user.avatarColor} size={32} />
      <View style={styles.meta}>
        <Text style={styles.title}>{user.name}</Text>
        <Text style={styles.sub}>@{user.handle}</Text>
      </View>
      {canMessage ? (
        <Pressable
          onPress={() => router.push(`/messages/${user.id}`)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Message ${user.name}`}
          style={styles.messageBtn}
        >
          <Text style={styles.messageText}>Message</Text>
        </Pressable>
      ) : (
        <Text style={styles.chev}>→</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: spacing.lg },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    minHeight: 44,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: 40 },
  section: { marginBottom: spacing.md },
  sectionTitle: {
    ...type.micro,
    color: colors.limeMuted,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: { opacity: 0.86 },
  meta: { flex: 1 },
  title: { ...type.subtitle, fontSize: 15, color: colors.text },
  sub: { ...type.caption, color: colors.textMuted, fontWeight: '500', marginTop: 2 },
  chev: { color: colors.limeMuted },
  messageBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 44,
    justifyContent: 'center',
  },
  messageText: { ...type.caption, color: colors.lime },
  num: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numText: { ...type.caption, color: colors.lime },
});

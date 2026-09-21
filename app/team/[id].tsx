import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PlayerRow } from '@/components/entity/PlayerRow';
import { MatchRow } from '@/components/match/MatchRow';
import { Crest, LeagueMark } from '@/components/ui/Crest';
import { EmptyState } from '@/components/ui/EmptyState';
import { HeaderBar } from '@/components/ui/HeaderBar';
import { Screen } from '@/components/ui/Screen';
import type { Player, PlayerPosition } from '@/data/types';
import { entityBackHref, entityHref } from '@/lib/entityNav';
import { safeBack } from '@/lib/navBack';
import { routeId } from '@/lib/routeParams';
import { isFavoriteId } from '@/lib/favoriteIds';
import { useFootballCatalog } from '@/lib/useFootballCatalog';
import { useApp } from '@/services/AppProvider';
import { football, primaryLeague } from '@/services/football';
import { colors, radius, spacing, type } from '@/theme';

const POS_ORDER: PlayerPosition[] = ['GK', 'DF', 'MF', 'FW'];
const POS_LABEL: Record<PlayerPosition, string> = {
  GK: 'Goalkeepers',
  DF: 'Defenders',
  MF: 'Midfielders',
  FW: 'Forwards',
};

export default function TeamDetailScreen() {
  const { id: rawId } = useLocalSearchParams<{ id: string | string[] }>();
  const id = routeId(rawId);
  const catalog = useFootballCatalog();
  const { favoriteTeamIds, toggleFavoriteTeam } = useApp();
  const team = id ? football.getTeam(id) : undefined;

  useEffect(() => {
    if (id) void football.ensureSquad(id);
  }, [id]);

  if (!team) {
    return (
      <Screen>
        <HeaderBar title="Club" onBack={() => safeBack(entityBackHref('team', id))} />
        <EmptyState
          title="Unknown club"
          body={
            catalog.source === 'live'
              ? 'This team isn’t in the live catalog (England, Slovakia, La Liga). Demo posts still link mock clubs by name.'
              : 'This team isn’t in the mock catalog.'
          }
        />
      </Screen>
    );
  }

  const country = football.getCountry(team.countryId);
  const competitions = football.getTeamCompetitions(team.id);
  const league = primaryLeague(team.id);
  const table = league ? football.getStandings(league.id) : [];
  const place = table.findIndex((row) => row.teamId === team.id);
  const row = place >= 0 ? table[place] : undefined;
  const squad = football.getSquad(team.id);
  const fixtures = football.getFixtures({ teamId: team.id });
  const upcoming = fixtures.filter((f) => f.status === 'upcoming').slice(0, 5);
  const recent = fixtures
    .filter((f) => f.status !== 'upcoming')
    .slice(-5)
    .reverse();
  const fav = isFavoriteId(favoriteTeamIds, team.id, 'team');

  const grouped = POS_ORDER.map((pos) => ({
    pos,
    players: squad.filter((p) => p.pos === pos),
  })).filter((g) => g.players.length > 0);

  return (
    <Screen padded={false}>
      <View style={styles.pad}>
        <HeaderBar
          title={team.code}
          onBack={() => safeBack(entityBackHref('team', team.id))}
          right={
            <Pressable onPress={() => toggleFavoriteTeam(team.id)}>
              <Text style={styles.star}>{fav ? '★ Favorited' : '☆ Favorite'}</Text>
            </Pressable>
          }
        />
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.hero}>
          <Crest team={team} size={72} />
          <Text style={styles.name}>{team.name}</Text>
          <Text style={styles.meta}>
            {country?.flag} {country?.name}
          </Text>
          {row && league ? (
            <Pressable onPress={() => router.push(entityHref('league', league.id))} style={styles.standing}>
              <Text style={styles.standingText}>
                {league.shortName} · {place + 1}
                {ordinal(place + 1)} · {row.points} pts · GD {row.gf - row.ga}
              </Text>
            </Pressable>
          ) : null}
          <View style={styles.chips}>
            {competitions.map((l) => (
              <Pressable key={l.id} onPress={() => router.push(entityHref('league', l.id))} style={styles.chip}>
                <LeagueMark league={l} size={16} />
                <Text style={styles.chipText}>{l.shortName}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <Text style={styles.section}>Recent</Text>
        {recent.length === 0 ? (
          <Text style={styles.muted}>
            {catalog.source === 'live' ? 'No recent fixtures in the cached live window.' : 'No recent mock fixtures for this club.'}
          </Text>
        ) : (
          recent.map((f) => <MatchRow key={f.id} fixture={f} compact />)
        )}

        <Text style={styles.section}>Upcoming</Text>
        {upcoming.length === 0 ? (
          <Text style={styles.muted}>
            {catalog.source === 'live' ? 'No upcoming fixtures in the next three weeks of cache.' : 'No upcoming mock fixtures seeded.'}
          </Text>
        ) : (
          upcoming.map((f) => <MatchRow key={f.id} fixture={f} compact />)
        )}

        <Text style={styles.section}>Squad</Text>
        {grouped.length === 0 ? (
          <Text style={styles.muted}>
            {catalog.source === 'live'
              ? catalog.loading
                ? 'Loading squad…'
                : 'Squad isn’t cached yet (free-tier quota). Standings and fixtures still work.'
              : 'No squad listed for this club.'}
          </Text>
        ) : (
          grouped.map((g) => (
            <View key={g.pos} style={styles.group}>
              <Text style={styles.groupTitle}>{POS_LABEL[g.pos]}</Text>
              {g.players.map((p: Player) => (
                <PlayerRow key={p.id} player={p} />
              ))}
            </View>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}

function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return 'th';
  switch (n % 10) {
    case 1:
      return 'st';
    case 2:
      return 'nd';
    case 3:
      return 'rd';
    default:
      return 'th';
  }
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: spacing.lg },
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: 40 },
  hero: { alignItems: 'center', marginBottom: spacing.lg, gap: 6 },
  name: { ...type.title, color: colors.text, textAlign: 'center' },
  meta: { ...type.caption, color: colors.textMuted, fontWeight: '500' },
  star: { ...type.caption, color: colors.gold },
  standing: {
    marginTop: 6,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.pitch,
  },
  standingText: { ...type.caption, color: colors.lime },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 8 },
  chip: {
    backgroundColor: colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chipText: { ...type.micro, color: colors.limeMuted },
  section: { ...type.micro, color: colors.textMuted, marginTop: spacing.lg, marginBottom: spacing.sm },
  muted: { ...type.caption, color: colors.textMuted, fontWeight: '500', marginBottom: spacing.sm },
  group: { marginBottom: spacing.sm },
  groupTitle: { ...type.caption, color: colors.textDim, marginBottom: 6 },
});

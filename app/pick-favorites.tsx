import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Crest, LeagueMark } from '@/components/ui/Crest';
import { HeaderBar } from '@/components/ui/HeaderBar';
import { Screen } from '@/components/ui/Screen';
import { entityHref } from '@/lib/entityNav';
import { isFavoriteId } from '@/lib/favoriteIds';
import { searchEntities } from '@/lib/search';
import { useFootballCatalog } from '@/lib/useFootballCatalog';
import { useApp } from '@/services/AppProvider';
import { football } from '@/services/football';
import { colors, radius, spacing, type } from '@/theme';

export default function PickFavoritesScreen() {
  const catalog = useFootballCatalog();
  const {
    favoriteTeamIds,
    favoriteLeagueIds,
    favoritePlayerIds,
    toggleFavoriteTeam,
    toggleFavoriteLeague,
    toggleFavoritePlayer,
  } = useApp();
  const [q, setQ] = useState('');
  const teams = football.getTeams();
  const leagues = football.getLeagues();
  const hintIds = ['ars', 'liv', 'mci', 'rma', 'bar', 'slovan', 'int', 'bay', 'psg', 'fla', 'mia'];

  const teamResults = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const hinted = hintIds.map((id) => football.getTeam(id)).filter((t): t is NonNullable<typeof t> => !!t);
    const liveEngland = football.getFeaturedLeagues().flatMap((l) => football.getTeams(l.id));
    const list = needle
      ? teams.filter((t) => t.name.toLowerCase().includes(needle) || t.code.toLowerCase().includes(needle))
      : hinted.concat(liveEngland).concat(teams.filter((t) => isFavoriteId(favoriteTeamIds, t.id, 'team')));
    const seen = new Set<string>();
    return list.filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true))).slice(0, 24);
  }, [catalog.lastSyncedAt, favoriteTeamIds, q, teams]);

  const playerResults = useMemo(() => {
    const needle = q.trim();
    if (needle.length >= 2) return searchEntities(needle, []).players;
    return favoritePlayerIds.map((id) => football.getPlayer(id)).filter((p): p is NonNullable<typeof p> => !!p);
  }, [favoritePlayerIds, q]);

  return (
    <Screen padded={false}>
      <View style={styles.pad}>
        <HeaderBar title="Favorites" onBack={() => router.back()} />
        <TextInput
          placeholder="Search clubs or players"
          placeholderTextColor={colors.textDim}
          value={q}
          onChangeText={setQ}
          style={styles.search}
        />
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.section}>Competitions</Text>
        {leagues
          .filter((l) => l.featured || favoriteLeagueIds.includes(l.id))
          .map((l) => {
            const on = isFavoriteId(favoriteLeagueIds, l.id, 'league');
            return (
              <View key={l.id} style={[styles.row, on && styles.on]}>
                <Pressable
                  onPress={() => router.push(entityHref('league', l.id))}
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}
                >
                  <LeagueMark league={l} size={28} />
                  <Text style={[styles.name, { flex: 1 }]}>{l.name}</Text>
                </Pressable>
                <Pressable onPress={() => toggleFavoriteLeague(l.id)} hitSlop={8}>
                  <Text style={styles.mark}>{on ? '★' : '☆'}</Text>
                </Pressable>
              </View>
            );
          })}
        <Text style={styles.section}>Players</Text>
        {playerResults.length === 0 ? (
          <Text style={styles.hint}>Search a name like Salah to favorite footballers.</Text>
        ) : (
          playerResults.map((p) => {
            const on = isFavoriteId(favoritePlayerIds, p.id, 'player');
            const team = football.getTeam(p.teamId);
            return (
              <View key={p.id} style={[styles.row, on && styles.on]}>
                <Pressable
                  onPress={() => router.push(entityHref('player', p.id))}
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}
                >
                  <View style={styles.num}>
                    <Text style={styles.numText}>{p.number}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{p.name}</Text>
                    <Text style={styles.meta}>
                      {p.pos} · {team?.shortName ?? p.teamId}
                    </Text>
                  </View>
                </Pressable>
                <Pressable onPress={() => toggleFavoritePlayer(p.id)} hitSlop={8}>
                  <Text style={styles.mark}>{on ? '★' : '☆'}</Text>
                </Pressable>
              </View>
            );
          })
        )}
        <Text style={styles.section}>Clubs</Text>
        {teamResults.map((t) => {
          const on = isFavoriteId(favoriteTeamIds, t.id, 'team');
          return (
            <View key={t.id} style={[styles.row, on && styles.on]}>
              <Pressable
                onPress={() => router.push(entityHref('team', t.id))}
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}
              >
                <Crest team={t} size={28} />
                <Text style={[styles.name, { flex: 1 }]}>{t.name}</Text>
              </Pressable>
              <Pressable onPress={() => toggleFavoriteTeam(t.id)} hitSlop={8}>
                <Text style={styles.mark}>{on ? '★' : '☆'}</Text>
              </Pressable>
            </View>
          );
        })}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: spacing.lg },
  search: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: 40 },
  section: { ...type.micro, color: colors.textMuted, marginVertical: spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radius.lg,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  on: { borderColor: colors.limeMuted },
  name: { ...type.subtitle, fontSize: 15, color: colors.text },
  meta: { ...type.caption, color: colors.textMuted, fontWeight: '500', marginTop: 2 },
  hint: { ...type.caption, color: colors.textMuted, fontWeight: '500', marginBottom: spacing.sm },
  num: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numText: { ...type.caption, color: colors.lime },
  mark: { color: colors.gold, fontSize: 18 },
});

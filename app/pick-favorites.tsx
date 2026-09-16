import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Crest } from '@/components/ui/Crest';
import { HeaderBar } from '@/components/ui/HeaderBar';
import { Screen } from '@/components/ui/Screen';
import { entityHref } from '@/lib/entityNav';
import { useApp } from '@/services/AppProvider';
import { football } from '@/services/football';
import { colors, radius, spacing, type } from '@/theme';

export default function PickFavoritesScreen() {
  const { favoriteTeamIds, favoriteLeagueIds, toggleFavoriteTeam, toggleFavoriteLeague } = useApp();
  const [q, setQ] = useState('');
  const teams = football.getTeams();
  const leagues = football.getLeagues();

  const teamResults = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = needle
      ? teams.filter((t) => t.name.toLowerCase().includes(needle) || t.code.toLowerCase().includes(needle))
      : teams.filter((t) => ['ars', 'liv', 'mci', 'rma', 'bar', 'int', 'bay', 'psg', 'fla', 'mia'].includes(t.id)).concat(
          teams.filter((t) => favoriteTeamIds.includes(t.id)),
        );
    const seen = new Set<string>();
    return list.filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true))).slice(0, 24);
  }, [favoriteTeamIds, q, teams]);

  return (
    <Screen padded={false}>
      <View style={styles.pad}>
        <HeaderBar title="Favorites" onBack={() => router.back()} />
        <TextInput
          placeholder="Search clubs"
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
            const on = favoriteLeagueIds.includes(l.id);
            return (
              <View key={l.id} style={[styles.row, on && styles.on]}>
                <Pressable onPress={() => router.push(entityHref('league', l.id))} style={{ flex: 1 }}>
                  <Text style={styles.name}>{l.name}</Text>
                </Pressable>
                <Pressable onPress={() => toggleFavoriteLeague(l.id)} hitSlop={8}>
                  <Text style={styles.mark}>{on ? '★' : '☆'}</Text>
                </Pressable>
              </View>
            );
          })}
        <Text style={styles.section}>Clubs</Text>
        {teamResults.map((t) => {
          const on = favoriteTeamIds.includes(t.id);
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
  mark: { color: colors.gold, fontSize: 18 },
});

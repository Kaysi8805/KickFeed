import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { MatchRow } from '@/components/match/MatchRow';
import { Crest } from '@/components/ui/Crest';
import { EmptyState } from '@/components/ui/EmptyState';
import { HeaderBar } from '@/components/ui/HeaderBar';
import { Screen } from '@/components/ui/Screen';
import { Segmented } from '@/components/ui/Segmented';
import { useApp } from '@/services/AppProvider';
import { football } from '@/services/football';
import { colors, radius, spacing, type } from '@/theme';

type Tab = 'table' | 'scorers' | 'fixtures';

export default function LeagueScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { favoriteLeagueIds, toggleFavoriteLeague } = useApp();
  const [tab, setTab] = useState<Tab>('table');
  const league = football.getLeague(id);

  if (!league) {
    return (
      <Screen>
        <HeaderBar title="League" onBack={() => router.back()} />
        <EmptyState title="Unknown league" body="This competition isn’t in the mock catalog." />
      </Screen>
    );
  }

  const country = football.getCountry(league.countryId);
  const table = football.getStandings(league.id);
  const scorers = football.getTopScorers(league.id);
  const fixtures = football.getFixtures({ leagueId: league.id });
  const fav = favoriteLeagueIds.includes(league.id);

  return (
    <Screen padded={false}>
      <View style={styles.pad}>
        <HeaderBar
          title={league.shortName}
          onBack={() => router.back()}
          right={
            <Pressable onPress={() => toggleFavoriteLeague(league.id)}>
              <Text style={styles.star}>{fav ? '★ Favorited' : '☆ Favorite'}</Text>
            </Pressable>
          }
        />
        <Text style={styles.name}>{league.name}</Text>
        <Text style={styles.meta}>
          {country?.flag} {country?.name} · {league.type}
        </Text>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { key: 'table', label: 'Table' },
            { key: 'scorers', label: 'Scorers' },
            { key: 'fixtures', label: 'Fixtures' },
          ]}
        />
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        {tab === 'table' ? (
          table.length === 0 ? (
            <EmptyState title="No table" body="Cup competitions may not publish a league table." />
          ) : (
            <View style={styles.table}>
              <View style={styles.thead}>
                <Text style={[styles.th, { flex: 0.4 }]}>#</Text>
                <Text style={[styles.th, { flex: 2 }]}>Club</Text>
                <Text style={styles.th}>P</Text>
                <Text style={styles.th}>GD</Text>
                <Text style={styles.th}>Pts</Text>
              </View>
              {table.map((row, i) => {
                const team = football.getTeam(row.teamId);
                if (!team) return null;
                return (
                  <View key={row.teamId} style={styles.trow}>
                    <Text style={[styles.td, { flex: 0.4 }]}>{i + 1}</Text>
                    <View style={[styles.club, { flex: 2 }]}>
                      <Crest team={team} size={22} />
                      <Text style={styles.clubName} numberOfLines={1}>
                        {team.shortName}
                      </Text>
                    </View>
                    <Text style={styles.td}>{row.played}</Text>
                    <Text style={styles.td}>{row.gf - row.ga}</Text>
                    <Text style={[styles.td, styles.pts]}>{row.points}</Text>
                  </View>
                );
              })}
              <View style={styles.formBlock}>
                <Text style={styles.formTitle}>Form (last 5)</Text>
                {table.slice(0, 6).map((row) => {
                  const team = football.getTeam(row.teamId);
                  return (
                    <View key={`f-${row.teamId}`} style={styles.formRow}>
                      <Text style={styles.formName}>{team?.code}</Text>
                      <View style={styles.dots}>
                        {row.form.map((r, idx) => (
                          <View
                            key={idx}
                            style={[
                              styles.dot,
                              r === 'W' && { backgroundColor: colors.pitchBright },
                              r === 'D' && { backgroundColor: colors.gold },
                              r === 'L' && { backgroundColor: colors.live },
                            ]}
                          />
                        ))}
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          )
        ) : null}

        {tab === 'scorers' ? (
          scorers.map((s, i) => {
            const team = football.getTeam(s.teamId);
            return (
              <View key={s.id} style={styles.scorer}>
                <Text style={styles.rank}>{i + 1}</Text>
                {team ? <Crest team={team} size={28} /> : null}
                <View style={{ flex: 1 }}>
                  <Text style={styles.sname}>{s.playerName}</Text>
                  <Text style={styles.smeta}>{team?.shortName}</Text>
                </View>
                <Text style={styles.goals}>{s.goals}</Text>
                <Text style={styles.assists}>{s.assists} A</Text>
              </View>
            );
          })
        ) : null}

        {tab === 'fixtures'
          ? fixtures.map((f) => <MatchRow key={f.id} fixture={f} compact />)
          : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  name: { ...type.subtitle, color: colors.text, marginTop: -4 },
  meta: { ...type.caption, color: colors.textMuted, fontWeight: '500', marginBottom: spacing.sm },
  star: { ...type.caption, color: colors.gold },
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: 40, paddingTop: spacing.md },
  table: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.sm },
  thead: { flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 8 },
  th: { ...type.micro, color: colors.textDim, flex: 0.7, textAlign: 'right' },
  trow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  td: { ...type.caption, color: colors.textMuted, flex: 0.7, textAlign: 'right' },
  pts: { color: colors.lime, fontWeight: '800' },
  club: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  clubName: { ...type.caption, color: colors.text, flexShrink: 1 },
  formBlock: { marginTop: spacing.md, padding: spacing.sm },
  formTitle: { ...type.micro, color: colors.textMuted, marginBottom: 8 },
  formRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  formName: { ...type.caption, color: colors.text, width: 40 },
  dots: { flexDirection: 'row', gap: 4 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.border },
  scorer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radius.md,
    marginBottom: 8,
  },
  rank: { ...type.subtitle, color: colors.textDim, width: 22 },
  sname: { ...type.subtitle, fontSize: 14, color: colors.text },
  smeta: { ...type.caption, color: colors.textMuted, fontWeight: '500' },
  goals: { ...type.title, fontSize: 20, color: colors.lime },
  assists: { ...type.caption, color: colors.textDim, width: 36, textAlign: 'right' },
});

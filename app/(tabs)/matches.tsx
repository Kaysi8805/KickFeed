import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { MatchRow } from '@/components/match/MatchRow';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
import { Segmented } from '@/components/ui/Segmented';
import { isSameDay } from '@/lib/format';
import { useLiveTick } from '@/lib/useLiveTick';
import { useApp } from '@/services/AppProvider';
import { football } from '@/services/football';
import { colors, spacing, type } from '@/theme';

type Filter = 'live' | 'today' | 'upcoming';

export default function MatchesScreen() {
  useLiveTick();
  const { favoriteLeagueIds } = useApp();
  const [filter, setFilter] = useState<Filter>('live');
  const fixtures = football.getFixtures();

  const filtered = useMemo(() => {
    if (filter === 'live') return fixtures.filter((f) => f.status === 'live' || f.status === 'ht');
    if (filter === 'today') return fixtures.filter((f) => isSameDay(f.kickoff));
    return fixtures.filter((f) => f.status === 'upcoming' && !isSameDay(f.kickoff));
  }, [filter, fixtures]);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    for (const f of filtered) {
      const list = map.get(f.leagueId) ?? [];
      list.push(f);
      map.set(f.leagueId, list);
    }
    const ids = [...map.keys()].sort((a, b) => {
      const af = favoriteLeagueIds.includes(a) ? 0 : 1;
      const bf = favoriteLeagueIds.includes(b) ? 0 : 1;
      return af - bf;
    });
    return ids.map((id) => ({ league: football.getLeague(id), fixtures: map.get(id) ?? [] }));
  }, [favoriteLeagueIds, filtered]);

  return (
    <Screen padded={false}>
      <View style={styles.top}>
        <Text style={styles.title}>Matches</Text>
        <Text style={styles.sub}>Live, today, and what’s next worldwide</Text>
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { key: 'live', label: 'Live' },
            { key: 'today', label: 'Today' },
            { key: 'upcoming', label: 'Upcoming' },
          ]}
        />
      </View>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {grouped.length === 0 ? (
          <EmptyState
            title={filter === 'live' ? 'No live matches right now' : 'Nothing in this window'}
            body="Flip to Today or Upcoming — the mock clock always has fixtures around now."
          />
        ) : (
          grouped.map(({ league, fixtures: list }) => (
            <View key={league?.id ?? list[0]?.id} style={styles.group}>
              <Text style={styles.league}>{league?.name ?? 'League'}</Text>
              {list.map((f) => (
                <MatchRow key={f.id} fixture={f} compact />
              ))}
            </View>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md, gap: spacing.md },
  title: { ...type.title, color: colors.text },
  sub: { ...type.caption, color: colors.textMuted, fontWeight: '500', marginTop: -8 },
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: 40 },
  group: { marginBottom: spacing.lg },
  league: { ...type.micro, color: colors.limeMuted, marginBottom: spacing.sm, textTransform: 'uppercase' },
});

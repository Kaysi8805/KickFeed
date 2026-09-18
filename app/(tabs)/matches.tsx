import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { LeaderboardButton } from '@/components/leaderboard/LeaderboardButton';
import { CatalogStatus } from '@/components/football/CatalogStatus';
import { MatchRow } from '@/components/match/MatchRow';
import { SearchButton } from '@/components/search/SearchEntry';
import { TvButton } from '@/components/tv/TvButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
import { Segmented } from '@/components/ui/Segmented';
import { CATALOG_ERROR_BODY, CATALOG_ERROR_TITLE, matchesEmptyBody } from '@/lib/honesty';
import { isSameDay } from '@/lib/format';
import { entityHref } from '@/lib/entityNav';
import { expandFavoriteIds } from '@/lib/favoriteIds';
import { useFootballCatalog } from '@/lib/useFootballCatalog';
import { useLiveTick } from '@/lib/useLiveTick';
import { useApp } from '@/services/AppProvider';
import { football } from '@/services/football';
import { colors, spacing, type } from '@/theme';

type Filter = 'live' | 'today' | 'upcoming';

export default function MatchesScreen() {
  const tick = useLiveTick();
  const catalog = useFootballCatalog();
  const { favoriteLeagueIds } = useApp();
  const [filter, setFilter] = useState<Filter>('live');
  const fixtures = useMemo(() => football.getFixtures(), [tick, catalog.lastSyncedAt, catalog.loading]);
  const favLeagues = useMemo(() => expandFavoriteIds(favoriteLeagueIds, 'league'), [favoriteLeagueIds, catalog.lastSyncedAt]);

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
      const af = favLeagues.has(a) ? 0 : 1;
      const bf = favLeagues.has(b) ? 0 : 1;
      return af - bf;
    });
    return ids.map((id) => ({ league: football.getLeague(id), fixtures: map.get(id) ?? [] }));
  }, [favLeagues, filtered]);

  return (
    <Screen padded={false}>
      <View style={styles.top}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Matches</Text>
          <View style={styles.actions}>
            <LeaderboardButton />
            <TvButton />
            <SearchButton />
          </View>
        </View>
        {catalog.source === 'live' ? null : (
          <Text style={styles.sub}>Live, today, and what’s next worldwide (mock)</Text>
        )}
        <CatalogStatus />
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
        {catalog.source === 'live' && catalog.loading && grouped.length === 0 ? (
          <EmptyState title="Loading matches" body={`Fetching ${catalog.geoLabel} fixtures.`} />
        ) : catalog.source === 'live' && catalog.error && grouped.length === 0 ? (
          <EmptyState
            title={CATALOG_ERROR_TITLE}
            body={CATALOG_ERROR_BODY}
            actionLabel="Retry"
            onAction={() => void football.refresh()}
          />
        ) : grouped.length === 0 ? (
          <EmptyState
            title={
              filter === 'live' ? 'No live matches right now' : filter === 'today' ? 'No matches today' : 'Nothing upcoming'
            }
            body={matchesEmptyBody(filter, catalog.source)}
            actionLabel={filter === 'live' ? 'See today' : filter === 'today' ? 'See upcoming' : 'See live'}
            onAction={() => setFilter(filter === 'live' ? 'today' : filter === 'today' ? 'upcoming' : 'live')}
          />
        ) : (
          grouped.map(({ league, fixtures: list }) => (
            <View key={league?.id ?? list[0]?.id} style={styles.group}>
              <Pressable
                onPress={() => league && router.push(entityHref('league', league.id))}
                disabled={!league}
              >
                <Text style={styles.league}>{league?.name ?? 'League'}</Text>
              </Pressable>
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
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { ...type.title, color: colors.text },
  sub: { ...type.caption, color: colors.textMuted, fontWeight: '500', marginTop: -8 },
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: 40 },
  group: { marginBottom: spacing.lg },
  league: {
    ...type.micro,
    color: colors.limeMuted,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    minHeight: 44,
  },
});

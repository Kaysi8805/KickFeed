import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { LeaderboardButton } from '@/components/leaderboard/LeaderboardButton';
import { CatalogStatus } from '@/components/football/CatalogStatus';
import { MatchDateStrip } from '@/components/match/MatchDateStrip';
import { MatchRow } from '@/components/match/MatchRow';
import { SearchButton } from '@/components/search/SearchEntry';
import { TvButton } from '@/components/tv/TvButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
import { CATALOG_ERROR_BODY, CATALOG_ERROR_TITLE, matchesDayCaption, matchesEmptyBody } from '@/lib/honesty';
import { entityHref } from '@/lib/entityNav';
import {
  filterMatchesOnDay,
  matchDayRelation,
  matchDayStrip,
  todayMatchDay,
} from '@/lib/matchesWindow';
import { expandFavoriteIds } from '@/lib/favoriteIds';
import { useFootballCatalog } from '@/lib/useFootballCatalog';
import { useLiveTick } from '@/lib/useLiveTick';
import { useApp } from '@/services/AppProvider';
import { football } from '@/services/football';
import { colors, spacing, type } from '@/theme';

/** One local day at a time. The strip is the only filter — no multi-day dump. */
export default function MatchesScreen() {
  const tick = useLiveTick();
  const catalog = useFootballCatalog();
  const { favoriteLeagueIds } = useApp();
  const [selectedDay, setSelectedDay] = useState(todayMatchDay);
  const today = todayMatchDay();
  const days = useMemo(() => matchDayStrip(), [today]);
  const fixtures = useMemo(() => football.getFixtures(), [tick, catalog.lastSyncedAt, catalog.loading]);
  const favLeagues = useMemo(() => expandFavoriteIds(favoriteLeagueIds, 'league'), [favoriteLeagueIds, catalog.lastSyncedAt]);
  const relation = matchDayRelation(selectedDay);

  const filtered = useMemo(() => filterMatchesOnDay(fixtures, selectedDay), [fixtures, selectedDay]);

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
    return ids.map((id) => ({
      league: football.getLeague(id),
      fixtures: (map.get(id) ?? []).slice().sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff)),
    }));
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
        <View style={styles.stripBleed}>
          <MatchDateStrip days={days} selected={selectedDay} onSelect={setSelectedDay} />
        </View>
        <Text style={styles.sub}>{matchesDayCaption(selectedDay, catalog.source)}</Text>
        <CatalogStatus />
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
            title={relation === 'today' ? 'No matches today' : 'No matches on this day'}
            body={matchesEmptyBody(relation, catalog.source)}
            actionLabel={relation === 'today' ? undefined : 'Back to today'}
            onAction={relation === 'today' ? undefined : () => setSelectedDay(today)}
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
  stripBleed: { marginHorizontal: -spacing.lg },
  sub: { ...type.caption, color: colors.textMuted, fontWeight: '500', marginTop: -4 },
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

import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { FormStrip } from '@/components/entity/FormStrip';
import { PlayerRow } from '@/components/entity/PlayerRow';
import { MatchRow } from '@/components/match/MatchRow';
import { Crest, LeagueMark } from '@/components/ui/Crest';
import { EmptyState } from '@/components/ui/EmptyState';
import { HeaderBar } from '@/components/ui/HeaderBar';
import { Screen } from '@/components/ui/Screen';
import { Segmented } from '@/components/ui/Segmented';
import type { Player, PlayerPosition, Scorer } from '@/data/types';
import { entityBackHref, entityHref } from '@/lib/entityNav';
import { FREE_TIER_CACHE_MISS } from '@/lib/honesty';
import { safeBack } from '@/lib/navBack';
import { routeId } from '@/lib/routeParams';
import { isFavoriteId } from '@/lib/favoriteIds';
import { lastCachedXi, recentTeamForm, seasonSummary, teamChart } from '@/lib/teamPhaseA';
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

type TeamTab = 'overview' | 'fixtures' | 'squad';

export default function TeamDetailScreen() {
  const { id: rawId } = useLocalSearchParams<{ id: string | string[] }>();
  const id = routeId(rawId);
  const catalog = useFootballCatalog();
  const { favoriteTeamIds, toggleFavoriteTeam } = useApp();
  const [tab, setTab] = useState<TeamTab>('overview');
  const team = id ? football.getTeam(id) : undefined;

  useEffect(() => {
    setTab('overview');
  }, [id]);

  useEffect(() => {
    if (!id) return;
    void football.ensureSquad(id);
    const league = primaryLeague(id);
    if (league) void football.ensureScorers(league.id);
  }, [id, catalog.lastSyncedAt]);

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
  const upcoming = fixtures.filter((f) => f.status === 'upcoming').slice(0, 8);
  const recent = fixtures
    .filter((f) => f.status !== 'upcoming')
    .slice(-8)
    .reverse();
  const fav = isFavoriteId(favoriteTeamIds, team.id, 'team');
  const liveReady = catalog.source !== 'live' || catalog.ready;
  const form = liveReady ? recentTeamForm(fixtures, team.id) : [];
  const summary = seasonSummary(row);
  const chart = teamChart(
    league ? football.getTopScorers(league.id) : [],
    football.relatedIds('team', team.id),
  );
  const xi = liveReady ? lastCachedXi(fixtures, team.id, (fixture) => football.getLineups(fixture)) : undefined;

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
        <View style={styles.hero}>
          <Crest team={team} size={64} />
          <Text style={styles.name}>{team.name}</Text>
          <Text style={styles.meta}>
            {country?.flag} {country?.name}
          </Text>
          {row && league ? (
            <Pressable onPress={() => router.push(entityHref('league', league.id))} style={styles.standing}>
              <Text style={styles.standingText}>
                {league.shortName} · {place + 1}
                {ordinal(place + 1)} · {row.points} pts
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
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { key: 'overview', label: 'Overview' },
            { key: 'fixtures', label: 'Fixtures' },
            { key: 'squad', label: 'Squad' },
          ]}
        />
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        {tab === 'overview' ? (
          <>
            <Text style={styles.section}>Form</Text>
            {!liveReady ? (
              <Text style={styles.muted}>Loading results…</Text>
            ) : form.length === 0 ? (
              <Text style={styles.muted}>
                {catalog.source === 'live' ? 'No finished matches in the cached window.' : 'No finished mock matches for this club.'}
              </Text>
            ) : (
              <FormStrip chips={form} />
            )}

            <Text style={styles.section}>Season</Text>
            {summary ? (
              <View style={styles.seasonRow}>
                {summary.map((chip) => (
                  <View key={chip.label} style={styles.seasonChip}>
                    <Text style={styles.seasonVal}>{chip.value}</Text>
                    <Text style={styles.seasonLbl}>{chip.label}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.muted}>
                {catalog.source === 'live' && !catalog.ready
                  ? 'Loading the table…'
                  : catalog.source === 'live'
                    ? FREE_TIER_CACHE_MISS
                    : 'No mock standings row for this club.'}
              </Text>
            )}

            <Text style={styles.section}>Top scorers</Text>
            <ScorerList
              rows={chart.scorers}
              kind="goals"
              empty={
                catalog.source === 'live' && (catalog.loading || !catalog.ready)
                  ? 'Loading scorers…'
                  : league && football.getTopScorers(league.id).length === 0
                    ? catalog.source === 'live'
                      ? FREE_TIER_CACHE_MISS
                      : 'No mock scorers for this league.'
                    : 'Nobody from this club is on the cached top-scorer list.'
              }
            />

            {chart.assists.length > 0 ? (
              <>
                <Text style={styles.section}>Assists</Text>
                <ScorerList rows={chart.assists} kind="assists" empty="" />
              </>
            ) : null}

            <Text style={styles.section}>Last XI</Text>
            {!liveReady ? (
              <Text style={styles.muted}>Loading lineups…</Text>
            ) : xi ? (
              <View style={styles.xi}>
                <Pressable onPress={() => router.push(entityHref('match', xi.fixtureId))} style={styles.xiLink}>
                  <Text style={styles.xiFormation}>{xi.formation}</Text>
                  <Text style={styles.link}>Match →</Text>
                </Pressable>
                {xi.players.map((player) => (
                  <Pressable
                    key={`${player.playerId ?? player.name}-${player.number}`}
                    disabled={!player.playerId}
                    onPress={() => player.playerId && router.push(entityHref('player', player.playerId))}
                    style={styles.xiRow}
                  >
                    <Text style={styles.xiNum}>{player.number}</Text>
                    <Text style={styles.xiName} numberOfLines={1}>
                      {player.name}
                    </Text>
                    <Text style={styles.xiPos}>{player.pos}</Text>
                  </Pressable>
                ))}
              </View>
            ) : (
              <Text style={styles.muted}>
                {catalog.source === 'live'
                  ? `${FREE_TIER_CACHE_MISS}. Open a finished match to keep the lineup.`
                  : 'No finished mock match to build an XI from.'}
              </Text>
            )}
          </>
        ) : null}

        {tab === 'fixtures' ? (
          <>
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
          </>
        ) : null}

        {tab === 'squad' ? (
          grouped.length === 0 ? (
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
          )
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function ScorerList({
  rows,
  kind,
  empty,
}: {
  rows: Scorer[];
  kind: 'goals' | 'assists';
  empty: string;
}) {
  if (rows.length === 0) {
    return empty ? <Text style={styles.muted}>{empty}</Text> : null;
  }
  return (
    <View>
      {rows.map((scorer) => {
        const club = football.getTeam(scorer.teamId);
        const value = kind === 'goals' ? scorer.goals : scorer.assists;
        const extra = kind === 'goals' ? `${scorer.assists} A` : `${scorer.goals} G`;
        return (
          <Pressable
            key={scorer.id}
            disabled={!scorer.playerId}
            onPress={() => scorer.playerId && router.push(entityHref('player', scorer.playerId))}
            style={({ pressed }) => [styles.scorer, pressed && scorer.playerId ? { opacity: 0.86 } : null]}
          >
            {club ? <Crest team={club} size={28} /> : null}
            <Text style={styles.scorerName} numberOfLines={1}>
              {scorer.playerName}
            </Text>
            <Text style={styles.scorerExtra}>{extra}</Text>
            <Text style={styles.scorerValue}>{value}</Text>
          </Pressable>
        );
      })}
    </View>
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
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: 32 },
  hero: { alignItems: 'center', marginBottom: spacing.md, gap: 6 },
  name: { ...type.title, color: colors.text, textAlign: 'center' },
  meta: { ...type.caption, color: colors.textMuted, fontWeight: '500' },
  star: { ...type.caption, color: colors.gold },
  standing: {
    marginTop: 4,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  standingText: { ...type.caption, color: colors.lime },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 4 },
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
  chipText: { ...type.micro, color: colors.lime },
  section: {
    ...type.micro,
    color: colors.lime,
    textTransform: 'uppercase',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  muted: { ...type.caption, color: colors.textMuted, fontWeight: '500', marginBottom: spacing.sm },
  seasonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  seasonChip: {
    minWidth: 44,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  seasonVal: { ...type.subtitle, fontSize: 15, color: colors.text, fontVariant: ['tabular-nums'] },
  seasonLbl: { ...type.micro, color: colors.lime, marginTop: 2 },
  scorer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    marginBottom: 6,
  },
  scorerName: { ...type.subtitle, fontSize: 14, color: colors.text, flex: 1 },
  scorerExtra: { ...type.caption, color: colors.textMuted, fontWeight: '600' },
  scorerValue: { ...type.subtitle, fontSize: 16, color: colors.text, minWidth: 20, textAlign: 'right', fontVariant: ['tabular-nums'] },
  xi: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  xiLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  xiFormation: { ...type.caption, color: colors.textMuted, fontWeight: '700' },
  link: { ...type.caption, color: colors.lime },
  xiRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  xiNum: { ...type.caption, color: colors.lime, width: 22, fontVariant: ['tabular-nums'] },
  xiName: { ...type.caption, color: colors.text, fontWeight: '600', flex: 1 },
  xiPos: { ...type.micro, color: colors.textMuted },
  group: { marginBottom: spacing.sm },
  groupTitle: { ...type.caption, color: colors.lime, marginBottom: 6 },
});

import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { TeamLink } from '@/components/entity/TeamLink';
import { EmptyState } from '@/components/ui/EmptyState';
import { HeaderBar } from '@/components/ui/HeaderBar';
import { Screen } from '@/components/ui/Screen';
import { Segmented } from '@/components/ui/Segmented';
import { entityBackHref, entityHref } from '@/lib/entityNav';
import { defaultEntitySegment } from '@/lib/entityTabs';
import { FREE_TIER_CACHE_MISS } from '@/lib/honesty';
import { safeBack } from '@/lib/navBack';
import { routeId } from '@/lib/routeParams';
import { isFavoriteId } from '@/lib/favoriteIds';
import { kickoffLabel } from '@/lib/format';
import { useFootballCatalog } from '@/lib/useFootballCatalog';
import { useApp } from '@/services/AppProvider';
import { playerStatsHasSignal } from '@/services/footballMap';
import { football } from '@/services/football';
import { colors, radius, spacing, type } from '@/theme';

type PlayerTab = 'overview' | 'matches';

export default function PlayerDetailScreen() {
  const { id: rawId } = useLocalSearchParams<{ id: string | string[] }>();
  const id = routeId(rawId);
  const catalog = useFootballCatalog();
  const { favoritePlayerIds, toggleFavoritePlayer } = useApp();
  const [tab, setTab] = useState<PlayerTab>(defaultEntitySegment('player'));
  const [checkedId, setCheckedId] = useState<string | null>(null);
  const player = id ? football.getPlayer(id) : undefined;

  useEffect(() => {
    setTab(defaultEntitySegment('player'));
    setCheckedId(null);
  }, [id]);

  useEffect(() => {
    let cancel = false;
    (async () => {
      const current = id ? football.getPlayer(id) : undefined;
      if (current) await football.ensureSquad(current.teamId);
      if (catalog.source === 'live' && id) await football.ensurePlayerSeason(id);
      if (!cancel) setCheckedId(id ?? '');
    })();
    return () => {
      cancel = true;
    };
  }, [id, catalog.source]);

  if (!player) {
    return (
      <Screen>
        <HeaderBar title="Player" onBack={() => safeBack(entityBackHref('player', id))} />
        <EmptyState
          title="Unknown player"
          body={
            catalog.source === 'live'
              ? 'This player isn’t in the cached live squads yet. Open their club page to load the squad, or search again after hydrate.'
              : 'This player isn’t in the mock catalog.'
          }
        />
      </Screen>
    );
  }

  const team = football.getTeam(player.teamId);
  const stats = football.getPlayerStats(player.id);
  const apps = football.getPlayerAppearances(player.id);
  const country = team ? football.getCountry(team.countryId) : undefined;
  const fav = isFavoriteId(favoritePlayerIds, player.id, 'player');
  const seasonChecked = checkedId === player.id || checkedId === id;
  const waitingForSeason = catalog.source === 'live' && !stats && !seasonChecked;

  return (
    <Screen padded={false}>
      <View style={styles.pad}>
        <HeaderBar
          title={player.shortName}
          onBack={() => safeBack(entityBackHref('player', player.id))}
          right={
            <Pressable onPress={() => toggleFavoritePlayer(player.id)}>
              <Text style={styles.star}>{fav ? '★ Following' : '☆ Follow'}</Text>
            </Pressable>
          }
        />
        <View style={styles.hero}>
          <View style={[styles.badge, team && { backgroundColor: team.color, borderColor: team.accent }]}>
            <Text style={styles.badgeNum}>{player.number}</Text>
          </View>
          <Text style={styles.name}>{player.name}</Text>
          <Text style={styles.role}>
            {player.pos} · {player.nationality} · {player.age} yrs
          </Text>
          {team ? (
            <View style={styles.teamWrap}>
              <TeamLink team={team} size={32} label={team.name} textStyle={styles.teamName} />
            </View>
          ) : null}
          {country ? (
            <Text style={styles.meta}>
              {country.flag} {country.name}
            </Text>
          ) : null}
        </View>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { key: 'overview', label: 'Overview' },
            { key: 'matches', label: 'Matches' },
          ]}
        />
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        {tab === 'overview' ? (
          <>
            <Text style={styles.section}>Season</Text>
            {stats && playerStatsHasSignal(stats) ? (
              <View style={styles.stats}>
                <Stat n={stats.appearances} label="Apps" />
                <Stat n={stats.goals} label="Goals" />
                <Stat n={stats.assists} label="Assists" />
                <Stat n={stats.rating > 0 ? stats.rating.toFixed(1) : '—'} label="Rating" />
                <Stat n={stats.minutes} label="Mins" />
                <Stat n={stats.yellows} label="Yellow" />
                <Stat n={stats.reds} label="Red" />
              </View>
            ) : waitingForSeason ? (
              <Text style={styles.muted}>Loading season stats…</Text>
            ) : (
              <Text style={styles.muted}>
                {catalog.source === 'live' ? FREE_TIER_CACHE_MISS : 'No mock season stats for this player.'}
              </Text>
            )}
            <Text style={styles.hint}>
              {catalog.source === 'live'
                ? stats
                  ? 'Season totals across competitions. Cached for about 12 hours so repeat opens stay off the free-tier quota.'
                  : 'KickFeed only asks for this player, not the whole squad.'
                : 'Season numbers are mock. Set EXPO_PUBLIC_FOOTBALL_BFF_URL (or a public API key) for live scorers.'}
            </Text>
            {team ? (
              <Pressable onPress={() => router.push(entityHref('team', team.id))} style={styles.backTeam}>
                <Text style={styles.backTeamText}>View full {team.shortName} squad →</Text>
              </Pressable>
            ) : null}
          </>
        ) : null}

        {tab === 'matches' ? (
          <>
            <Text style={styles.section}>Appearances</Text>
            {apps.length === 0 ? (
              <Text style={styles.muted}>
                {catalog.source === 'live' ? FREE_TIER_CACHE_MISS : 'No mock appearances in the current fixture window.'}
              </Text>
            ) : (
              apps.map((a) => {
                const fx = football.getFixture(a.fixtureId);
                if (!fx) return null;
                const home = football.getTeam(fx.homeTeamId);
                const away = football.getTeam(fx.awayTeamId);
                const league = football.getLeague(fx.leagueId);
                const opp = fx.homeTeamId === player.teamId ? away : home;
                const usHome = fx.homeTeamId === player.teamId;
                const usScore = usHome ? fx.homeScore : fx.awayScore;
                const themScore = usHome ? fx.awayScore : fx.homeScore;
                return (
                  <Pressable
                    key={a.fixtureId}
                    onPress={() => router.push(entityHref('match', fx.id))}
                    style={({ pressed }) => [styles.app, pressed && { opacity: 0.86 }]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.appLeague}>{league?.shortName ?? 'Match'}</Text>
                      <Text style={styles.appTitle}>
                        vs {opp?.shortName ?? 'Opponent'}{' '}
                        {fx.status === 'upcoming' ? kickoffLabel(fx.kickoff) : `${usScore}–${themScore}`}
                      </Text>
                      <Text style={styles.appMeta}>
                        {a.starter ? 'Started' : 'Sub'} · {a.minutes}' · {a.goals}G · {a.assists}A
                      </Text>
                    </View>
                    <Text style={styles.rating}>{a.rating > 0 ? a.rating.toFixed(1) : '—'}</Text>
                  </Pressable>
                );
              })
            )}
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function Stat({ n, label }: { n: number | string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statN}>{n}</Text>
      <Text style={styles.statL}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: spacing.lg },
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: 32 },
  hero: { alignItems: 'center', marginBottom: spacing.md, gap: 6 },
  badge: {
    width: 72,
    height: 72,
    borderRadius: 18,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 3,
    borderColor: colors.pitch,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  badgeNum: { ...type.hero, color: colors.white },
  name: { ...type.title, color: colors.text, textAlign: 'center' },
  role: { ...type.caption, color: colors.lime },
  star: { ...type.caption, color: colors.gold },
  teamWrap: { marginTop: 8 },
  teamName: { ...type.subtitle, fontSize: 15, color: colors.text },
  meta: { ...type.caption, color: colors.textMuted, fontWeight: '500' },
  section: {
    ...type.micro,
    color: colors.lime,
    textTransform: 'uppercase',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  stats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  stat: { width: '33.33%', alignItems: 'center', paddingVertical: 8 },
  statN: { ...type.title, fontSize: 20, color: colors.text, fontVariant: ['tabular-nums'] },
  statL: { ...type.micro, color: colors.lime, marginTop: 2 },
  hint: { ...type.caption, color: colors.textDim, fontWeight: '500', marginTop: spacing.md, lineHeight: 18 },
  muted: { ...type.caption, color: colors.textMuted, fontWeight: '500' },
  app: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
  },
  appLeague: { ...type.micro, color: colors.lime, textTransform: 'uppercase' },
  appTitle: { ...type.subtitle, fontSize: 14, color: colors.text, marginTop: 2 },
  appMeta: { ...type.caption, color: colors.textMuted, fontWeight: '500', marginTop: 2 },
  rating: { ...type.title, fontSize: 20, color: colors.text, fontVariant: ['tabular-nums'] },
  backTeam: {
    marginTop: spacing.lg,
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  backTeamText: { ...type.caption, color: colors.lime },
});

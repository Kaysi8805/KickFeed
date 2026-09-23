import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { RankRow } from '@/components/leaderboard/RankRow';
import { EmptyState } from '@/components/ui/EmptyState';
import { HeaderBar } from '@/components/ui/HeaderBar';
import { Screen } from '@/components/ui/Screen';
import { Segmented } from '@/components/ui/Segmented';
import {
  FAN_PICKS_NOT_GAMBLING,
  LIVE_RANKING_ERROR_BODY,
  LIVE_RANKING_ERROR_TITLE,
  rankingDisclaimer,
} from '@/lib/honesty';
import {
  filterMatchesByLeague,
  finishedMatches,
  leaderboardSource,
  rankLeaderboard,
  shouldPersistLeaderboard,
  LEADERBOARD_TIEBREAK_COPY,
  type LeaderboardBoard,
} from '@/lib/leaderboard';
import { relatedFixtureIds } from '@/lib/matchSocial';
import { safeBack } from '@/lib/navBack';
import { routeId } from '@/lib/routeParams';
import { entityHref } from '@/lib/entityNav';
import type { User } from '@/data/types';
import { useFootballCatalog } from '@/lib/useFootballCatalog';
import { useLiveTick } from '@/lib/useLiveTick';
import { useApp } from '@/services/AppProvider';
import { football } from '@/services/football';
import {
  asLeaderboardClient,
  fetchRemoteLeaderboardRows,
  syncUserEngagementToCloud,
  type RemoteLeaderboardRows,
} from '@/services/leaderboard';
import { getSupabaseClient } from '@/services/supabase';
import { colors, radius, spacing, type } from '@/theme';

type LeagueFilter = 'global' | string;

export default function LeaderboardScreen() {
  useLiveTick();
  const catalog = useFootballCatalog();
  const { leagueId: rawLeague } = useLocalSearchParams<{ leagueId?: string | string[] }>();
  const paramLeague = routeId(rawLeague);
  const {
    currentUser,
    authMode,
    supabaseConfigured,
    users,
    predictions,
    motmVotes,
    rememberProfiles,
  } = useApp();

  const source = leaderboardSource(supabaseConfigured, authMode);
  const [leagueFilter, setLeagueFilter] = useState<LeagueFilter>(paramLeague ?? 'global');
  const [remote, setRemote] = useState<RemoteLeaderboardRows | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [liveLoading, setLiveLoading] = useState(source === 'live');

  useEffect(() => {
    if (paramLeague) setLeagueFilter(paramLeague);
  }, [paramLeague]);

  const loadLive = useCallback(async () => {
    if (source !== 'live') {
      setRemote(null);
      setLiveError(null);
      setLiveLoading(false);
      return;
    }
    setLiveLoading(true);
    setLiveError(null);
    try {
      const client = asLeaderboardClient(getSupabaseClient());
      const leagueIdFor = (matchId: string) => {
        const direct = football.getFixture(matchId);
        if (direct) return direct.leagueId;
        for (const id of relatedFixtureIds(football, matchId)) {
          const hit = football.getFixture(id);
          if (hit) return hit.leagueId;
        }
        return '';
      };
      const kickoffFor = (matchId: string) => {
        const direct = football.getFixture(matchId);
        if (direct?.kickoff) return direct.kickoff;
        for (const id of relatedFixtureIds(football, matchId)) {
          const hit = football.getFixture(id);
          if (hit?.kickoff) return hit.kickoff;
        }
        return undefined;
      };
      if (currentUser && shouldPersistLeaderboard(supabaseConfigured, authMode)) {
        await syncUserEngagementToCloud(client, currentUser.id, predictions, motmVotes, leagueIdFor, kickoffFor);
      }
      const rows = await fetchRemoteLeaderboardRows(client);
      if ('error' in rows) {
        setRemote(null);
        setLiveError(rows.error);
        return;
      }
      setRemote(rows);
      rememberProfiles(rows.users);
    } catch (err) {
      setRemote(null);
      setLiveError(err instanceof Error ? err.message : 'fetch failed');
    } finally {
      setLiveLoading(false);
    }
  }, [authMode, currentUser, motmVotes, predictions, rememberProfiles, source, supabaseConfigured]);

  useEffect(() => {
    void loadLive();
  }, [loadLive]);

  const catalogMatches = useMemo(
    () => finishedMatches(football.getFixtures(), (id) => relatedFixtureIds(football, id)),
    [catalog.lastSyncedAt, catalog.loading],
  );

  const leagueOptions = useMemo(() => {
    const ids = new Set<string>();
    for (const match of catalogMatches) ids.add(match.leagueId);
    if (paramLeague) ids.add(paramLeague);
    const leagues = [...ids]
      .map((id) => football.getLeague(id))
      .filter((league): league is NonNullable<typeof league> => !!league)
      .sort((a, b) => a.shortName.localeCompare(b.shortName));
    return [{ key: 'global' as const, label: 'Global' }, ...leagues.map((l) => ({ key: l.id, label: l.shortName }))];
  }, [catalogMatches, paramLeague]);

  const selectedLeague = leagueFilter === 'global' ? undefined : leagueFilter;
  const relatedLeagueIds = selectedLeague ? football.relatedIds('league', selectedLeague) : [];
  const matches = filterMatchesByLeague(catalogMatches, selectedLeague, relatedLeagueIds);

  const board: LeaderboardBoard = useMemo(() => {
    const liveUsers = remote?.users ?? [];
    const mergedUsers = source === 'live' ? mergeUsers(users, liveUsers) : users;
    return rankLeaderboard({
      predictions: source === 'live' ? (remote?.predictions ?? []) : predictions,
      motmVotes: source === 'live' ? (remote?.motmVotes ?? []) : motmVotes,
      matches,
      users: mergedUsers,
      currentUserId: currentUser?.id,
      source,
      leagueId: selectedLeague ?? null,
    });
  }, [currentUser?.id, matches, motmVotes, predictions, remote, selectedLeague, source, users]);

  const disclaimer = rankingDisclaimer(source, supabaseConfigured, catalog.source);
  const showLiveGate = source === 'live' && (liveLoading || liveError);

  return (
    <Screen padded={false}>
      <View style={styles.pad}>
        <HeaderBar title="Leaderboard" onBack={() => safeBack('/matches')} />
        <View style={styles.banner} accessibilityRole="text">
          <Text style={styles.bannerText}>{disclaimer}</Text>
        </View>
        {leagueOptions.length > 1 ? (
          <Segmented value={leagueFilter} onChange={setLeagueFilter} options={leagueOptions} />
        ) : null}
      </View>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {showLiveGate && liveLoading ? (
          <EmptyState title="Loading live ranking" body="Pulling synced KickFeed picks from Postgres." />
        ) : showLiveGate && liveError ? (
          <EmptyState
            title={LIVE_RANKING_ERROR_TITLE}
            body={LIVE_RANKING_ERROR_BODY}
            actionLabel="Retry"
            onAction={() => void loadLive()}
          />
        ) : (
          <>
            <View style={styles.you}>
              {board.current ? (
                <>
                  <Text style={styles.youKicker}>Your rank</Text>
                  <RankRow
                    row={board.current}
                    onPress={() => currentUser && router.push(entityHref('user', currentUser.id))}
                  />
                </>
              ) : (
                <EmptyState
                  compact
                  title="You’re unranked"
                  body="Lock a score before kickoff. Points land at full time — exact 5, correct result 2, unique community MOTM +2."
                />
              )}
            </View>

            <View style={styles.headRow}>
              <Text style={styles.section}>
                Top {board.topN}
                {selectedLeague ? ` · ${football.getLeague(selectedLeague)?.shortName ?? 'League'}` : ' · global'}
              </Text>
              <Text style={styles.count}>{board.totalRanked} ranked</Text>
            </View>

            {board.top.length === 0 ? (
              <EmptyState
                compact
                title="No finished picks yet"
                body={
                  source === 'live'
                    ? 'Live ranking fills once signed-in fans lock a score that has gone full time.'
                    : 'Seeded fans pick finished mock fixtures — pull to refresh after kickoff on the match hub.'
                }
              />
            ) : (
              <View style={styles.list}>
                {board.top.map((row) => (
                  <RankRow
                    key={row.userId}
                    row={row}
                    onPress={() => router.push(entityHref('user', row.userId))}
                  />
                ))}
              </View>
            )}

            <Text style={styles.rules}>
              Scoring (full time only): exact scoreline 5 pts · correct 1X2 2 pts · unique community MOTM +2.
              {` ${LEADERBOARD_TIEBREAK_COPY}`} {FAN_PICKS_NOT_GAMBLING}
            </Text>
            {selectedLeague ? (
              <Pressable
                onPress={() => router.push(entityHref('league', selectedLeague))}
                style={styles.leagueLink}
              >
                <Text style={styles.leagueLinkText}>Open league →</Text>
              </Pressable>
            ) : null}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function mergeUsers(local: User[], remote: User[]): User[] {
  const byId = new Map<string, User>();
  for (const user of local) byId.set(user.id, user);
  for (const user of remote) {
    if (!byId.has(user.id)) byId.set(user.id, user);
  }
  return [...byId.values()];
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: spacing.lg, gap: spacing.md },
  banner: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
  bannerText: { ...type.caption, color: colors.gold, fontWeight: '700' },
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: 48, paddingTop: spacing.md, gap: spacing.md },
  you: { gap: 8 },
  youKicker: { ...type.micro, color: colors.limeMuted, textTransform: 'uppercase' },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  section: { ...type.micro, color: colors.limeMuted, textTransform: 'uppercase' },
  count: { ...type.caption, color: colors.textDim },
  list: { gap: 8 },
  rules: { ...type.caption, color: colors.textDim, fontWeight: '500', lineHeight: 18 },
  leagueLink: { minHeight: 44, justifyContent: 'center' },
  leagueLinkText: { ...type.caption, color: colors.lime, fontWeight: '700' },
});

import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { InviteSheet } from '@/components/fantasy/InviteSheet';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { HeaderBar } from '@/components/ui/HeaderBar';
import { Screen } from '@/components/ui/Screen';
import type { Fixture } from '@/data/types';
import { entityHref } from '@/lib/entityNav';
import {
  competitionLabel,
  deadlineCountdown,
  fantasyEventFetchIds,
  memberCount,
  membersOf,
  pickFor,
  rankFantasyLeague,
  seasonLabel,
  selectGameweek,
} from '@/lib/fantasy';
import {
  FANTASY_EVENTS_COPY,
  FANTASY_GW_WINDOW_COPY,
  FANTASY_NOT_GAMBLING,
  FANTASY_NO_ROUND,
  FANTASY_SIGN_IN_COPY,
  fantasyDisclaimer,
} from '@/lib/honesty';
import { safeBack } from '@/lib/navBack';
import { routeId } from '@/lib/routeParams';
import { useFantasy } from '@/lib/useFantasy';
import { useFootballCatalog } from '@/lib/useFootballCatalog';
import { useLiveTick } from '@/lib/useLiveTick';
import { useApp } from '@/services/AppProvider';
import { football } from '@/services/football';
import { colors, radius, spacing, type } from '@/theme';

export default function FantasyLeagueScreen() {
  const tick = useLiveTick();
  useFootballCatalog();
  const { leagueId: raw } = useLocalSearchParams<{ leagueId?: string | string[] }>();
  const leagueId = routeId(raw);
  const { users } = useApp();
  const fantasy = useFantasy();
  const triedEvents = useRef(new Set<string>());
  const savedPoints = useRef('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const now = new Date();
  const league = fantasy.snapshot?.leagues.find((row) => row.id === leagueId);
  const fixtures = football.getFixtures() as Fixture[];
  const gameweek = league ? selectGameweek(fixtures, league.competitionId, league.season, now) : null;
  const standings =
    fantasy.snapshot && fantasy.userId && league && gameweek
      ? rankFantasyLeague({
          snapshot: fantasy.snapshot,
          leagueId: league.id,
          roundId: gameweek.roundId,
          fixtures,
          users,
          currentUserId: fantasy.userId,
        })
      : [];
  const mine =
    fantasy.snapshot && fantasy.userId && league && gameweek
      ? pickFor(fantasy.snapshot, league.id, fantasy.userId, gameweek.roundId)
      : undefined;

  const snapshot = fantasy.snapshot;
  const saveRoundPoints = fantasy.saveRoundPoints;
  const roundId = gameweek?.roundId;

  useEffect(() => {
    if (!snapshot || !league || !roundId || !fantasy.userId) return;
    const catalog = football.getFixtures();
    const teamIds = new Set<string>();
    for (const member of membersOf(snapshot, league.id)) {
      const pick = pickFor(snapshot, league.id, member.userId, roundId);
      for (const slot of pick?.slots ?? []) teamIds.add(slot.teamId);
    }
    const ids = fantasyEventFetchIds(catalog, roundId, teamIds).filter((id) => !triedEvents.current.has(id));
    for (const id of ids) {
      triedEvents.current.add(id);
      void football.ensureMatchDetail(id);
    }
    const relevant = catalog.filter(
      (fixture) =>
        fixture.round?.trim() === roundId &&
        fixture.status === 'finished' &&
        (teamIds.has(fixture.homeTeamId) || teamIds.has(fixture.awayTeamId)),
    );
    const ready =
      relevant.length > 0 &&
      relevant.every((fixture) => fixture.events.length > 0 || triedEvents.current.has(fixture.id));
    if (!ready) return;
    const rows = rankFantasyLeague({
      snapshot,
      leagueId: league.id,
      roundId,
      fixtures: catalog,
      users,
      currentUserId: fantasy.userId,
    })
      .filter((row) => row.hasXi)
      .map((row) => ({ userId: row.userId, points: row.gwPoints, goals: row.goals, assists: row.assists }));
    const signature = `${roundId}:${JSON.stringify(rows)}`;
    if (signature === savedPoints.current || rows.length === 0) return;
    savedPoints.current = signature;
    void saveRoundPoints(league.id, roundId, rows);
  }, [snapshot, saveRoundPoints, roundId, league, users, fantasy.userId, tick]);

  return (
    <Screen padded={false}>
      <View style={styles.pad}>
        <HeaderBar title={league?.name ?? 'Mini-league'} onBack={() => safeBack('/fantasy')} />
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        {!fantasy.signedIn ? <EmptyState title="Sign in to play" body={FANTASY_SIGN_IN_COPY} /> : null}
        {fantasy.signedIn && !fantasy.loading && !league ? (
          <EmptyState
            title="League not on this account"
            body="Join with the invite code. Demo profiles are not in this table."
            actionLabel="Back to Fantasy"
            onAction={() => router.replace('/fantasy')}
          />
        ) : null}
        {league && fantasy.snapshot ? (
          <>
            <Text style={styles.kicker}>
              {competitionLabel(league.competitionId)} {seasonLabel(league.season)}
            </Text>
            <Text style={styles.round}>{gameweek?.roundId ?? 'No round yet'}</Text>
            <Text style={styles.body}>
              {gameweek ? deadlineCountdown(gameweek.deadlineAt, gameweek.locked, now) : FANTASY_NO_ROUND}
            </Text>
            <Text style={styles.meta}>{memberCount(fantasy.snapshot, league.id)} fans</Text>
            <Text style={styles.caption}>{FANTASY_NOT_GAMBLING}</Text>
            <Text style={styles.caption}>{FANTASY_EVENTS_COPY}</Text>
            <Text style={styles.caption}>{FANTASY_GW_WINDOW_COPY}</Text>
            <Text style={styles.caption}>{fantasyDisclaimer(true)}</Text>
            <View style={styles.actions}>
              <Button
                label="Invite"
                onPress={() => setInviteOpen(true)}
                accessibilityLabel="Invite friends"
              />
              {gameweek ? (
                <Button
                  label={gameweek.locked ? 'View XI' : mine ? 'Edit XI' : 'Set XI'}
                  variant="secondary"
                  onPress={() => router.push({ pathname: '/fantasy/xi', params: { leagueId: league.id } })}
                  accessibilityLabel={gameweek.locked ? 'View XI' : 'Set XI'}
                />
              ) : null}
            </View>
            <Text style={styles.section}>Standings</Text>
            <Text style={styles.caption}>This round, then the season total. Tie-break: round points, then name.</Text>
            <View style={styles.head}>
              <Text style={styles.headRank}>#</Text>
              <Text style={styles.headName}>Fan</Text>
              <Text style={styles.headPts}>GW</Text>
              <Text style={styles.headPts}>Tot</Text>
            </View>
            {standings.map((row) => (
              <View key={row.userId} style={[styles.row, row.isCurrentUser && styles.mine]}>
                <Text style={styles.rank}>{row.rank}</Text>
                <Avatar initials={row.initials} color={row.avatarColor} size={32} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.name} numberOfLines={1}>
                    {row.name}
                    {row.isCurrentUser ? ' · you' : ''}
                  </Text>
                  <Text style={styles.caption} numberOfLines={1}>
                    {row.hasXi ? `${row.goals}G ${row.assists}A` : 'No XI'}
                  </Text>
                </View>
                <Text style={styles.pts}>{row.gwPoints}</Text>
                <Text style={styles.pts}>{row.total}</Text>
              </View>
            ))}
            {mine ? (
              <>
                <Text style={styles.section}>Your XI</Text>
                {mine.slots.map((slot) => (
                  <Pressable
                    key={slot.playerId}
                    onPress={() => router.push(entityHref('player', slot.playerId))}
                    style={styles.player}
                    accessibilityRole="link"
                    accessibilityLabel={`${slot.playerName}, open player`}
                  >
                    <Text style={styles.slotPos}>{slot.pos}</Text>
                    <Text style={styles.name}>
                      {slot.number ? `${slot.number} ` : ''}
                      {slot.playerName}
                    </Text>
                  </Pressable>
                ))}
              </>
            ) : null}
            <InviteSheet visible={inviteOpen} league={league} onClose={() => setInviteOpen(false)} />
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: spacing.lg },
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: 48, gap: spacing.sm },
  kicker: { ...type.badge, color: colors.accent },
  round: { ...type.title, color: colors.text },
  body: { ...type.body, color: colors.text, lineHeight: 22 },
  meta: { ...type.caption, color: colors.textMuted },
  caption: { ...type.caption, color: colors.textMuted, lineHeight: 18 },
  actions: { gap: spacing.sm },
  section: { ...type.badge, color: colors.textMuted, marginTop: spacing.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.sm },
  headRank: { ...type.micro, color: colors.textMuted, width: 24 },
  headName: { ...type.micro, color: colors.textMuted, flex: 1 },
  headPts: { ...type.micro, color: colors.textMuted, width: 36, textAlign: 'right' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
  },
  mine: { borderColor: colors.accent },
  rank: { ...type.subtitle, color: colors.text, width: 24, textAlign: 'center' },
  name: { ...type.body, color: colors.text },
  pts: { ...type.subtitle, color: colors.text, width: 36, textAlign: 'right' },
  player: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 6 },
  slotPos: { ...type.micro, color: colors.accent, width: 28 },
});

import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { HeaderBar } from '@/components/ui/HeaderBar';
import { Screen } from '@/components/ui/Screen';
import type { Fixture } from '@/data/types';
import {
  fantasyEventFetchIds,
  fantasyLockLabel,
  gameweekContaining,
  gameweekDeadline,
  gameweekLabel,
  memberCount,
  membersOf,
  pickFor,
  rankFantasyLeague,
  scoreFantasyXi,
} from '@/lib/fantasy';
import {
  FANTASY_EVENTS_COPY,
  FANTASY_GW_WINDOW_COPY,
  FANTASY_NOT_GAMBLING,
  FANTASY_SCORING_RULES,
  fantasyDisclaimer,
} from '@/lib/honesty';
import { kickoffLabel } from '@/lib/format';
import { safeBack } from '@/lib/navBack';
import { routeId } from '@/lib/routeParams';
import { useFantasy } from '@/lib/useFantasy';
import { useFootballCatalog } from '@/lib/useFootballCatalog';
import { useLiveTick } from '@/lib/useLiveTick';
import { useApp } from '@/services/AppProvider';
import { football } from '@/services/football';
import { colors, radius, spacing, type } from '@/theme';

export default function FantasyLeagueScreen() {
  useLiveTick();
  useFootballCatalog();
  const { leagueId: raw } = useLocalSearchParams<{ leagueId?: string | string[] }>();
  const leagueId = routeId(raw);
  const { users } = useApp();
  const fantasy = useFantasy();
  const triedEvents = useRef(new Set<string>());
  const now = new Date();
  const gw = gameweekContaining(now);
  const fixtures = football.getFixtures() as Fixture[];
  const deadline = gameweekDeadline(fixtures, gw, now);
  const league = fantasy.snapshot?.leagues.find((row) => row.id === leagueId);
  const standings =
    fantasy.snapshot && fantasy.userId && league
      ? rankFantasyLeague({
          snapshot: fantasy.snapshot,
          leagueId: league.id,
          gameweek: gw,
          fixtures,
          users,
          currentUserId: fantasy.userId,
        })
      : [];
  const mine = fantasy.snapshot && fantasy.userId ? pickFor(fantasy.snapshot, fantasy.userId, gw.id) : undefined;
  const mineScore = mine ? scoreFantasyXi(mine.slots, fixtures, gw) : null;

  useEffect(() => {
    if (!fantasy.snapshot || !leagueId) return;
    const teamIds = new Set<string>();
    for (const member of membersOf(fantasy.snapshot, leagueId)) {
      const pick = pickFor(fantasy.snapshot, member.userId, gw.id);
      for (const slot of pick?.slots ?? []) teamIds.add(slot.teamId);
    }
    const ids = fantasyEventFetchIds(football.getFixtures(), teamIds, gw).filter((id) => !triedEvents.current.has(id));
    for (const id of ids) {
      triedEvents.current.add(id);
      void football.ensureMatchDetail(id);
    }
  }, [fantasy.snapshot, gw.id, leagueId]);

  return (
    <Screen padded={false}>
      <View style={styles.pad}>
        <HeaderBar title={league?.name ?? 'Mini-league'} onBack={() => safeBack('/fantasy')} />
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        {!fantasy.loading && !league ? (
          <EmptyState
            title="League not on this account"
            body="It may be a demo league from another profile, or the invite has not been joined on this email."
            actionLabel="Back to Fantasy"
            onAction={() => router.replace('/fantasy')}
          />
        ) : null}
        {league && fantasy.snapshot ? (
          <>
            <Text style={styles.kicker}>{gameweekLabel(gw.id)}</Text>
            <Text style={styles.code}>{league.inviteCode}</Text>
            <Text style={styles.meta}>
              {memberCount(fantasy.snapshot, league.id)} fans · share this code to join
            </Text>
            <Text style={styles.body}>{fantasyLockLabel(deadline, kickoffLabel)}</Text>
            <Text style={styles.caption}>{FANTASY_NOT_GAMBLING}</Text>
            <Text style={styles.caption}>{FANTASY_SCORING_RULES}</Text>
            <Text style={styles.caption}>{FANTASY_GW_WINDOW_COPY}</Text>
            <Text style={styles.caption}>{FANTASY_EVENTS_COPY}</Text>
            <Text style={styles.caption}>{fantasyDisclaimer(fantasy.live)}</Text>
            <Button
              label={deadline.locked ? 'View XI' : mine ? 'Edit XI' : 'Set XI'}
              onPress={() => router.push('/fantasy/xi')}
              accessibilityLabel={deadline.locked ? 'View XI' : 'Set XI'}
            />
            {mineScore && mineScore.lines.length > 0 ? (
              <Text style={styles.caption}>
                Your goals:{' '}
                {mineScore.lines.map((line) => `${line.playerName} ${line.goals} · ${line.points}`).join(', ')}
              </Text>
            ) : (
              <Text style={styles.caption}>
                {mine ? 'No goals for your XI in this window yet.' : 'You have not set an XI this gameweek.'}
              </Text>
            )}
            <Text style={styles.section}>Standings</Text>
            <Text style={styles.caption}>Tie-break: goals, then name.</Text>
            {standings.map((row) => (
              <View key={row.userId} style={[styles.row, row.isCurrentUser && styles.mine]}>
                <Text style={styles.rank}>{row.rank}</Text>
                <Avatar initials={row.initials} color={row.avatarColor} size={36} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.name} numberOfLines={1}>
                    {row.name}
                    {row.isCurrentUser ? ' · you' : ''}
                  </Text>
                  <Text style={styles.caption} numberOfLines={1}>
                    @{row.handle}
                    {row.hasXi ? ` · ${row.goals} goals` : ' · no XI'}
                  </Text>
                </View>
                <Text style={styles.pts}>{row.points}</Text>
              </View>
            ))}
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
  code: { ...type.hero, color: colors.text, letterSpacing: 2 },
  meta: { ...type.caption, color: colors.textMuted },
  body: { ...type.body, color: colors.text, lineHeight: 22 },
  caption: { ...type.caption, color: colors.textMuted, lineHeight: 18 },
  section: { ...type.badge, color: colors.textMuted, marginTop: spacing.md },
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
  pts: { ...type.subtitle, color: colors.text },
});

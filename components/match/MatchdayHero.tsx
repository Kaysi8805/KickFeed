import { router } from 'expo-router';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { Crest, LeagueMark } from '@/components/ui/Crest';
import { Button } from '@/components/ui/Button';
import { LiveBadge } from '@/components/match/LiveBadge';
import type { Fixture } from '@/data/types';
import { entityHref } from '@/lib/entityNav';
import { kickoffLabel } from '@/lib/format';
import { matchdayWhyLabel, type MatchdayWhy } from '@/lib/matchdayHome';
import { football } from '@/services/football';
import { colors, glow, radius, spacing, type } from '@/theme';

function lastGoalLine(fixture: Fixture): string | undefined {
  const goal = [...fixture.events].reverse().find((e) => e.type === 'goal');
  if (!goal) return undefined;
  const team = football.getTeam(goal.teamId);
  return `${goal.minute}' ${goal.playerName}${team ? ` · ${team.shortName}` : ''}`;
}

export function MatchdayHero({
  fixture,
  why,
}: {
  fixture: Fixture;
  why: MatchdayWhy;
}) {
  const home = football.getTeam(fixture.homeTeamId);
  const away = football.getTeam(fixture.awayTeamId);
  const league = football.getLeague(fixture.leagueId);
  if (!home || !away) return null;

  const live = fixture.status === 'live' || fixture.status === 'ht';
  const done = fixture.status === 'finished';
  const soon = fixture.status === 'upcoming';
  const goal = lastGoalLine(fixture);
  const openMatch = () => router.push(entityHref('match', fixture.id));
  const matchLabel = `${home.shortName} versus ${away.shortName}. Open match hub.`;

  return (
    <View style={[styles.card, live && styles.cardLive]}>
      <View style={styles.meta}>
        <Text style={styles.why}>{matchdayWhyLabel(why)}</Text>
        {league ? (
          <Pressable
            onPress={() => router.push(entityHref('league', league.id))}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`${league.shortName} league`}
          >
            <View style={styles.leagueRow}>
              <LeagueMark league={league} size={18} />
              <Text style={styles.league}>{league.shortName}</Text>
            </View>
          </Pressable>
        ) : null}
      </View>
      <View style={styles.row}>
        <Pressable
          onPress={() => router.push(entityHref('team', home.id))}
          style={({ pressed }) => [styles.side, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={home.shortName}
        >
          <View style={[styles.crestRing, live && styles.crestRingLive]}>
            <Crest team={home} size={52} />
          </View>
          <Text style={styles.team} numberOfLines={2}>
            {home.shortName}
          </Text>
        </Pressable>
        <View style={styles.mid}>
          {soon ? (
            <>
              <Text style={styles.soonKicker}>Kickoff</Text>
              <Text style={styles.ko}>{kickoffLabel(fixture.kickoff)}</Text>
            </>
          ) : (
            <Text style={styles.score}>
              {fixture.homeScore}  –  {fixture.awayScore}
            </Text>
          )}
          {live ? <LiveBadge minute={fixture.minute} ht={fixture.status === 'ht'} /> : null}
          {done ? <Text style={styles.ft}>Full time</Text> : null}
        </View>
        <Pressable
          onPress={() => router.push(entityHref('team', away.id))}
          style={({ pressed }) => [styles.side, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={away.shortName}
        >
          <View style={[styles.crestRing, live && styles.crestRingLive]}>
            <Crest team={away} size={52} />
          </View>
          <Text style={styles.team} numberOfLines={2}>
            {away.shortName}
          </Text>
        </Pressable>
      </View>
      {goal ? <Text style={styles.goal}>{goal}</Text> : null}
      {fixture.venue ? <Text style={styles.venue}>{fixture.venue}</Text> : null}
      <View style={styles.cta}>
        <Button label="Open match hub" onPress={openMatch} accessibilityLabel={matchLabel} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  cardLive: {
    borderColor: colors.live,
    ...(Platform.OS === 'web' ? { boxShadow: glow.liveBox } : glow.live),
  },
  meta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  why: {
    ...type.badge,
    color: colors.textMuted,
    flex: 1,
  },
  leagueRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  league: { ...type.badge, color: colors.textMuted },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  side: { flex: 1, alignItems: 'center', gap: 8 },
  pressed: { opacity: 0.9 },
  crestRing: {
    borderRadius: 16,
    padding: 2,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  crestRingLive: {
    borderColor: colors.live,
    ...(Platform.OS === 'web' ? { boxShadow: glow.liveBox } : glow.live),
  },
  team: { ...type.meta, color: colors.text, textAlign: 'center' },
  mid: { alignItems: 'center', minWidth: 96, gap: 6 },
  score: { ...type.displayScore, color: colors.text },
  soonKicker: { ...type.meta, color: colors.textMuted, textTransform: 'uppercase' },
  ko: { ...type.meta, color: colors.textMuted, textAlign: 'center' },
  ft: { ...type.badge, color: colors.textMuted },
  goal: {
    ...type.meta,
    color: colors.gold,
    textAlign: 'center',
    marginTop: spacing.md,
    fontWeight: '700',
  },
  venue: {
    ...type.meta,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
    fontWeight: '500',
  },
  cta: { marginTop: spacing.md },
});

import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Crest } from '@/components/ui/Crest';
import { LiveBadge } from '@/components/match/LiveBadge';
import type { Fixture } from '@/data/types';
import { entityHref } from '@/lib/entityNav';
import { kickoffLabel } from '@/lib/format';
import { matchdayWhyLabel, type MatchdayWhy } from '@/lib/matchdayHome';
import { football } from '@/services/football';
import { colors, radius, shadow, spacing, type } from '@/theme';

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

  return (
    <Pressable
      onPress={() => router.push(entityHref('match', fixture.id))}
      accessibilityRole="button"
      accessibilityLabel={`${home.shortName} versus ${away.shortName}. Open match hub.`}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}
    >
      <View style={styles.meta}>
        <Text style={styles.why}>{matchdayWhyLabel(why)}</Text>
        {league ? (
          <Pressable onPress={() => router.push(entityHref('league', league.id))} hitSlop={8}>
            <Text style={styles.league}>{league.shortName}</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={styles.row}>
        <Pressable onPress={() => router.push(entityHref('team', home.id))} style={styles.side}>
          <Crest team={home} size={52} />
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
        <Pressable onPress={() => router.push(entityHref('team', away.id))} style={styles.side}>
          <Crest team={away} size={52} />
          <Text style={styles.team} numberOfLines={2}>
            {away.shortName}
          </Text>
        </Pressable>
      </View>
      {goal ? <Text style={styles.goal}>{goal}</Text> : null}
      {fixture.venue ? <Text style={styles.venue}>{fixture.venue}</Text> : null}
      <View style={styles.cta}>
        <Text style={styles.ctaText}>Open match hub</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bgElevated,
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.pitch,
    marginBottom: spacing.md,
    ...shadow.card,
  },
  meta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  why: {
    ...type.micro,
    color: colors.lime,
    textTransform: 'uppercase',
    flex: 1,
  },
  league: { ...type.micro, color: colors.limeMuted, textTransform: 'uppercase' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  side: { flex: 1, alignItems: 'center', gap: 8 },
  team: { ...type.caption, color: colors.text, textAlign: 'center' },
  mid: { alignItems: 'center', minWidth: 96, gap: 6 },
  score: { ...type.score, color: colors.text },
  soonKicker: { ...type.subtitle, color: colors.lime },
  ko: { ...type.caption, color: colors.textMuted, textAlign: 'center' },
  ft: { ...type.micro, color: colors.textMuted },
  goal: {
    ...type.caption,
    color: colors.gold,
    textAlign: 'center',
    marginTop: spacing.md,
    fontWeight: '700',
  },
  venue: {
    ...type.caption,
    color: colors.textDim,
    textAlign: 'center',
    marginTop: spacing.sm,
    fontWeight: '500',
  },
  cta: {
    marginTop: spacing.md,
    minHeight: 44,
    borderRadius: radius.full,
    backgroundColor: colors.lime,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { ...type.caption, color: colors.bg, fontWeight: '800' },
});

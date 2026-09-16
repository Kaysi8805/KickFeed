import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { TeamLink } from '@/components/entity/TeamLink';
import { EmptyState } from '@/components/ui/EmptyState';
import { HeaderBar } from '@/components/ui/HeaderBar';
import { Screen } from '@/components/ui/Screen';
import { entityHref } from '@/lib/entityNav';
import { kickoffLabel } from '@/lib/format';
import { useApp } from '@/services/AppProvider';
import { football } from '@/services/football';
import { colors, radius, spacing, type } from '@/theme';

export default function PlayerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { favoritePlayerIds, toggleFavoritePlayer } = useApp();
  const player = football.getPlayer(id);

  if (!player) {
    return (
      <Screen>
        <HeaderBar title="Player" onBack={() => router.back()} />
        <EmptyState title="Unknown player" body="This player isn’t in the mock catalog." />
      </Screen>
    );
  }

  const team = football.getTeam(player.teamId);
  const stats = football.getPlayerStats(player.id);
  const apps = football.getPlayerAppearances(player.id);
  const country = team ? football.getCountry(team.countryId) : undefined;
  const fav = favoritePlayerIds.includes(player.id);

  return (
    <Screen padded={false}>
      <View style={styles.pad}>
        <HeaderBar
          title={player.shortName}
          onBack={() => router.back()}
          right={
            <Pressable onPress={() => toggleFavoritePlayer(player.id)}>
              <Text style={styles.star}>{fav ? '★ Following' : '☆ Follow'}</Text>
            </Pressable>
          }
        />
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
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

        {stats ? (
          <View style={styles.stats}>
            <Stat n={stats.appearances} label="Apps" />
            <Stat n={stats.goals} label="Goals" />
            <Stat n={stats.assists} label="Assists" />
            <Stat n={stats.rating.toFixed(1)} label="Rating" />
            <Stat n={stats.minutes} label="Mins" />
            <Stat n={stats.yellows} label="Yellows" />
          </View>
        ) : null}

        <Text style={styles.hint}>Season numbers are mock placeholders until a live football API is wired in.</Text>

        <Text style={styles.section}>Recent appearances</Text>
        {apps.length === 0 ? (
          <Text style={styles.muted}>No mock appearances in the current fixture window.</Text>
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
                <Text style={styles.rating}>{a.rating.toFixed(1)}</Text>
              </Pressable>
            );
          })
        )}

        {team ? (
          <Pressable onPress={() => router.push(entityHref('team', team.id))} style={styles.backTeam}>
            <Text style={styles.backTeamText}>View full {team.shortName} squad →</Text>
          </Pressable>
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
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: 40 },
  hero: { alignItems: 'center', marginBottom: spacing.lg, gap: 6 },
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
  role: { ...type.caption, color: colors.limeMuted },
  star: { ...type.caption, color: colors.gold },
  teamWrap: { marginTop: 8 },
  teamName: { ...type.subtitle, fontSize: 15, color: colors.text },
  meta: { ...type.caption, color: colors.textMuted, fontWeight: '500' },
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
  statN: { ...type.title, fontSize: 20, color: colors.text },
  statL: { ...type.micro, color: colors.textDim, marginTop: 2 },
  hint: { ...type.caption, color: colors.textDim, fontWeight: '500', marginTop: spacing.md, lineHeight: 18 },
  section: { ...type.micro, color: colors.textMuted, marginTop: spacing.xl, marginBottom: spacing.sm },
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
  appLeague: { ...type.micro, color: colors.limeMuted, textTransform: 'uppercase' },
  appTitle: { ...type.subtitle, fontSize: 14, color: colors.text, marginTop: 2 },
  appMeta: { ...type.caption, color: colors.textMuted, fontWeight: '500', marginTop: 2 },
  rating: { ...type.title, fontSize: 20, color: colors.gold },
  backTeam: {
    marginTop: spacing.lg,
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  backTeamText: { ...type.caption, color: colors.lime },
});

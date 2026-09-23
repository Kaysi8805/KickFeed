import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Crest } from '@/components/ui/Crest';
import { EmptyState } from '@/components/ui/EmptyState';
import type { Lineup, LineupPlayer, Team } from '@/data/types';
import { entityHref } from '@/lib/entityNav';
import {
  LINEUPS_CACHE_MISS_BODY,
  LINEUPS_CACHE_MISS_TITLE,
  LINEUPS_ERROR_BODY,
  LINEUPS_ERROR_TITLE,
  LINEUPS_LOADING_BODY,
  LINEUPS_LOADING_TITLE,
} from '@/lib/honesty';
import { colors, radius, spacing, type } from '@/theme';

type LineupPhase = 'idle' | 'loading' | 'ready' | 'empty' | 'error';

function PlayerRow({ player }: { player: LineupPlayer }) {
  const label = `${player.number} · ${player.name} · ${player.pos}`;
  if (!player.playerId) {
    return (
      <Text style={styles.player} accessibilityLabel={label}>
        {player.number} · {player.name}
        <Text style={styles.pos}> · {player.pos}</Text>
      </Text>
    );
  }
  const playerId = player.playerId;
  return (
    <Pressable
      onPress={() => router.push(entityHref('player', playerId))}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={styles.rowHit}
    >
      <Text style={styles.player}>
        {player.number} · {player.name}
        <Text style={styles.pos}> · {player.pos}</Text>
      </Text>
    </Pressable>
  );
}

function BenchList({ lineup }: { lineup: Lineup }) {
  const [open, setOpen] = useState(false);
  if (!lineup.bench) return null;
  const count = lineup.bench.length;
  return (
    <View style={styles.bench}>
      <Pressable
        onPress={() => setOpen((value) => !value)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={open ? 'Hide bench' : `Bench, ${count}`}
        style={styles.rowHit}
      >
        <Text style={styles.benchToggle}>{open ? 'Hide bench' : `Bench · ${count}`}</Text>
      </Pressable>
      {open ? (
        count === 0 ? (
          <Text style={styles.muted}>No substitutes listed.</Text>
        ) : (
          lineup.bench.map((player) => (
            <PlayerRow key={`b-${player.playerId ?? player.number}-${player.name}`} player={player} />
          ))
        )
      ) : null}
    </View>
  );
}

function Side({ team, lineup }: { team: Team; lineup: Lineup }) {
  const formation = lineup.formation && lineup.formation !== '—' ? lineup.formation : undefined;
  if (!lineup.players.length) {
    return (
      <View style={styles.card}>
        <Text style={styles.sectionLabel}>{team.shortName}</Text>
        <Text style={styles.muted}>{LINEUPS_CACHE_MISS_TITLE}</Text>
      </View>
    );
  }
  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Crest team={team} size={22} />
        <Text style={styles.sectionLabel}>{team.shortName}</Text>
        {formation ? <Text style={styles.sectionLabel}>{formation}</Text> : null}
      </View>
      {lineup.coach ? <Text style={styles.coach}>Coach · {lineup.coach}</Text> : null}
      {lineup.players.map((player) => (
        <PlayerRow key={`${player.playerId ?? player.number}-${player.name}`} player={player} />
      ))}
      <BenchList lineup={lineup} />
    </View>
  );
}

export function LineupsSection({
  home,
  away,
  lineups,
  phase,
  liveCatalog,
  onRetry,
}: {
  home: Team;
  away: Team;
  lineups: { home: Lineup; away: Lineup };
  phase: LineupPhase;
  liveCatalog: boolean;
  onRetry?: () => void;
}) {
  const hasPlayers = lineups.home.players.length > 0 || lineups.away.players.length > 0;
  const waiting = !hasPlayers && (phase === 'idle' || phase === 'loading');

  if (waiting) {
    return <EmptyState compact title={LINEUPS_LOADING_TITLE} body={LINEUPS_LOADING_BODY} />;
  }
  if (!hasPlayers && phase === 'error') {
    return (
      <EmptyState
        compact
        title={LINEUPS_ERROR_TITLE}
        body={LINEUPS_ERROR_BODY}
        actionLabel={onRetry ? 'Try again' : undefined}
        onAction={onRetry}
      />
    );
  }
  if (!hasPlayers) {
    if (!liveCatalog) {
      return (
        <EmptyState compact title="No demo lineup" body="This club has no seeded squad to build an XI from." />
      );
    }
    return <EmptyState compact title={LINEUPS_CACHE_MISS_TITLE} body={LINEUPS_CACHE_MISS_BODY} />;
  }

  return (
    <View style={styles.wrap}>
      <Side team={home} lineup={lineups.home} />
      <Side team={away} lineup={lineups.away} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: spacing.lg, gap: spacing.md },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 2,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.sm },
  sectionLabel: { ...type.micro, color: colors.lime, textTransform: 'uppercase' },
  coach: { ...type.caption, color: colors.textMuted, marginBottom: spacing.sm },
  rowHit: { minHeight: 44, justifyContent: 'center' },
  player: { ...type.caption, color: colors.text },
  pos: { color: colors.textMuted },
  bench: { marginTop: spacing.sm },
  benchToggle: { ...type.caption, color: colors.lime },
  muted: { ...type.caption, color: colors.textDim, fontWeight: '500' },
});

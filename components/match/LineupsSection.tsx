import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Crest } from '@/components/ui/Crest';
import { EmptyState } from '@/components/ui/EmptyState';
import type { Lineup, LineupPlayer, Player, Team } from '@/data/types';
import { entityHref } from '@/lib/entityNav';
import {
  FREE_TIER_CACHE_MISS,
  LINEUPS_CACHE_MISS_BODY,
  LINEUPS_ERROR_BODY,
  LINEUPS_ERROR_TITLE,
  LINEUPS_LOADING_BODY,
  LINEUPS_LOADING_TITLE,
} from '@/lib/honesty';
import { lineupIsSheet, pitchPoints, type PitchPoint } from '@/lib/lineupPitch';
import { shortPlayerName } from '@/services/footballMap';
import { colors, radius, spacing, type } from '@/theme';

type LineupPhase = 'idle' | 'loading' | 'ready' | 'empty' | 'error';

function PlayerName({
  player,
  resolvePlayer,
}: {
  player: LineupPlayer;
  resolvePlayer: (id: string) => Player | undefined;
}) {
  const known = player.playerId ? resolvePlayer(player.playerId) : undefined;
  const label = `${player.number}  ${player.name}`;
  return (
    <Pressable
      disabled={!known}
      onPress={() => known && router.push(entityHref('player', known.id))}
      accessibilityRole={known ? 'button' : undefined}
      accessibilityLabel={known ? `${player.name}, number ${player.number}` : player.name}
    >
      <Text style={[styles.player, known ? styles.link : null]}>
        {label}
        <Text style={styles.pos}>  {player.pos}</Text>
      </Text>
    </Pressable>
  );
}

function PitchChip({
  point,
  side,
  resolvePlayer,
}: {
  point: PitchPoint;
  side: 'home' | 'away';
  resolvePlayer: (id: string) => Player | undefined;
}) {
  const player = point.player;
  const known = player.playerId ? resolvePlayer(player.playerId) : undefined;
  return (
    <Pressable
      disabled={!known}
      onPress={() => known && router.push(entityHref('player', known.id))}
      accessibilityRole={known ? 'button' : undefined}
      accessibilityLabel={`${player.name}, ${player.pos}, number ${player.number}`}
      style={[styles.chip, { left: `${point.x * 100}%`, top: `${point.y * 100}%` }]}
    >
      <View style={[styles.chipDisc, side === 'away' ? styles.chipAway : null]}>
        <Text style={[styles.chipNum, side === 'away' ? styles.chipNumAway : null]}>{player.number}</Text>
      </View>
      <Text style={styles.chipName} numberOfLines={1}>
        {shortPlayerName(player.name)}
      </Text>
    </Pressable>
  );
}

function SideList({
  team,
  lineup,
  resolvePlayer,
}: {
  team: Team;
  lineup: Lineup;
  resolvePlayer: (id: string) => Player | undefined;
}) {
  return (
    <View style={styles.sideCol}>
      <View style={styles.lineHead}>
        <Crest team={team} size={20} />
        <Text style={styles.lineTitle}>
          {team.code}
          {lineup.formation && lineup.formation !== '—' ? ` · ${lineup.formation}` : ''}
        </Text>
      </View>
      {lineup.players.map((player) => (
        <PlayerName key={`${team.id}-${player.playerId ?? player.number}-${player.name}`} player={player} resolvePlayer={resolvePlayer} />
      ))}
    </View>
  );
}

function Bench({
  team,
  lineup,
  resolvePlayer,
}: {
  team: Team;
  lineup: Lineup;
  resolvePlayer: (id: string) => Player | undefined;
}) {
  if (!lineup.bench && !lineup.coach) return null;
  return (
    <View style={styles.bench}>
      <View style={styles.lineHead}>
        <Crest team={team} size={18} />
        <Text style={styles.lineTitle}>{team.shortName} bench</Text>
      </View>
      {lineup.coach ? <Text style={styles.coach}>Coach · {lineup.coach}</Text> : null}
      {!lineup.bench ? null : lineup.bench.length === 0 ? (
        <Text style={styles.muted}>
          {lineup.source === 'sheet' ? 'No substitutes on this sheet.' : 'No substitutes in this lineup.'}
        </Text>
      ) : (
        lineup.bench.map((player) => (
          <PlayerName
            key={`${team.id}-b-${player.playerId ?? player.number}-${player.name}`}
            player={player}
            resolvePlayer={resolvePlayer}
          />
        ))
      )}
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
  resolvePlayer,
}: {
  home: Team;
  away: Team;
  lineups: { home: Lineup; away: Lineup };
  phase: LineupPhase;
  liveCatalog: boolean;
  onRetry?: () => void;
  resolvePlayer: (id: string) => Player | undefined;
}) {
  const [pitchWidth, setPitchWidth] = useState(0);
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
        <EmptyState
          compact
          title="No demo lineup"
          body="This club has no seeded squad to build an XI from."
        />
      );
    }
    return <EmptyState compact title={FREE_TIER_CACHE_MISS} body={LINEUPS_CACHE_MISS_BODY} />;
  }

  const homePoints = pitchPoints(lineups.home.players, lineups.home.formation, 'home');
  const awayPoints = pitchPoints(lineups.away.players, lineups.away.formation, 'away');
  const showPitch = !!homePoints || !!awayPoints;
  const confirmed = lineupIsSheet(lineups.home) || lineupIsSheet(lineups.away);
  const demo = liveCatalog && (lineups.home.source === 'demo' || lineups.away.source === 'demo') && !confirmed;

  return (
    <View style={styles.wrap}>
      <View style={styles.badgeRow}>
        {confirmed ? <Text style={styles.badge}>Confirmed</Text> : null}
        {demo ? <Text style={styles.badge}>Demo XI</Text> : null}
        <Text style={styles.formations}>
          {home.code}
          {lineups.home.formation && lineups.home.formation !== '—' ? ` ${lineups.home.formation}` : ''}
          {'   '}
          {away.code}
          {lineups.away.formation && lineups.away.formation !== '—' ? ` ${lineups.away.formation}` : ''}
        </Text>
      </View>

      {showPitch ? (
        <View
          style={[styles.pitch, pitchWidth > 0 ? { height: Math.round(pitchWidth * 1.35) } : null]}
          onLayout={(event) => setPitchWidth(event.nativeEvent.layout.width)}
        >
          <View style={styles.halfLine} />
          <View style={styles.centerCircle} />
          <View style={styles.boxTop} />
          <View style={styles.boxBottom} />
          {awayPoints?.map((point) => (
            <PitchChip key={point.key} point={point} side="away" resolvePlayer={resolvePlayer} />
          ))}
          {homePoints?.map((point) => (
            <PitchChip key={point.key} point={point} side="home" resolvePlayer={resolvePlayer} />
          ))}
        </View>
      ) : null}

      {!homePoints && lineups.home.players.length > 0 ? (
        <View style={styles.listRow}>
          <SideList team={home} lineup={lineups.home} resolvePlayer={resolvePlayer} />
          {!awayPoints && lineups.away.players.length > 0 ? (
            <SideList team={away} lineup={lineups.away} resolvePlayer={resolvePlayer} />
          ) : null}
        </View>
      ) : !awayPoints && lineups.away.players.length > 0 ? (
        <SideList team={away} lineup={lineups.away} resolvePlayer={resolvePlayer} />
      ) : null}

      {lineups.home.players.length === 0 ? (
        <Text style={styles.muted}>
          {home.shortName}: {FREE_TIER_CACHE_MISS}
        </Text>
      ) : null}
      {lineups.away.players.length === 0 ? (
        <Text style={styles.muted}>
          {away.shortName}: {FREE_TIER_CACHE_MISS}
        </Text>
      ) : null}

      <Bench team={home} lineup={lineups.home} resolvePlayer={resolvePlayer} />
      <Bench team={away} lineup={lineups.away} resolvePlayer={resolvePlayer} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: spacing.lg, gap: spacing.md },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  badge: {
    ...type.badge,
    color: colors.text,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  formations: { ...type.caption, color: colors.textMuted, flexShrink: 1 },
  pitch: {
    backgroundColor: colors.bg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.pitch,
    minHeight: 280,
    overflow: 'hidden',
  },
  halfLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '50%',
    height: 1,
    backgroundColor: colors.pitch,
    opacity: 0.85,
  },
  centerCircle: {
    position: 'absolute',
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 1,
    borderColor: colors.pitch,
    left: '50%',
    top: '50%',
    marginLeft: -36,
    marginTop: -36,
  },
  boxTop: {
    position: 'absolute',
    top: 0,
    left: '22%',
    width: '56%',
    height: '14%',
    borderWidth: 1,
    borderColor: colors.pitch,
    borderTopWidth: 0,
  },
  boxBottom: {
    position: 'absolute',
    bottom: 0,
    left: '22%',
    width: '56%',
    height: '14%',
    borderWidth: 1,
    borderColor: colors.pitch,
    borderBottomWidth: 0,
  },
  chip: {
    position: 'absolute',
    width: 68,
    marginLeft: -34,
    marginTop: -14,
    alignItems: 'center',
  },
  chipDisc: {
    minWidth: 26,
    height: 26,
    paddingHorizontal: 6,
    borderRadius: 13,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipAway: { borderColor: colors.gold },
  chipNum: { ...type.micro, color: colors.text, letterSpacing: 0 },
  chipNumAway: { color: colors.gold },
  chipName: { ...type.micro, color: colors.text, letterSpacing: 0, marginTop: 2, textAlign: 'center' },
  listRow: { flexDirection: 'row', gap: spacing.md },
  sideCol: { flex: 1 },
  lineHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.sm },
  lineTitle: { ...type.micro, color: colors.textMuted },
  player: { ...type.caption, color: colors.text, marginBottom: 6 },
  pos: { color: colors.textDim },
  link: { color: colors.lime },
  bench: { gap: 2 },
  coach: { ...type.caption, color: colors.textMuted, marginBottom: 4 },
  muted: { ...type.caption, color: colors.textDim, fontWeight: '500' },
});

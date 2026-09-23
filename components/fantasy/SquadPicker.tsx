import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import type { PlayerPosition } from '@/data/types';
import { entityHref } from '@/lib/entityNav';
import {
  FANTASY_CLUB_CAP,
  clubCount,
  clubsForCompetition,
  playersForFantasyAdd,
  positionsStillAllowed,
  type FantasySlot,
} from '@/lib/fantasy';
import { FANTASY_SQUAD_HINT } from '@/lib/honesty';
import { football } from '@/services/football';
import { colors, radius, spacing, type } from '@/theme';

const POS_LABEL: Record<PlayerPosition, string> = {
  GK: 'GK',
  DF: 'DEF',
  MF: 'MID',
  FW: 'FWD',
};

export function SquadPicker({
  competitionId,
  draft,
  locked,
  busy,
  onChange,
  onSave,
}: {
  competitionId: string;
  draft: FantasySlot[];
  locked: boolean;
  busy: boolean;
  onChange: (next: FantasySlot[]) => void;
  onSave: () => void;
}) {
  const [pos, setPos] = useState<PlayerPosition | null>(null);
  const [clubQuery, setClubQuery] = useState('');
  const [playerQuery, setPlayerQuery] = useState('');
  const [teamId, setTeamId] = useState<string | null>(null);
  const [loadingSquad, setLoadingSquad] = useState(false);
  const allowed = positionsStillAllowed(draft);
  const clubs = clubsForCompetition((id) => football.getTeams(id), competitionId).filter((club) =>
    club.name.toLowerCase().includes(clubQuery.trim().toLowerCase()),
  );
  const taken = new Set(draft.map((slot) => slot.playerId));
  const clubFull = teamId != null && clubCount(draft, teamId) >= FANTASY_CLUB_CAP;
  const choices =
    pos && teamId && !clubFull
      ? playersForFantasyAdd(football.getSquad(teamId), teamId, pos, taken, playerQuery).slice(0, 40)
      : [];

  async function loadClub(id: string) {
    setTeamId(id);
    setLoadingSquad(true);
    try {
      await football.ensureSquad(id);
    } finally {
      setLoadingSquad(false);
    }
  }

  function add(player: { id: string; shortName: string; teamId: string; pos: PlayerPosition; number: number }) {
    if (locked || !positionsStillAllowed(draft).includes(player.pos)) return;
    if (clubCount(draft, player.teamId) >= FANTASY_CLUB_CAP) return;
    onChange([
      ...draft,
      {
        pos: player.pos,
        playerId: player.id,
        playerName: player.shortName,
        teamId: player.teamId,
        number: player.number,
      },
    ]);
    setPlayerQuery('');
  }

  return (
    <View style={styles.wrap}>
      {draft.map((slot) => (
        <View key={slot.playerId} style={styles.slot}>
          <Text style={styles.slotPos}>{POS_LABEL[slot.pos]}</Text>
          <Pressable
            onPress={() => router.push(entityHref('player', slot.playerId))}
            style={{ flex: 1 }}
            accessibilityRole="link"
            accessibilityLabel={`${slot.playerName}, open player`}
          >
            <Text style={styles.slotName} numberOfLines={1}>
              {slot.number ? `${slot.number} ` : ''}
              {slot.playerName}
            </Text>
          </Pressable>
          {locked ? null : (
            <Pressable
              onPress={() => onChange(draft.filter((row) => row.playerId !== slot.playerId))}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${slot.playerName}`}
            >
              <Text style={styles.remove}>Remove</Text>
            </Pressable>
          )}
        </View>
      ))}
      <Text style={styles.hint}>
        {draft.length}/11 · GK {draft.filter((slot) => slot.pos === 'GK').length}/1 · DEF{' '}
        {draft.filter((slot) => slot.pos === 'DF').length} · MID {draft.filter((slot) => slot.pos === 'MF').length} · FWD{' '}
        {draft.filter((slot) => slot.pos === 'FW').length}
      </Text>
      {locked ? (
        <Text style={styles.hint}>This XI is locked for the round.</Text>
      ) : (
        <>
          <Text style={styles.hint}>{FANTASY_SQUAD_HINT}</Text>
          <View style={styles.posRow}>
            {(['GK', 'DF', 'MF', 'FW'] as const).map((key) => {
              const open = allowed.includes(key);
              return (
                <Pressable
                  key={key}
                  disabled={!open}
                  onPress={() => setPos(key)}
                  style={[styles.pos, pos === key && styles.posOn, !open && styles.posOff]}
                  accessibilityRole="button"
                  accessibilityLabel={`Add ${POS_LABEL[key]}`}
                >
                  <Text style={styles.posText}>{POS_LABEL[key]}</Text>
                </Pressable>
              );
            })}
          </View>
          <TextInput
            value={clubQuery}
            onChangeText={setClubQuery}
            placeholder="Find a club in this competition"
            placeholderTextColor={colors.textDim}
            style={styles.input}
            accessibilityLabel="Find a club"
          />
          <View style={styles.clubs}>
            {clubs.slice(0, 8).map((club) => (
              <Pressable
                key={club.id}
                onPress={() => void loadClub(club.id)}
                style={[styles.club, teamId === club.id && styles.clubOn]}
                accessibilityRole="button"
                accessibilityLabel={`Load ${club.name}`}
              >
                <Text style={styles.clubText}>{club.shortName}</Text>
              </Pressable>
            ))}
          </View>
          {clubFull ? <Text style={styles.hint}>3 players already from this club.</Text> : null}
          {loadingSquad ? <Text style={styles.hint}>Loading squad from the free-tier cache…</Text> : null}
          {pos && teamId && !clubFull ? (
            <TextInput
              value={playerQuery}
              onChangeText={setPlayerQuery}
              placeholder={`Search ${POS_LABEL[pos]}`}
              placeholderTextColor={colors.textDim}
              style={styles.input}
              accessibilityLabel="Search players"
            />
          ) : null}
          {choices.map((player) => (
            <Pressable
              key={player.id}
              onPress={() => add(player)}
              style={styles.player}
              accessibilityRole="button"
              accessibilityLabel={`Add ${player.name}`}
            >
              <Text style={styles.playerPos}>{POS_LABEL[player.pos]}</Text>
              <Text style={styles.playerName} numberOfLines={1}>
                {player.number ? `${player.number} ` : ''}
                {player.name}
              </Text>
            </Pressable>
          ))}
          <Button label={busy ? 'Saving…' : 'Save XI'} onPress={onSave} accessibilityLabel="Save XI" />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  slot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  slotPos: { ...type.micro, color: colors.accent, width: 36 },
  slotName: { ...type.body, color: colors.text },
  remove: { ...type.caption, color: colors.danger },
  hint: { ...type.caption, color: colors.textMuted, lineHeight: 18 },
  posRow: { flexDirection: 'row', gap: 8 },
  pos: {
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.surfaceElevated,
  },
  posOn: { borderColor: colors.accent },
  posOff: { opacity: 0.4 },
  posText: { ...type.caption, color: colors.text },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    ...type.body,
  },
  clubs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  club: {
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  clubOn: { borderColor: colors.accent },
  clubText: { ...type.caption, color: colors.text },
  player: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  playerPos: { ...type.micro, color: colors.textMuted, width: 36 },
  playerName: { ...type.body, color: colors.text, flex: 1 },
});

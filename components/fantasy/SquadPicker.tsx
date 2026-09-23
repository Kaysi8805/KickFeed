import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import {
  FANTASY_FORMATION,
  fantasyClubs,
  fantasyEligibleTeamIds,
  playersForFantasySlot,
  type FantasySlot,
} from '@/lib/fantasy';
import { FANTASY_SQUAD_HINT } from '@/lib/honesty';
import { football } from '@/services/football';
import { colors, radius, spacing, type } from '@/theme';
import type { PlayerPosition } from '@/data/types';

const POS_LABEL: Record<PlayerPosition, string> = {
  GK: 'GK',
  DF: 'DEF',
  MF: 'MID',
  FW: 'FWD',
};

export function SquadPicker({
  draft,
  locked,
  busy,
  onChange,
  onSave,
}: {
  draft: Array<FantasySlot | null>;
  locked: boolean;
  busy: boolean;
  onChange: (next: Array<FantasySlot | null>) => void;
  onSave: () => void;
}) {
  const [active, setActive] = useState<number | null>(locked ? null : 0);
  const [clubQuery, setClubQuery] = useState('');
  const [playerQuery, setPlayerQuery] = useState('');
  const [teamId, setTeamId] = useState<string | null>(null);
  const [loadingSquad, setLoadingSquad] = useState(false);

  const clubs = fantasyClubs((id) => football.getTeams(id));
  const eligible = fantasyEligibleTeamIds((id) => football.getTeams(id));
  const pos = active == null ? null : FANTASY_FORMATION[active];
  const taken = new Set<string>();
  draft.forEach((slot, index) => {
    if (slot && index !== active) taken.add(slot.playerId);
  });

  const clubMatches = clubs
    .filter((club) => club.name.toLowerCase().includes(clubQuery.trim().toLowerCase()))
    .slice(0, 8);

  const pool = teamId ? football.getSquad(teamId) : football.getPlayers();
  const choices =
    pos == null
      ? []
      : playersForFantasySlot(pool, teamId ? new Set([teamId]) : eligible, pos, playerQuery, taken).slice(0, 40);

  async function loadClub(id: string) {
    setTeamId(id);
    setLoadingSquad(true);
    try {
      await football.ensureSquad(id);
    } finally {
      setLoadingSquad(false);
    }
  }

  function assign(playerId: string, playerName: string, playerTeamId: string, playerPos: PlayerPosition) {
    if (active == null || locked) return;
    const next = draft.slice();
    next[active] = { pos: playerPos, playerId, playerName, teamId: playerTeamId };
    onChange(next);
    const following = next.findIndex((slot) => slot == null);
    setActive(following === -1 ? active : following);
    setPlayerQuery('');
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.slots}>
        {draft.map((slot, index) => {
          const label = POS_LABEL[FANTASY_FORMATION[index]];
          const selected = active === index;
          return (
            <Pressable
              key={`${label}-${index}`}
              disabled={locked}
              onPress={() => setActive(index)}
              accessibilityRole="button"
              accessibilityLabel={slot ? `${label} ${slot.playerName}` : `Empty ${label} slot`}
              style={[styles.slot, selected && styles.slotOn]}
            >
              <Text style={styles.slotPos}>{label}</Text>
              <Text style={styles.slotName} numberOfLines={1}>
                {slot?.playerName ?? 'Empty'}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {locked ? (
        <Text style={styles.hint}>This XI is locked for the gameweek.</Text>
      ) : (
        <>
          <Text style={styles.hint}>{FANTASY_SQUAD_HINT}</Text>
          <TextInput
            value={clubQuery}
            onChangeText={setClubQuery}
            placeholder="Find a covered club"
            placeholderTextColor={colors.textDim}
            style={styles.input}
            autoCapitalize="words"
            accessibilityLabel="Find a covered club"
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.clubs}>
            {clubMatches.map((club) => (
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
          </ScrollView>
          <TextInput
            value={playerQuery}
            onChangeText={setPlayerQuery}
            placeholder={pos ? `Search ${POS_LABEL[pos]}` : 'Pick a slot'}
            placeholderTextColor={colors.textDim}
            style={styles.input}
            accessibilityLabel="Search players"
          />
          {loadingSquad ? <Text style={styles.hint}>Loading squad from the free-tier cache…</Text> : null}
          {choices.length === 0 ? (
            <Text style={styles.hint}>
              {teamId ? 'No matching players in this squad.' : 'No matching players in the catalog yet.'}
            </Text>
          ) : (
            choices.map((player) => (
              <Pressable
                key={player.id}
                onPress={() => assign(player.id, player.shortName, player.teamId, player.pos)}
                style={styles.player}
                accessibilityRole="button"
                accessibilityLabel={`Pick ${player.name}`}
              >
                <Text style={styles.playerPos}>{POS_LABEL[player.pos]}</Text>
                <Text style={styles.playerName} numberOfLines={1}>
                  {player.name}
                </Text>
                <Text style={styles.playerNum}>{player.number || '—'}</Text>
              </Pressable>
            ))
          )}
          <Button label={busy ? 'Saving…' : 'Save XI'} onPress={onSave} accessibilityLabel="Save XI" />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  slots: { gap: 6 },
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
  slotOn: { borderColor: colors.accent },
  slotPos: { ...type.micro, color: colors.accent, width: 36 },
  slotName: { ...type.body, color: colors.text, flex: 1 },
  hint: { ...type.caption, color: colors.textMuted, lineHeight: 18 },
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
  clubs: { gap: 8, paddingVertical: 2 },
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
  playerNum: { ...type.caption, color: colors.textMuted },
});

import { Pressable, StyleSheet, Text, View } from 'react-native';

import { LiveBadge } from '@/components/match/LiveBadge';
import { Crest } from '@/components/ui/Crest';
import type { Fixture } from '@/data/types';
import { fixtureScoreLabel } from '@/lib/matchSocial';
import { kickoffLabel } from '@/lib/format';
import { football } from '@/services/football';
import { colors, radius, spacing, type } from '@/theme';

export function MatchPickRow({
  fixture,
  selected,
  onPress,
}: {
  fixture: Fixture;
  selected?: boolean;
  onPress: () => void;
}) {
  const home = football.getTeam(fixture.homeTeamId);
  const away = football.getTeam(fixture.awayTeamId);
  if (!home || !away) return null;
  const live = fixture.status === 'live' || fixture.status === 'ht';
  return (
    <Pressable onPress={onPress} style={[styles.row, selected && styles.selected]}>
      <Crest team={home} size={22} />
      <View style={{ flex: 1 }}>
        <Text style={styles.label}>{fixtureScoreLabel(football, fixture)}</Text>
        <Text style={styles.meta}>
          {live ? 'Live' : fixture.status === 'finished' ? 'FT' : kickoffLabel(fixture.kickoff)}
        </Text>
      </View>
      {live ? <LiveBadge minute={fixture.minute} ht={fixture.status === 'ht'} /> : null}
      <Crest team={away} size={22} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  selected: { borderColor: colors.lime, backgroundColor: colors.surfaceAlt },
  label: { ...type.caption, color: colors.text },
  meta: { ...type.micro, color: colors.textDim, marginTop: 2 },
});

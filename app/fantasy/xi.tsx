import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { SquadPicker } from '@/components/fantasy/SquadPicker';
import { HeaderBar } from '@/components/ui/HeaderBar';
import { Screen } from '@/components/ui/Screen';
import type { Fixture } from '@/data/types';
import {
  draftFromPick,
  fantasyLockLabel,
  gameweekContaining,
  gameweekDeadline,
  gameweekLabel,
  pickFor,
  type FantasySlot,
} from '@/lib/fantasy';
import { FANTASY_NOT_GAMBLING, FANTASY_SCORING_RULES, fantasyErrorMessage } from '@/lib/honesty';
import { kickoffLabel } from '@/lib/format';
import { safeBack } from '@/lib/navBack';
import { useFantasy } from '@/lib/useFantasy';
import { useFootballCatalog } from '@/lib/useFootballCatalog';
import { useLiveTick } from '@/lib/useLiveTick';
import { football } from '@/services/football';
import { colors, spacing, type } from '@/theme';

export default function FantasyXiScreen() {
  useLiveTick();
  useFootballCatalog();
  const fantasy = useFantasy();
  const now = new Date();
  const gw = gameweekContaining(now);
  const fixtures = football.getFixtures() as Fixture[];
  const deadline = gameweekDeadline(fixtures, gw, now);
  const saved = fantasy.snapshot && fantasy.userId ? pickFor(fantasy.snapshot, fantasy.userId, gw.id) : undefined;
  const savedKey = saved?.updatedAt ?? 'empty';
  const [draft, setDraft] = useState<Array<FantasySlot | null>>(() => draftFromPick(saved));
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    setDraft(draftFromPick(saved));
  }, [savedKey]);

  async function onSave() {
    if (busy || deadline.locked) return;
    setBusy(true);
    setNote(null);
    const result = await fantasy.saveXi(gw.id, draft, deadline.locked, deadline.deadlineAt);
    setBusy(false);
    if (!result.ok) {
      setNote(fantasyErrorMessage(result.error));
      return;
    }
    router.back();
  }

  return (
    <Screen padded={false}>
      <View style={styles.pad}>
        <HeaderBar title="Your XI" onBack={() => safeBack('/fantasy')} />
      </View>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.kicker}>{gameweekLabel(gw.id)}</Text>
        <Text style={styles.body}>One XI this gameweek, used in every mini-league you join.</Text>
        <Text style={styles.caption}>{fantasyLockLabel(deadline, kickoffLabel)}</Text>
        <Text style={styles.caption}>{FANTASY_NOT_GAMBLING}</Text>
        <Text style={styles.caption}>{FANTASY_SCORING_RULES}</Text>
        <SquadPicker draft={draft} locked={deadline.locked} busy={busy} onChange={setDraft} onSave={() => void onSave()} />
        {note ? <Text style={styles.note}>{note}</Text> : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: spacing.lg },
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: 64, gap: spacing.sm },
  kicker: { ...type.badge, color: colors.accent },
  body: { ...type.body, color: colors.text, lineHeight: 22 },
  caption: { ...type.caption, color: colors.textMuted, lineHeight: 18 },
  note: { ...type.caption, color: colors.danger },
});

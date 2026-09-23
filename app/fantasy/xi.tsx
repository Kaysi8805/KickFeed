import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { SquadPicker } from '@/components/fantasy/SquadPicker';
import { EmptyState } from '@/components/ui/EmptyState';
import { HeaderBar } from '@/components/ui/HeaderBar';
import { Screen } from '@/components/ui/Screen';
import type { Fixture } from '@/data/types';
import {
  deadlineCountdown,
  pickFor,
  selectGameweek,
  type FantasySlot,
} from '@/lib/fantasy';
import { FANTASY_NOT_GAMBLING, FANTASY_NO_ROUND, FANTASY_SCORING_RULES, FANTASY_SIGN_IN_COPY, fantasyErrorMessage } from '@/lib/honesty';
import { safeBack } from '@/lib/navBack';
import { routeId } from '@/lib/routeParams';
import { useFantasy } from '@/lib/useFantasy';
import { useFootballCatalog } from '@/lib/useFootballCatalog';
import { useLiveTick } from '@/lib/useLiveTick';
import { football } from '@/services/football';
import { colors, spacing, type } from '@/theme';

export default function FantasyXiScreen() {
  useLiveTick();
  useFootballCatalog();
  const { leagueId: raw } = useLocalSearchParams<{ leagueId?: string | string[] }>();
  const leagueId = routeId(raw);
  const fantasy = useFantasy();
  const now = new Date();
  const league = fantasy.snapshot?.leagues.find((row) => row.id === leagueId);
  const fixtures = football.getFixtures() as Fixture[];
  const gameweek = league ? selectGameweek(fixtures, league.competitionId, league.season, now) : null;
  const saved =
    fantasy.snapshot && fantasy.userId && league && gameweek
      ? pickFor(fantasy.snapshot, league.id, fantasy.userId, gameweek.roundId)
      : undefined;
  const savedKey = saved?.updatedAt ?? 'empty';
  const [draft, setDraft] = useState<FantasySlot[]>(() => saved?.slots.map((slot) => ({ ...slot })) ?? []);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    setDraft(saved?.slots.map((slot) => ({ ...slot })) ?? []);
  }, [savedKey]);

  async function onSave() {
    if (busy || !league || !gameweek || gameweek.locked) return;
    setBusy(true);
    setNote(null);
    const result = await fantasy.saveXi(league.id, gameweek.roundId, draft, gameweek.locked, gameweek.deadlineAt);
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
        <HeaderBar title="Your XI" onBack={() => safeBack(league ? `/fantasy/${league.id}` : '/fantasy')} />
      </View>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {!fantasy.signedIn ? <EmptyState title="Sign in to play" body={FANTASY_SIGN_IN_COPY} /> : null}
        {fantasy.signedIn && league && !gameweek ? <EmptyState title="No round yet" body={FANTASY_NO_ROUND} /> : null}
        {league && gameweek ? (
          <>
            <Text style={styles.kicker}>{gameweek.roundId}</Text>
            <Text style={styles.body}>One XI for this round in {league.name}.</Text>
            <Text style={styles.caption}>{deadlineCountdown(gameweek.deadlineAt, gameweek.locked, now)}</Text>
            <Text style={styles.caption}>{FANTASY_NOT_GAMBLING}</Text>
            <Text style={styles.caption}>{FANTASY_SCORING_RULES}</Text>
            <SquadPicker
              competitionId={league.competitionId}
              draft={draft}
              locked={gameweek.locked}
              busy={busy}
              onChange={setDraft}
              onSave={() => void onSave()}
            />
            {note ? <Text style={styles.note}>{note}</Text> : null}
          </>
        ) : null}
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

import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { EmptyState } from '@/components/ui/EmptyState';
import { HeaderBar } from '@/components/ui/HeaderBar';
import { Screen } from '@/components/ui/Screen';
import { FANTASY_SIGN_IN_COPY, fantasyErrorMessage } from '@/lib/honesty';
import { safeBack } from '@/lib/navBack';
import { routeId } from '@/lib/routeParams';
import { useFantasy } from '@/lib/useFantasy';
import { colors, spacing, type } from '@/theme';

export default function FantasyJoinScreen() {
  const { code: raw } = useLocalSearchParams<{ code?: string | string[] }>();
  const code = routeId(raw);
  const fantasy = useFantasy();
  const [note, setNote] = useState<string | null>(null);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (!fantasy.signedIn || !code || started || fantasy.loading) return;
    setStarted(true);
    void fantasy.joinLeague(code).then((result) => {
      if (!result.ok) {
        setNote(fantasyErrorMessage(result.error));
        return;
      }
      router.replace(`/fantasy/${result.leagueId}`);
    });
  }, [code, fantasy.signedIn, fantasy.loading, fantasy.joinLeague, started]);

  return (
    <Screen>
      <HeaderBar title="Join league" onBack={() => safeBack('/fantasy')} />
      {!fantasy.signedIn ? (
        <EmptyState title="Sign in to join" body={FANTASY_SIGN_IN_COPY} />
      ) : (
        <View style={styles.body}>
          <Text style={styles.text}>{note ?? (code ? `Joining ${code}…` : 'Missing invite code.')}</Text>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.lg },
  text: { ...type.body, color: colors.text },
});

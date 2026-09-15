import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { EmptyState } from '@/components/ui/EmptyState';
import { HeaderBar } from '@/components/ui/HeaderBar';
import { Screen } from '@/components/ui/Screen';
import { football } from '@/services/football';
import { colors, radius, spacing, type } from '@/theme';

export default function CountryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const country = football.getCountry(id);
  const leagues = football.getLeagues(id);

  if (!country) {
    return (
      <Screen>
        <HeaderBar title="Country" onBack={() => router.back()} />
        <EmptyState title="Unknown country" body="That country isn’t in the mock tree." />
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
      <View style={styles.pad}>
        <HeaderBar title={`${country.flag}  ${country.name}`} onBack={() => router.back()} />
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        {leagues.length === 0 ? (
          <EmptyState title="No competitions seeded" body="A real API can fill this country later." />
        ) : (
          leagues.map((l) => (
            <Pressable key={l.id} onPress={() => router.push(`/league/${l.id}`)} style={styles.row}>
              <View>
                <Text style={styles.name}>{l.name}</Text>
                <Text style={styles.meta}>
                  {l.type} · {football.getTeams(l.id).length} clubs
                </Text>
              </View>
              <Text style={styles.chev}>→</Text>
            </Pressable>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: spacing.lg },
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: 32 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radius.lg,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  name: { ...type.subtitle, fontSize: 16, color: colors.text },
  meta: { ...type.caption, color: colors.textMuted, fontWeight: '500', marginTop: 2 },
  chev: { color: colors.limeMuted },
});

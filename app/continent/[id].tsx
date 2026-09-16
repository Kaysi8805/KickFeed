import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { EmptyState } from '@/components/ui/EmptyState';
import { HeaderBar } from '@/components/ui/HeaderBar';
import { Screen } from '@/components/ui/Screen';
import { entityBackHref } from '@/lib/entityNav';
import { safeBack } from '@/lib/navBack';
import { routeId } from '@/lib/routeParams';
import { football } from '@/services/football';
import { colors, radius, spacing, type } from '@/theme';

export default function ContinentScreen() {
  const { id: rawId } = useLocalSearchParams<{ id: string | string[] }>();
  const id = routeId(rawId);
  const continent = id ? football.getContinent(id) : undefined;
  const countries = id ? football.getCountries(id) : [];

  if (!continent) {
    return (
      <Screen>
        <HeaderBar title="Continent" onBack={() => safeBack(entityBackHref('continent', id))} />
        <EmptyState title="Unknown region" body="That continent isn’t in the mock tree." />
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
      <View style={styles.pad}>
        <HeaderBar title={continent.name} onBack={() => safeBack(entityBackHref('continent', continent.id))} />
        <Text style={styles.blurb}>{continent.blurb}</Text>
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        {countries.map((c) => {
          const n = football.getLeagues(c.id).length;
          return (
            <Pressable key={c.id} onPress={() => router.push(`/country/${c.id}`)} style={styles.row}>
              <Text style={styles.flag}>{c.flag}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{c.name}</Text>
                <Text style={styles.meta}>
                  {n} competition{n === 1 ? '' : 's'}
                </Text>
              </View>
              <Text style={styles.chev}>→</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: spacing.lg },
  blurb: { ...type.body, color: colors.textMuted, marginBottom: spacing.md },
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: 32 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radius.lg,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  flag: { fontSize: 28 },
  name: { ...type.subtitle, fontSize: 16, color: colors.text },
  meta: { ...type.caption, color: colors.textMuted, fontWeight: '500' },
  chev: { color: colors.limeMuted },
});

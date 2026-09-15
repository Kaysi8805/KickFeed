import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useMemo, useState } from 'react';

import { Screen } from '@/components/ui/Screen';
import { football } from '@/services/football';
import { colors, radius, spacing, type } from '@/theme';

export default function LeaguesScreen() {
  const [q, setQ] = useState('');
  const featured = football.getFeaturedLeagues();
  const continents = football.getContinents();
  const leagues = football.getLeagues();

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return [];
    return leagues.filter(
      (l) =>
        l.name.toLowerCase().includes(needle) ||
        l.shortName.toLowerCase().includes(needle) ||
        football.getCountry(l.countryId)?.name.toLowerCase().includes(needle),
    );
  }, [leagues, q]);

  return (
    <Screen padded={false}>
      <View style={styles.top}>
        <Text style={styles.title}>Leagues</Text>
        <TextInput
          placeholder="Search leagues or countries"
          placeholderTextColor={colors.textDim}
          value={q}
          onChangeText={setQ}
          style={styles.search}
        />
      </View>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {q.trim() ? (
          results.length === 0 ? (
            <Text style={styles.empty}>No leagues match “{q.trim()}”.</Text>
          ) : (
            results.map((l) => (
              <Pressable key={l.id} onPress={() => router.push(`/league/${l.id}`)} style={styles.row}>
                <Text style={styles.rowTitle}>{l.name}</Text>
                <Text style={styles.rowMeta}>{football.getCountry(l.countryId)?.name}</Text>
              </Pressable>
            ))
          )
        ) : (
          <>
            <Text style={styles.section}>Featured</Text>
            {featured.map((l) => (
              <Pressable key={l.id} onPress={() => router.push(`/league/${l.id}`)} style={styles.featured}>
                <View>
                  <Text style={styles.featKicker}>{football.getCountry(l.countryId)?.flag} {l.shortName}</Text>
                  <Text style={styles.featTitle}>{l.name}</Text>
                </View>
                <Text style={styles.chev}>Standings →</Text>
              </Pressable>
            ))}
            <Text style={styles.section}>Browse worldwide</Text>
            {continents.map((c) => (
              <Pressable key={c.id} onPress={() => router.push(`/continent/${c.id}`)} style={styles.row}>
                <View>
                  <Text style={styles.rowTitle}>{c.name}</Text>
                  <Text style={styles.rowMeta}>{c.blurb}</Text>
                </View>
                <Text style={styles.chev}>→</Text>
              </Pressable>
            ))}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.md },
  title: { ...type.title, color: colors.text },
  search: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: 40 },
  section: { ...type.micro, color: colors.textMuted, marginVertical: spacing.md },
  featured: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginBottom: spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.pitch,
  },
  featKicker: { ...type.micro, color: colors.lime },
  featTitle: { ...type.subtitle, color: colors.text, marginTop: 4 },
  row: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowTitle: { ...type.subtitle, fontSize: 15, color: colors.text },
  rowMeta: { ...type.caption, color: colors.textMuted, fontWeight: '500', marginTop: 2 },
  chev: { ...type.caption, color: colors.limeMuted },
  empty: { ...type.body, color: colors.textMuted, marginTop: spacing.xl },
});

import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ChannelChips, CountryChips } from '@/components/tv/ChannelChips';
import { resolveTvCountryId } from '@/lib/tvCountry';
import { useApp } from '@/services/AppProvider';
import { tv } from '@/services/tv';
import { colors, radius, spacing, type } from '@/theme';

export function TvMatchSection({ matchId }: { matchId: string }) {
  const { currentUser, updateProfile } = useApp();
  const countries = tv.getCountries();
  const [countryId, setCountryId] = useState(() => resolveTvCountryId(currentUser?.tvCountryId));
  const country = tv.getCountry(countryId) ?? countries[0];
  const airings = useMemo(
    () => tv.getBroadcastsByMatch(matchId, countryId)[0]?.airings ?? [],
    [matchId, countryId],
  );

  if (!country) return null;

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.kicker}>TV · {country.flag} {country.name}</Text>
        <Pressable onPress={() => router.push('/tv')} hitSlop={8}>
          <Text style={styles.link}>Schedule</Text>
        </Pressable>
      </View>
      <CountryChips
        countries={countries}
        value={countryId}
        onChange={(id) => {
          setCountryId(id);
          if (currentUser && id !== currentUser.tvCountryId) updateProfile({ tvCountryId: id });
        }}
      />
      {airings.length ? (
        <>
          <ChannelChips airings={airings} />
          {airings.some((a) => a.note) ? (
            <Text style={styles.note}>{airings.find((a) => a.note)?.note}</Text>
          ) : null}
        </>
      ) : (
        <Text style={styles.empty}>
          No editorial listing for this match in {country.shortName}. Launch TV covers England Premier League and
          Championship only.
        </Text>
      )}
      <Text style={styles.disclaimer}>Editorial mock listings — not a licensed TV guide.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  kicker: { ...type.micro, color: colors.limeMuted, textTransform: 'uppercase' },
  link: { ...type.caption, color: colors.lime },
  note: { ...type.caption, color: colors.textMuted, fontWeight: '500' },
  empty: { ...type.caption, color: colors.textMuted, fontWeight: '500', lineHeight: 18 },
  disclaimer: { ...type.caption, color: colors.textDim, fontWeight: '500', fontSize: 11 },
});

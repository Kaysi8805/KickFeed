import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ChannelChips, CountryChips } from '@/components/tv/ChannelChips';
import { EmptyState } from '@/components/ui/EmptyState';
import { HeaderBar } from '@/components/ui/HeaderBar';
import { Screen } from '@/components/ui/Screen';
import { Segmented } from '@/components/ui/Segmented';
import { entityHref } from '@/lib/entityNav';
import { kickoffDayLabel, resolveTvCountryId } from '@/lib/tvCountry';
import { safeBack } from '@/lib/navBack';
import { useFootballCatalog } from '@/lib/useFootballCatalog';
import { useLiveTick } from '@/lib/useLiveTick';
import { useApp } from '@/services/AppProvider';
import { football } from '@/services/football';
import { tv } from '@/services/tv';
import { colors, radius, spacing, type } from '@/theme';

type Window = 'today' | 'upcoming';

export default function TvScheduleScreen() {
  const tick = useLiveTick();
  const catalog = useFootballCatalog();
  const { currentUser, updateProfile } = useApp();
  const countries = tv.getCountries();
  const [countryId, setCountryId] = useState(() => resolveTvCountryId(currentUser?.tvCountryId));
  const [window, setWindow] = useState<Window>('today');
  const country = tv.getCountry(countryId);

  const rows = useMemo(
    () => tv.getListingsByCountry(countryId, { window }),
    [countryId, window, tick, catalog.lastSyncedAt, catalog.loading],
  );

  function selectCountry(id: string) {
    setCountryId(id);
    if (currentUser && id !== currentUser.tvCountryId) updateProfile({ tvCountryId: id });
  }

  return (
    <Screen padded={false}>
      <View style={styles.pad}>
        <HeaderBar title="TV schedule" onBack={() => safeBack('/matches')} />
        <Text style={styles.sub}>
          {country ? `${country.flag} ${country.name}` : 'Launch geos'} · England PL / Championship
        </Text>
        <CountryChips countries={countries} value={countryId} onChange={selectCountry} />
        <Segmented
          value={window}
          onChange={setWindow}
          options={[
            { key: 'today', label: 'Today' },
            { key: 'upcoming', label: 'Upcoming' },
          ]}
        />
      </View>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {rows.length === 0 ? (
          <EmptyState
            title={window === 'today' ? 'Nothing on today' : 'No upcoming listings'}
            body="Editorial TV covers England Premier League and Championship fixtures in UK, Slovakia, and the US. Flip the window or country."
          />
        ) : (
          rows.map(({ fixture, airings }) => {
            const home = football.getTeam(fixture.homeTeamId);
            const away = football.getTeam(fixture.awayTeamId);
            const league = football.getLeague(fixture.leagueId);
            if (!home || !away) return null;
            const when = country ? kickoffDayLabel(fixture.kickoff, country.timeZone) : fixture.kickoff;
            return (
              <Pressable
                key={fixture.id}
                onPress={() => router.push(entityHref('match', fixture.id))}
                style={styles.card}
              >
                <Text style={styles.league}>
                  {league?.shortName ?? 'Match'} · {when}
                </Text>
                <Text style={styles.teams}>
                  {home.shortName} vs {away.shortName}
                </Text>
                <ChannelChips airings={airings} compact />
              </Pressable>
            );
          })
        )}
        <Text style={styles.disclaimer}>
          Editorial / mock listings so the screens work without a TV rights feed. Swap `TvProvider` for a licensed
          source later — do not scrape FotMob or broadcasters.
        </Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: spacing.lg, gap: spacing.md, paddingBottom: spacing.sm },
  sub: { ...type.caption, color: colors.textMuted, fontWeight: '500', marginTop: -8 },
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: 40 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: 8,
  },
  league: { ...type.micro, color: colors.limeMuted, textTransform: 'uppercase' },
  teams: { ...type.subtitle, color: colors.text },
  disclaimer: { ...type.caption, color: colors.textDim, fontWeight: '500', lineHeight: 18, marginTop: spacing.md },
});

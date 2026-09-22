import { Image } from 'expo-image';
import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { League, Team } from '@/data/types';
import { crestBadgeMode, leagueMarkA11y, teamCrestA11y } from '@/lib/crestBadge';
import { colors } from '@/theme';

/** Off-white plate so dark and light crests both read on Pitch Neon surfaces. */
const PLATE = '#F4F7F5';

function MediaBadge({
  uri,
  size,
  label,
  fallback,
}: {
  uri?: string;
  size: number;
  label: string;
  fallback: ReactNode;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [uri]);

  if (crestBadgeMode(uri, failed) === 'fallback') return <>{fallback}</>;

  const pad = Math.max(2, Math.round(size * 0.14));
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      style={[
        styles.plate,
        {
          width: size,
          height: size,
          borderRadius: Math.round(size * 0.22),
        },
      ]}
    >
      <Image
        source={{ uri }}
        style={{ width: size - pad * 2, height: size - pad * 2 }}
        contentFit="contain"
        cachePolicy="memory-disk"
        recyclingKey={uri}
        accessible={false}
        onError={() => setFailed(true)}
      />
    </View>
  );
}

function CodeChip({ team, size }: { team: Team; size: number }) {
  const a11y = teamCrestA11y(team.name);
  return (
    <View
      accessible
      accessibilityRole={a11y.role}
      accessibilityLabel={a11y.label}
      style={[
        styles.chip,
        {
          width: size,
          height: size,
          borderRadius: size / 4,
          backgroundColor: team.color,
          borderColor: team.accent,
        },
      ]}
    >
      <Text style={[styles.code, { fontSize: Math.max(9, size * 0.28), color: colors.white }]}>{team.code}</Text>
    </View>
  );
}

/** Team badge. Real crest when `logoUrl` loads; colored TLA chip otherwise. */
export function Crest({ team, size = 36 }: { team: Team; size?: number }) {
  const a11y = teamCrestA11y(team.name);
  return (
    <MediaBadge
      uri={team.logoUrl}
      size={size}
      label={a11y.label}
      fallback={<CodeChip team={team} size={size} />}
    />
  );
}

function LeagueChip({ league, size }: { league: League; size: number }) {
  const label = league.shortName.slice(0, 3).toUpperCase();
  const a11y = leagueMarkA11y(league.name);
  return (
    <View
      accessible
      accessibilityRole={a11y.role}
      accessibilityLabel={a11y.label}
      style={[
        styles.chip,
        {
          width: size,
          height: size,
          borderRadius: size / 4,
          backgroundColor: colors.surfaceElevated,
          borderColor: colors.border,
        },
      ]}
    >
      <Text style={[styles.code, { fontSize: Math.max(8, size * 0.26), color: colors.text }]}>{label}</Text>
    </View>
  );
}

/** Competition badge. Falls back to a short-name chip when the logo is missing or fails. */
export function LeagueMark({ league, size = 28 }: { league: League; size?: number }) {
  const a11y = leagueMarkA11y(league.name);
  return (
    <MediaBadge
      uri={league.logoUrl}
      size={size}
      label={a11y.label}
      fallback={<LeagueChip league={league} size={size} />}
    />
  );
}

const styles = StyleSheet.create({
  plate: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: PLATE,
    overflow: 'hidden',
  },
  chip: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  code: { fontWeight: '800', letterSpacing: 0.4 },
});

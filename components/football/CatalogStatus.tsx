import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CATALOG_ERROR_TITLE, CATALOG_LOADING_NOTE, LIVE_MIX_DISCLAIMER } from '@/lib/honesty';
import { useFootballCatalog } from '@/lib/useFootballCatalog';
import { football } from '@/services/football';
import { colors, radius, spacing, type } from '@/theme';

/** Live-catalog honesty + loading/error. Hidden on the mock path. */
export function CatalogStatus() {
  const status = useFootballCatalog();
  if (status.source === 'mock') return null;
  return (
    <View style={styles.wrap}>
      <View style={styles.banner} accessibilityRole="text">
        <Text style={styles.bannerText}>{LIVE_MIX_DISCLAIMER}</Text>
      </View>
      {status.loading && !status.lastSyncedAt ? (
        <Text style={styles.note}>{CATALOG_LOADING_NOTE}</Text>
      ) : null}
      {status.error ? (
        <Pressable
          onPress={() => void football.refresh()}
          accessibilityRole="button"
          accessibilityLabel="Retry loading live scores"
          style={styles.retry}
        >
          <Text style={styles.err}>{CATALOG_ERROR_TITLE} · tap to retry</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  banner: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
  bannerText: { ...type.caption, color: colors.gold, fontWeight: '700' },
  note: { ...type.caption, color: colors.limeMuted, fontWeight: '500' },
  retry: { minHeight: 44, justifyContent: 'center' },
  err: { ...type.caption, color: colors.gold, fontWeight: '600' },
});

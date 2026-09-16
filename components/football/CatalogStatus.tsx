import { Pressable, StyleSheet, Text } from 'react-native';

import { useFootballCatalog } from '@/lib/useFootballCatalog';
import { football } from '@/services/football';
import { colors, type } from '@/theme';

export function CatalogStatus() {
  const status = useFootballCatalog();
  if (status.source === 'mock') return null;
  if (status.loading && !status.lastSyncedAt) {
    return <Text style={styles.note}>Loading England scores…</Text>;
  }
  if (status.error) {
    return (
      <Pressable onPress={() => void football.refresh()}>
        <Text style={styles.err}>{status.error} · tap to retry</Text>
      </Pressable>
    );
  }
  return null;
}

const styles = StyleSheet.create({
  note: { ...type.caption, color: colors.limeMuted, fontWeight: '500' },
  err: { ...type.caption, color: colors.gold, fontWeight: '600' },
});

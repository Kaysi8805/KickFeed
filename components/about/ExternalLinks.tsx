import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { PRIVACY_POLICY_URL, SUPPORT_EMAIL, SUPPORT_URL, TERMS_URL } from '@/lib/legal';
import { colors, spacing, type } from '@/theme';

const LINKS = [
  { label: 'Privacy Policy', url: PRIVACY_POLICY_URL },
  { label: 'Support', url: SUPPORT_URL },
  { label: 'Terms', url: TERMS_URL },
] as const;

async function openUrl(url: string): Promise<boolean> {
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

/** Opens the hosted pages. Shows the address if the device cannot launch a browser. */
export function ExternalLinks() {
  const [failed, setFailed] = useState<string | null>(null);
  return (
    <View style={styles.wrap}>
      {LINKS.map((link) => (
        <Pressable
          key={link.url}
          onPress={() => {
            setFailed(null);
            void openUrl(link.url).then((ok) => {
              if (!ok) setFailed(link.url);
            });
          }}
          accessibilityRole="link"
          accessibilityLabel={link.label}
          style={styles.row}
        >
          <Text style={styles.label}>{link.label}</Text>
          <Text style={styles.chev}>→</Text>
        </Pressable>
      ))}
      <Text style={styles.mail}>
        Support email {SUPPORT_EMAIL}
      </Text>
      {failed ? <Text style={styles.failed}>Couldn’t open the browser. Visit {failed}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 4, marginTop: spacing.md },
  row: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: { ...type.caption, color: colors.lime },
  chev: { ...type.caption, color: colors.lime },
  mail: { ...type.caption, color: colors.textDim, fontWeight: '500', marginTop: spacing.sm, lineHeight: 18 },
  failed: { ...type.caption, color: colors.gold, fontWeight: '500', lineHeight: 18 },
});

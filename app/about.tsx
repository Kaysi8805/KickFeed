import Constants from 'expo-constants';
import { StyleSheet, Text, View } from 'react-native';

import { ExternalLinks } from '@/components/about/ExternalLinks';
import { HeaderBar } from '@/components/ui/HeaderBar';
import { Screen } from '@/components/ui/Screen';
import { FAN_PICKS_NOT_GAMBLING } from '@/lib/honesty';
import { safeBack } from '@/lib/navBack';
import { demoModeEnabled } from '@/lib/demoMode';
import { colors, spacing, type } from '@/theme';

export default function AboutScreen() {
  const version = Constants.expoConfig?.version ?? '1.0.0';
  const demo = demoModeEnabled();
  return (
    <Screen>
      <HeaderBar title="About" onBack={() => safeBack('/')} />
      <View style={styles.block}>
        <Text style={styles.name}>KickFeed</Text>
        <Text style={styles.meta}>Version {version}</Text>
        <Text style={styles.body}>
          {demo
            ? 'This install can use a demo profile. Demo data stays on the device and is labeled Demo.'
            : 'This install signs in with email. Demo profiles are turned off.'}
        </Text>
        <Text style={styles.body}>{FAN_PICKS_NOT_GAMBLING}</Text>
        <ExternalLinks />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  block: { marginTop: spacing.lg, gap: spacing.sm },
  name: { ...type.title, color: colors.text },
  meta: { ...type.caption, color: colors.textDim, fontWeight: '500' },
  body: { ...type.body, color: colors.textMuted, lineHeight: 22 },
});

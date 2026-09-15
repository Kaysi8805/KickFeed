import { Link, Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing, type } from '@/theme';

export default function NotFound() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.wrap}>
        <Text style={styles.title}>Offside</Text>
        <Text style={styles.body}>That screen doesn’t exist in KickFeed.</Text>
        <Link href="/" style={styles.link}>
          <Text style={styles.linkText}>Back to the pitch</Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  title: { ...type.title, color: colors.text },
  body: { ...type.body, color: colors.textMuted, marginTop: spacing.sm },
  link: { marginTop: spacing.lg },
  linkText: { ...type.caption, color: colors.lime },
});

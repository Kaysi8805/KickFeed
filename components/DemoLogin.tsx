import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/ui/Avatar';
import { auth } from '@/services/auth';
import { useApp } from '@/services/AppProvider';
import { colors, radius, spacing, type } from '@/theme';

export function DemoLogin({ onBack }: { onBack?: () => void }) {
  const { signInDemo, supabaseConfigured } = useApp();
  const users = auth.listDemoUsers();

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>DEMO MODE</Text>
          </View>
          <Text style={styles.logo}>KickFeed</Text>
          <Text style={styles.tag}>Football scores, standings, and the social feed — one pitch.</Text>
        </View>
        {onBack ? (
          <Pressable
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel="Back to email sign in"
            style={styles.back}
          >
            <Text style={styles.backText}>← Back to email sign in</Text>
          </Pressable>
        ) : null}
        <Text style={styles.pick}>Pick a demo profile</Text>
        <Text style={styles.hint}>
          {supabaseConfigured
            ? 'Staging fallback — seeded fans, local AsyncStorage. Email accounts stay on your Supabase project.'
            : 'No Supabase keys in env, so demo is the only sign-in. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY for email auth.'}
        </Text>
        {users.map((u) => (
          <Pressable
            key={u.id}
            onPress={() => signInDemo(u.id)}
            accessibilityRole="button"
            accessibilityLabel={`Enter as ${u.name}`}
            style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
          >
            <Avatar initials={u.initials} color={u.avatarColor} size={52} />
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{u.name}</Text>
              <Text style={styles.handle}>@{u.handle}</Text>
              <Text style={styles.bio} numberOfLines={2}>
                {u.bio}
              </Text>
            </View>
            <Text style={styles.go}>Enter</Text>
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.xl, paddingBottom: 48, maxWidth: 560, width: '100%', alignSelf: 'center' },
  hero: { marginTop: spacing.xl, marginBottom: spacing.xxl },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.lime,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
    marginBottom: spacing.md,
  },
  badgeText: { ...type.micro, color: colors.bg },
  logo: { ...type.hero, fontSize: 40, color: colors.text },
  tag: { ...type.body, color: colors.textMuted, marginTop: spacing.sm, lineHeight: 22 },
  back: { minHeight: 44, justifyContent: 'center', marginBottom: spacing.md },
  backText: { ...type.caption, color: colors.lime },
  pick: { ...type.subtitle, color: colors.text, marginBottom: 4 },
  hint: { ...type.caption, color: colors.textDim, fontWeight: '500', marginBottom: spacing.lg, lineHeight: 18 },
  card: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 72,
  },
  name: { ...type.subtitle, color: colors.text, fontSize: 16 },
  handle: { ...type.caption, color: colors.limeMuted, marginTop: 2 },
  bio: { ...type.caption, color: colors.textMuted, fontWeight: '500', marginTop: 4 },
  go: { ...type.caption, color: colors.lime },
});

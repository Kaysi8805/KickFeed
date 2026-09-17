import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DemoLogin } from '@/components/DemoLogin';
import { Segmented } from '@/components/ui/Segmented';
import { AuthError } from '@/services/auth';
import { useApp } from '@/services/AppProvider';
import { colors, radius, spacing, type } from '@/theme';

type GatePane = 'email' | 'demo';
type EmailMode = 'signin' | 'signup';

export function AuthScreen() {
  const { supabaseConfigured } = useApp();
  const [pane, setPane] = useState<GatePane>(supabaseConfigured ? 'email' : 'demo');

  if (pane === 'demo') {
    return <DemoLogin onBack={supabaseConfigured ? () => setPane('email') : undefined} />;
  }

  return <EmailAuthForm onDemo={() => setPane('demo')} />;
}

function EmailAuthForm({ onDemo }: { onDemo: () => void }) {
  const { signInWithEmail, signUpWithEmail } = useApp();
  const [mode, setMode] = useState<EmailMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result =
        mode === 'signin'
          ? await signInWithEmail(email, password)
          : await signUpWithEmail(email, password, displayName);
      if (result.status === 'confirm_email') {
        setNotice(`Check ${result.email} for a confirmation link, then sign in. You can turn off “Confirm email” in the Supabase Auth settings for local demos.`);
        setMode('signin');
      }
    } catch (err) {
      setError(err instanceof AuthError || err instanceof Error ? err.message : 'Sign in failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.hero}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>EMAIL AUTH</Text>
            </View>
            <Text style={styles.logo}>KickFeed</Text>
            <Text style={styles.tag}>Sign in with email, or keep using a demo profile on this device.</Text>
          </View>
          <Segmented
            value={mode}
            onChange={(next) => {
              setMode(next);
              setError(null);
              setNotice(null);
            }}
            options={[
              { key: 'signin', label: 'Sign in' },
              { key: 'signup', label: 'Sign up' },
            ]}
          />
          {mode === 'signup' ? (
            <>
              <Text style={styles.label}>Display name</Text>
              <TextInput
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="Your name"
                placeholderTextColor={colors.textDim}
                autoCapitalize="words"
                autoCorrect={false}
                accessibilityLabel="Display name"
                style={styles.input}
              />
            </>
          ) : null}
          <Text style={styles.label}>Email</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={colors.textDim}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            autoComplete="email"
            accessibilityLabel="Email"
            style={styles.input}
          />
          <Text style={styles.label}>Password</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="At least 6 characters"
            placeholderTextColor={colors.textDim}
            secureTextEntry
            textContentType={mode === 'signup' ? 'newPassword' : 'password'}
            autoComplete={mode === 'signup' ? 'password-new' : 'password'}
            accessibilityLabel="Password"
            style={styles.input}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {notice ? <Text style={styles.notice}>{notice}</Text> : null}
          <Pressable
            onPress={() => void submit()}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={mode === 'signin' ? 'Sign in' : 'Create account'}
            accessibilityState={{ disabled: busy }}
            style={({ pressed }) => [styles.submit, (pressed || busy) && { opacity: 0.85 }]}
          >
            <Text style={styles.submitText}>
              {busy ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Create account'}
            </Text>
          </Pressable>
          <Pressable
            onPress={onDemo}
            accessibilityRole="button"
            accessibilityLabel="Continue with demo"
            style={styles.demoLink}
          >
            <Text style={styles.demoLinkText}>Continue with demo</Text>
          </Pressable>
          <Text style={styles.hint}>
            Demo profiles stay on this device. Email accounts use your Supabase project; prediction
            leaderboards in the next batch will attach to that user id.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  scroll: { padding: spacing.xl, paddingBottom: 48, maxWidth: 560, width: '100%', alignSelf: 'center' },
  hero: { marginTop: spacing.xl, marginBottom: spacing.xl },
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
  label: { ...type.micro, color: colors.textMuted, marginBottom: 6, marginTop: spacing.md },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 44,
  },
  error: { ...type.caption, color: colors.danger, marginTop: spacing.sm, fontWeight: '600' },
  notice: { ...type.caption, color: colors.limeMuted, marginTop: spacing.sm, fontWeight: '500', lineHeight: 18 },
  submit: {
    marginTop: spacing.xl,
    backgroundColor: colors.lime,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    padding: 14,
    borderRadius: radius.lg,
  },
  submitText: { ...type.subtitle, color: colors.bg },
  demoLink: { marginTop: spacing.lg, alignItems: 'center', minHeight: 44, justifyContent: 'center' },
  demoLinkText: { ...type.caption, color: colors.lime },
  hint: { ...type.caption, color: colors.textDim, fontWeight: '500', marginTop: spacing.md, lineHeight: 18 },
});

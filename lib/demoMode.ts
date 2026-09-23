/**
 * Explicit demo switch.
 * Production EAS sets `EXPO_PUBLIC_DEMO_MODE=0` so the install opens on email sign-in.
 * Development, preview, and local `expo start` leave it on unless the env var says otherwise.
 */
export function demoModeEnabled(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): boolean {
  const raw = env.EXPO_PUBLIC_DEMO_MODE?.trim().toLowerCase();
  if (raw === '0' || raw === 'false' || raw === 'off') return false;
  if (raw === '1' || raw === 'true' || raw === 'on') return true;
  return true;
}

/** Production builds drop a restored demo profile so the gate is email sign-in. */
export function shouldDropDemoSession(authMode: string | null, demoMode: boolean): boolean {
  return !demoMode && authMode !== 'supabase';
}

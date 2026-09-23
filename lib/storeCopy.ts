import { FAN_PICKS_NOT_GAMBLING } from '@/lib/honesty';

export function emailAuthHint(storeFacing: boolean): string {
  const account = storeFacing
    ? 'Demo profiles stay on this device. Email accounts are KickFeed sign-in.'
    : 'Demo profiles stay on this device. Email accounts use your Supabase project.';
  return `${account} ${FAN_PICKS_NOT_GAMBLING}`;
}

export function demoLoginHint(opts: { supabaseConfigured: boolean; storeFacing: boolean }): string {
  if (opts.storeFacing) {
    return opts.supabaseConfigured
      ? 'Demo profiles stay on this device. Use email sign-in for an account that can sync across installs.'
      : 'Demo profiles stay on this device. This install does not have email sign-in configured.';
  }
  return opts.supabaseConfigured
    ? 'Staging fallback — seeded fans on this device. Email accounts stay on your Supabase project.'
    : 'No Supabase keys in env, so demo is the only sign-in. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY for email auth.';
}

export function profileAccountNote(opts: {
  authMode: string | null;
  supabaseConfigured: boolean;
  storeFacing: boolean;
}): string {
  if (opts.storeFacing) {
    return opts.authMode === 'supabase'
      ? 'Favorites, predictions, Man of the Match votes, reports, blocks, messages, and match-alert settings stay with this account.'
      : 'This is a demo profile on this device. Predictions and messages stay here until you sign in with email.';
  }
  if (opts.authMode === 'supabase') {
    return 'Favorites, predictions, MOTM votes, reports, blocks, DMs, and match-alert tokens on this device are stored under your Supabase user id. Live ranking, safety lists, DMs, and device push tokens sync to KickFeed Postgres.';
  }
  if (opts.supabaseConfigured) {
    return 'Demo profile — local ranking, safety lists, and DMs only. Sign out and use email to join the live KickFeed table.';
  }
  return 'Demo mode — ranking, safety lists, and DMs are this device + seeded fans. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY for live ranking, reports, blocks, and DMs.';
}

export function matchAlertsIntro(storeFacing: boolean): string {
  const base =
    'Favorite clubs only. Kickoff is one reminder per match; goals fire when the score changes. With email sign-in, the same alerts can arrive after you close the app.';
  return storeFacing ? base : `${base} Expo Go on Android often needs a dev build for a remote token.`;
}

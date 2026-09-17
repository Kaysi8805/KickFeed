import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, processLock, type SupabaseClient } from '@supabase/supabase-js';

export type SupabasePublicConfig = {
  url: string;
  anonKey: string;
};

export function supabaseUrlFromEnv(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): string | undefined {
  const url = env.EXPO_PUBLIC_SUPABASE_URL?.trim();
  return url || undefined;
}

export function supabaseAnonKeyFromEnv(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): string | undefined {
  const key = env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();
  return key || undefined;
}

/** Both URL and anon key must be set. Missing either → demo-only auth. */
export function supabaseConfigFromEnv(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): SupabasePublicConfig | null {
  const url = supabaseUrlFromEnv(env);
  const anonKey = supabaseAnonKeyFromEnv(env);
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

export function isSupabaseConfigured(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): boolean {
  return supabaseConfigFromEnv(env) != null;
}

/**
 * Expo Go–friendly client. Session lives in AsyncStorage under supabase-js’s own key;
 * KickFeed social state stays in `kickfeed.v1.state`, keyed by `auth.users.id`.
 *
 * `processLock` serializes auth storage writes in React Native (documented Expo
 * setup). Token refresh while backgrounded is started/stopped from AppState in
 * AppProvider (`startAutoRefresh` / `stopAutoRefresh`).
 */
export function createKickfeedSupabaseClient(config: SupabasePublicConfig): SupabaseClient {
  return createClient(config.url, config.anonKey, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      lock: processLock,
    },
  });
}

let cached: SupabaseClient | null | undefined;

export function getSupabaseClient(): SupabaseClient | null {
  if (cached !== undefined) return cached;
  const config = supabaseConfigFromEnv();
  cached = config ? createKickfeedSupabaseClient(config) : null;
  return cached;
}

/** Test helper — do not call from app code. */
export function resetSupabaseClientForTests(): void {
  cached = undefined;
}

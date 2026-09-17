import type { User } from '@/data/types';
import { demoUsers } from '@/data/mocks/social';
import {
  avatarColorFromId,
  displayNameFromEmail,
  handleFromEmail,
  initialsFromName,
  type AuthMode,
} from '@/lib/userIdentity';
import { getSupabaseClient, isSupabaseConfigured } from '@/services/supabase';

export type { AuthMode };

/**
 * Auth access. Email/password via Supabase when
 * `EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_ANON_KEY` are set.
 * Demo profile picker remains the staging/dev fallback (and the only path without env).
 *
 * User ids: demo seeds stay `maya` / `omar` / …; real accounts use `auth.users.id` (uuid)
 * so a later prediction-leaderboard batch can attach rows to the same id.
 */
export type KickfeedAuthUser = {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

export type KickfeedAuthSession = {
  user: KickfeedAuthUser;
};

export type EmailAuthResult =
  | { status: 'signed_in'; user: User }
  | { status: 'confirm_email'; email: string };

/** Minimal surface we call — easy to mock in tests without a live project. */
export type AuthClient = {
  auth: {
    getSession: () => Promise<{ data: { session: KickfeedAuthSession | null } }>;
    signInWithPassword: (creds: {
      email: string;
      password: string;
    }) => Promise<{ data: { session: KickfeedAuthSession | null }; error: { message: string } | null }>;
    signUp: (creds: {
      email: string;
      password: string;
      options?: { data?: Record<string, string> };
    }) => Promise<{
      data: { session: KickfeedAuthSession | null; user: (KickfeedAuthUser & { identities?: unknown[] }) | null };
      error: { message: string } | null;
    }>;
    signOut: () => Promise<{ error: { message: string } | null }>;
  };
};

export class AuthError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
}

export function mapAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login') || m.includes('invalid credentials')) {
    return 'Check email and password.';
  }
  if (m.includes('email not confirmed') || m.includes('not confirmed')) {
    return 'Confirm the link in your email, then sign in.';
  }
  if (m.includes('already registered') || m.includes('already been registered') || m.includes('user already')) {
    return 'That email already has an account. Sign in instead.';
  }
  if (m.includes('password') && (m.includes('at least') || m.includes('6'))) {
    return 'Password must be at least 6 characters.';
  }
  if (m.includes('rate limit') || m.includes('too many')) {
    return 'Too many attempts. Wait a minute and try again.';
  }
  if (m.includes('failed to fetch') || m.includes('network') || m.includes('fetch')) {
    return 'Can’t reach Supabase. Check the project URL and your network.';
  }
  return message.trim() || 'Sign in failed.';
}

function metaString(meta: Record<string, unknown> | null | undefined, key: string): string | undefined {
  const value = meta?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function userFromSupabaseAuth(authUser: KickfeedAuthUser): User {
  const email = authUser.email?.trim() || undefined;
  const meta = authUser.user_metadata ?? undefined;
  const name =
    metaString(meta, 'full_name') ||
    metaString(meta, 'name') ||
    metaString(meta, 'display_name') ||
    (email ? displayNameFromEmail(email) : 'Fan');
  const handle = metaString(meta, 'handle') || (email ? handleFromEmail(email) : handleFromEmail(name));
  return {
    id: authUser.id,
    name,
    handle,
    bio: metaString(meta, 'bio') ?? 'KickFeed fan',
    avatarColor: metaString(meta, 'avatar_color') || avatarColorFromId(authUser.id),
    initials: initialsFromName(name),
    favoriteTeamIds: [],
    favoriteLeagueIds: [],
    email,
  };
}

function requireClient(client: AuthClient | null): AuthClient {
  if (!client) {
    throw new AuthError(
      'Supabase is not configured. Use demo mode, or set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.',
      'not_configured',
    );
  }
  return client;
}

function assertEmailPassword(email: string, password: string): string {
  const normalized = normalizeEmail(email);
  if (!isValidEmail(normalized)) {
    throw new AuthError('Enter a valid email address.', 'invalid_email');
  }
  if (password.length < 6) {
    throw new AuthError('Password must be at least 6 characters.', 'invalid_password');
  }
  return normalized;
}

export async function restoreSupabaseUser(client: AuthClient | null): Promise<User | null> {
  if (!client) return null;
  const { data } = await client.auth.getSession();
  const authUser = data.session?.user;
  if (!authUser?.id) return null;
  return userFromSupabaseAuth(authUser);
}

export async function signInWithEmailOn(
  client: AuthClient | null,
  email: string,
  password: string,
): Promise<EmailAuthResult> {
  const c = requireClient(client);
  const normalized = assertEmailPassword(email, password);
  const { data, error } = await c.auth.signInWithPassword({ email: normalized, password });
  if (error) throw new AuthError(mapAuthError(error.message), 'sign_in');
  const authUser = data.session?.user;
  if (!authUser?.id) {
    throw new AuthError('Confirm the link in your email, then sign in.', 'confirm_email');
  }
  return { status: 'signed_in', user: userFromSupabaseAuth(authUser) };
}

export async function signUpWithEmailOn(
  client: AuthClient | null,
  email: string,
  password: string,
  displayName?: string,
): Promise<EmailAuthResult> {
  const c = requireClient(client);
  const normalized = assertEmailPassword(email, password);
  const name = displayName?.trim() || displayNameFromEmail(normalized);
  const { data, error } = await c.auth.signUp({
    email: normalized,
    password,
    options: {
      data: {
        full_name: name,
        handle: handleFromEmail(normalized),
      },
    },
  });
  if (error) throw new AuthError(mapAuthError(error.message), 'sign_up');
  const identities = data.user && 'identities' in data.user ? data.user.identities : undefined;
  if (data.user && Array.isArray(identities) && identities.length === 0) {
    throw new AuthError('That email already has an account. Sign in instead.', 'already_registered');
  }
  const authUser = data.session?.user ?? data.user;
  if (data.session?.user?.id && authUser) {
    return { status: 'signed_in', user: userFromSupabaseAuth(authUser) };
  }
  return { status: 'confirm_email', email: normalized };
}

export async function signOutOn(client: AuthClient | null): Promise<void> {
  if (!client) return;
  const { error } = await client.auth.signOut();
  if (error) throw new AuthError(mapAuthError(error.message), 'sign_out');
}

export interface AuthProvider {
  listDemoUsers(): User[];
  getUser(id: string): User | undefined;
  isConfigured(): boolean;
  getSession(): Promise<User | null>;
  signInWithEmail(email: string, password: string): Promise<EmailAuthResult>;
  signUpWithEmail(email: string, password: string, displayName?: string): Promise<EmailAuthResult>;
  signOut(): Promise<void>;
  /** Stub — Expo redirect / native Google-Apple polish is a later batch. */
  signInWithOAuth(_provider: 'apple' | 'google' | 'facebook'): Promise<never>;
}

export function createAuthProvider(client: AuthClient | null): AuthProvider {
  return {
    listDemoUsers: () => demoUsers,
    getUser: (id) => demoUsers.find((u) => u.id === id),
    isConfigured: () => client != null || isSupabaseConfigured(),
    getSession: () => restoreSupabaseUser(client),
    signInWithEmail: (email, password) => signInWithEmailOn(client, email, password),
    signUpWithEmail: (email, password, displayName) => signUpWithEmailOn(client, email, password, displayName),
    signOut: () => signOutOn(client),
    signInWithOAuth: async () => {
      throw new AuthError('Apple/Google sign-in is not in this batch. Use email or demo mode.', 'oauth_stub');
    },
  };
}

function liveClient(): AuthClient | null {
  return getSupabaseClient() as AuthClient | null;
}

export const auth: AuthProvider = {
  listDemoUsers: () => demoUsers,
  getUser: (id) => demoUsers.find((u) => u.id === id),
  isConfigured: () => isSupabaseConfigured(),
  getSession: () => restoreSupabaseUser(liveClient()),
  signInWithEmail: (email, password) => signInWithEmailOn(liveClient(), email, password),
  signUpWithEmail: (email, password, displayName) => signUpWithEmailOn(liveClient(), email, password, displayName),
  signOut: () => signOutOn(liveClient()),
  signInWithOAuth: async () => {
    throw new AuthError('Apple/Google sign-in is not in this batch. Use email or demo mode.', 'oauth_stub');
  },
};

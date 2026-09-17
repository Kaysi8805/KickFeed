import {
  AuthError,
  createAuthProvider,
  isValidEmail,
  mapAuthError,
  normalizeEmail,
  restoreSupabaseUser,
  signInWithEmailOn,
  signOutOn,
  signUpWithEmailOn,
  userFromSupabaseAuth,
  type AuthClient,
  type KickfeedAuthUser,
} from '@/services/auth';
import { isSupabaseConfigured, supabaseConfigFromEnv } from '@/services/supabase';
import { describe, expect, it } from 'vitest';

const UUID = '22222222-2222-4222-8222-222222222222';

const fan: KickfeedAuthUser = {
  id: UUID,
  email: 'fan@example.com',
  user_metadata: { full_name: 'Test Fan', handle: 'testfan' },
};

function mockClient(partial: Partial<AuthClient['auth']>): AuthClient {
  return {
    auth: {
      getSession: async () => ({ data: { session: null } }),
      signInWithPassword: async () => ({ data: { session: null }, error: { message: 'unused' } }),
      signUp: async () => ({ data: { session: null, user: null }, error: { message: 'unused' } }),
      signOut: async () => ({ error: null }),
      ...partial,
    },
  };
}

describe('supabase env', () => {
  it('treats missing or blank keys as unconfigured (CI / demo path)', () => {
    expect(supabaseConfigFromEnv({})).toBeNull();
    expect(supabaseConfigFromEnv({ EXPO_PUBLIC_SUPABASE_URL: ' https://x.supabase.co ', EXPO_PUBLIC_SUPABASE_ANON_KEY: '' })).toBeNull();
    expect(
      supabaseConfigFromEnv({
        EXPO_PUBLIC_SUPABASE_URL: 'https://x.supabase.co',
        EXPO_PUBLIC_SUPABASE_ANON_KEY: ' anon ',
      }),
    ).toEqual({ url: 'https://x.supabase.co', anonKey: 'anon' });
    expect(isSupabaseConfigured({})).toBe(false);
  });
});

describe('auth helpers', () => {
  it('normalizes email and rejects junk', () => {
    expect(normalizeEmail(' Fan@Example.COM ')).toBe('fan@example.com');
    expect(isValidEmail('fan@example.com')).toBe(true);
    expect(isValidEmail('nope')).toBe(false);
  });

  it('maps supabase errors to short copy', () => {
    expect(mapAuthError('Invalid login credentials')).toBe('Check email and password.');
    expect(mapAuthError('Email not confirmed')).toMatch(/confirm/i);
    expect(mapAuthError('User already registered')).toMatch(/confirmation link/i);
    expect(mapAuthError('User already registered')).not.toMatch(/already has an account/i);
  });

  it('maps auth.users onto a KickFeed User with the supabase uuid', () => {
    const user = userFromSupabaseAuth(fan);
    expect(user.id).toBe(UUID);
    expect(user.name).toBe('Test Fan');
    expect(user.handle).toBe('fan_22222222');
    expect(user.email).toBe('fan@example.com');
    expect(user.favoriteTeamIds).toEqual([]);
  });

  it('derives collision-safe handles from email + user id when metadata has no suffix', () => {
    const gmail = userFromSupabaseAuth({
      id: UUID,
      email: 'fan@gmail.com',
      user_metadata: { full_name: 'Fan' },
    });
    const yahoo = userFromSupabaseAuth({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      email: 'fan@yahoo.com',
      user_metadata: { full_name: 'Fan' },
    });
    expect(gmail.handle).toBe('fan_22222222');
    expect(yahoo.handle).toBe('fan_aaaaaaaa');
    expect(gmail.handle).not.toBe(yahoo.handle);
  });
});

describe('email auth with a mock client', () => {
  it('signs in and returns the mapped user', async () => {
    const client = mockClient({
      signInWithPassword: async ({ email }) => ({
        data: { session: { user: { ...fan, email } } },
        error: null,
      }),
    });
    const result = await signInWithEmailOn(client, 'fan@example.com', 'secret1');
    expect(result).toEqual({ status: 'signed_in', user: expect.objectContaining({ id: UUID, email: 'fan@example.com' }) });
  });

  it('sign-up without a session asks to confirm email', async () => {
    const client = mockClient({
      signUp: async () => ({
        data: { session: null, user: { ...fan, identities: [{ id: '1' }] } },
        error: null,
      }),
    });
    const result = await signUpWithEmailOn(client, 'fan@example.com', 'secret1', 'Karol');
    expect(result).toEqual({ status: 'confirm_email', email: 'fan@example.com' });
  });

  it('does not distinguish an existing email (empty identities) from a confirmation-required signup', async () => {
    const existing = mockClient({
      signUp: async () => ({
        data: { session: null, user: { ...fan, identities: [] } },
        error: null,
      }),
    });
    const fresh = mockClient({
      signUp: async () => ({
        data: { session: null, user: { ...fan, identities: [{ id: '1' }] } },
        error: null,
      }),
    });
    const duplicateError = mockClient({
      signUp: async () => ({
        data: { session: null, user: null },
        error: { message: 'User already registered' },
      }),
    });
    const emptyIdentities = await signUpWithEmailOn(existing, 'fan@example.com', 'secret1');
    const needsConfirm = await signUpWithEmailOn(fresh, 'fan@example.com', 'secret1');
    const alreadyThere = await signUpWithEmailOn(duplicateError, 'fan@example.com', 'secret1');
    expect(emptyIdentities).toEqual({ status: 'confirm_email', email: 'fan@example.com' });
    expect(needsConfirm).toEqual(emptyIdentities);
    expect(alreadyThere).toEqual(emptyIdentities);
  });

  it('throws when supabase is not configured', async () => {
    await expect(signInWithEmailOn(null, 'fan@example.com', 'secret1')).rejects.toMatchObject({
      name: 'AuthError',
      code: 'not_configured',
    });
  });

  it('rejects short passwords before calling the client', async () => {
    const signInWithPassword = async () => {
      throw new Error('should not call network');
    };
    const client = mockClient({ signInWithPassword });
    await expect(signInWithEmailOn(client, 'fan@example.com', '123')).rejects.toMatchObject({
      code: 'invalid_password',
    });
  });

  it('restores a session user and no-ops sign-out without a client', async () => {
    const client = mockClient({
      getSession: async () => ({ data: { session: { user: fan } } }),
    });
    await expect(restoreSupabaseUser(client)).resolves.toMatchObject({ id: UUID });
    await expect(restoreSupabaseUser(null)).resolves.toBeNull();
    await expect(signOutOn(null)).resolves.toBeUndefined();
  });

  it('signs out this device only (local scope)', async () => {
    let scope: string | undefined;
    const client = mockClient({
      signOut: async (opts) => {
        scope = opts?.scope;
        return { error: null };
      },
    });
    await signOutOn(client);
    expect(scope).toBe('local');
  });
});

describe('AuthProvider mode switching', () => {
  it('keeps demo users when a mock supabase client is present', () => {
    const provider = createAuthProvider(
      mockClient({
        getSession: async () => ({ data: { session: { user: fan } } }),
      }),
    );
    expect(provider.isConfigured()).toBe(true);
    expect(provider.listDemoUsers().some((u) => u.id === 'maya')).toBe(true);
    expect(provider.getUser('maya')?.name).toBe('Maya Chen');
  });

  it('demo-only provider still lists seeds and stubs oauth', async () => {
    const provider = createAuthProvider(null);
    expect(provider.isConfigured()).toBe(false);
    expect(provider.listDemoUsers().length).toBeGreaterThan(3);
    await expect(provider.getSession()).resolves.toBeNull();
    await expect(provider.signInWithOAuth('google')).rejects.toMatchObject({ code: 'oauth_stub' });
  });
});

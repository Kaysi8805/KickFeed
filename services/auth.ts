import type { User } from '@/data/types';
import { demoUsers } from '@/data/mocks/social';

/**
 * Auth access. v1 is demo-only (pick a seeded profile).
 * Replace `auth` with a real provider (email, OAuth, magic link)
 * that implements this interface — UI already talks to `signInDemo` / `signOut`.
 */
export interface AuthProvider {
  listDemoUsers(): User[];
  getUser(id: string): User | undefined;
  /** Stub for a future email/password flow. */
  signInWithEmail(_email: string, _password: string): Promise<never>;
  /** Stub for a future OAuth flow. */
  signInWithOAuth(_provider: 'apple' | 'google' | 'facebook'): Promise<never>;
}

export const mockAuthProvider: AuthProvider = {
  listDemoUsers: () => demoUsers,
  getUser: (id) => demoUsers.find((u) => u.id === id),
  signInWithEmail: async () => {
    throw new Error('Email auth is not enabled in v1. Use demo mode.');
  },
  signInWithOAuth: async () => {
    throw new Error('OAuth is not enabled in v1. Use demo mode.');
  },
};

export const auth: AuthProvider = mockAuthProvider;

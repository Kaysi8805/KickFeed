import { demoUsers } from '@/data/mocks/social';
import type { User } from '@/data/types';

type FavoriteIds = {
  teams: string[];
  leagues: string[];
  players: string[];
};

/** Seeded demo profile ids (`maya`, `omar`, …). */
export const DEMO_USER_IDS = new Set(demoUsers.map((u) => u.id));

/** auth.users ids are UUIDs. Leaderboards attach to the same id as social state. */
export const SUPABASE_USER_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const AVATAR_PALETTE = [
  '#22C55E',
  '#F5C518',
  '#3B82F6',
  '#DC2626',
  '#C8102E',
  '#A855F7',
  '#EA580C',
  '#0EA5E9',
] as const;

export type AuthMode = 'demo' | 'supabase';

export function isDemoUserId(id: string): boolean {
  return DEMO_USER_IDS.has(id);
}

export function isSupabaseUserId(id: string): boolean {
  return SUPABASE_USER_ID_RE.test(id);
}

/** Demo seed id or a Supabase auth.users uuid — anything else is dropped on hydrate. */
export function isPersistedUserId(id: string): boolean {
  return isDemoUserId(id) || isSupabaseUserId(id);
}

export function inferAuthMode(userId: string | null, stored?: unknown): AuthMode | null {
  if (stored === 'demo' || stored === 'supabase') return stored;
  if (!userId) return null;
  return isSupabaseUserId(userId) ? 'supabase' : isDemoUserId(userId) ? 'demo' : null;
}

export function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'KF';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  const first = parts[0][0] ?? '';
  const last = parts[parts.length - 1]?.[0] ?? '';
  return (first + last).toUpperCase() || 'KF';
}

export function handleFromName(name: string): string {
  const cleaned = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 24);
  return cleaned || 'fan';
}

export function handleFromEmail(email: string): string {
  const local = email.split('@')[0] ?? 'fan';
  return handleFromName(local);
}

/** First 8 hex chars of a uuid, no dashes — suffix that makes handles unique per auth.users row. */
export function handleSuffixFromUserId(userId: string): string {
  return userId.replace(/-/g, '').slice(0, 8).toLowerCase();
}

/**
 * Collision-safe @handle: sanitized email local-part + `_` + user-id suffix.
 * `fan@gmail.com` and `fan@yahoo.com` must not share `fan` (profiles.handle is unique).
 * Keep in sync with `public.kickfeed_handle_for_user` in supabase/migrations.
 */
export function uniqueHandleFromEmailAndUserId(email: string, userId: string): string {
  const local = handleFromEmail(email || 'fan@local').slice(0, 16);
  const suffix = handleSuffixFromUserId(userId);
  return `${local || 'fan'}_${suffix || 'user'}`;
}

export function displayNameFromEmail(email: string): string {
  const local = email.split('@')[0] ?? 'Fan';
  const titled = local
    .replace(/[._-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
  return titled || 'Fan';
}

export function avatarColorFromId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

/**
 * Build a KickFeed `User` from a stored profile slice (demo patch or Supabase account).
 * Favorites come from the per-user AsyncStorage map when provided.
 */
export function userFromProfile(
  id: string,
  profile: Partial<User> | undefined,
  favorites?: FavoriteIds,
): User {
  const name = profile?.name?.trim() || 'Fan';
  return {
    id,
    name,
    handle: profile?.handle?.trim() || handleFromName(name),
    bio: profile?.bio ?? '',
    avatarColor: profile?.avatarColor || avatarColorFromId(id),
    initials: profile?.initials || initialsFromName(name),
    favoriteTeamIds: favorites?.teams ?? profile?.favoriteTeamIds ?? [],
    favoriteLeagueIds: favorites?.leagues ?? profile?.favoriteLeagueIds ?? [],
    tvCountryId: profile?.tvCountryId,
    email: profile?.email,
  };
}

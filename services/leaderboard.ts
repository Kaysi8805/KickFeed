import type { MotmVote, ScorePrediction, User } from '@/data/types';
import { clampScore } from '@/lib/engagement';
import { isPersistedUserId, userFromProfile } from '@/lib/userIdentity';
import { getSupabaseClient } from '@/services/supabase';

export type LeaderboardRowError = { message: string };

export type LeaderboardQueryResult<T> = {
  data: T[] | null;
  error: LeaderboardRowError | null;
};

export type LeaderboardMutateResult = { error: LeaderboardRowError | null };

/** Minimal supabase-js surface for leaderboard I/O — easy to mock in CI. */
export type LeaderboardClient = {
  from: (table: string) => {
    select: (columns: string) => Promise<LeaderboardQueryResult<Record<string, unknown>>>;
    eq?: (column: string, value: string) => {
      maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: LeaderboardRowError | null }>;
    };
  };
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: LeaderboardRowError | null }>;
};

export type RemoteLeaderboardRows = {
  predictions: ScorePrediction[];
  motmVotes: MotmVote[];
  users: User[];
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function parseRemotePrediction(value: unknown): ScorePrediction | null {
  if (!isPlainObject(value)) return null;
  const matchId = asString(value.match_id);
  const userId = asString(value.user_id);
  if (!matchId || !userId || !isPersistedUserId(userId)) return null;
  if (typeof value.home_score !== 'number' || typeof value.away_score !== 'number') return null;
  const createdAt = asString(value.created_at) ?? new Date(0).toISOString();
  return {
    matchId,
    userId,
    homeScore: clampScore(value.home_score),
    awayScore: clampScore(value.away_score),
    createdAt,
    updatedAt: asString(value.updated_at) ?? createdAt,
  };
}

export function parseRemoteMotmVote(value: unknown): MotmVote | null {
  if (!isPlainObject(value)) return null;
  const matchId = asString(value.match_id);
  const userId = asString(value.user_id);
  const playerKey = asString(value.player_key);
  const playerName = asString(value.player_name);
  const teamId = asString(value.team_id);
  if (!matchId || !userId || !isPersistedUserId(userId) || !playerKey || !playerName || !teamId) return null;
  return {
    matchId,
    userId,
    playerKey,
    playerId: asString(value.player_id),
    playerName,
    teamId,
    createdAt: asString(value.created_at) ?? new Date(0).toISOString(),
  };
}

export function parseRemoteProfile(value: unknown): User | null {
  if (!isPlainObject(value)) return null;
  const id = asString(value.id);
  if (!id || !isPersistedUserId(id)) return null;
  return userFromProfile(id, {
    name: asString(value.display_name),
    handle: asString(value.handle),
    bio: asString(value.bio),
    avatarColor: asString(value.avatar_color),
  });
}

export function predictionToRemote(
  row: ScorePrediction,
  leagueId = '',
): Record<string, unknown> {
  return {
    match_id: row.matchId,
    user_id: row.userId,
    league_id: leagueId,
    home_score: clampScore(row.homeScore),
    away_score: clampScore(row.awayScore),
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

export function motmVoteToRemote(row: MotmVote): Record<string, unknown> {
  return {
    match_id: row.matchId,
    user_id: row.userId,
    player_key: row.playerKey,
    player_id: row.playerId ?? null,
    player_name: row.playerName,
    team_id: row.teamId,
    created_at: row.createdAt,
  };
}

/** Wrap supabase-js `from()` / `rpc()` so tests can mock a tiny Promise surface. */
export function asLeaderboardClient(
  client: {
    from: (table: string) => {
      select: (columns: string) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
    };
    rpc: (
      fn: string,
      args?: Record<string, unknown>,
    ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
  } | null,
): LeaderboardClient | null {
  if (!client) return null;
  return {
    from: (table: string) => ({
      select: async (columns: string) => {
        const { data, error } = await client.from(table).select(columns);
        return {
          data: Array.isArray(data) ? (data as Record<string, unknown>[]) : null,
          error: error ? { message: error.message } : null,
        };
      },
    }),
    rpc: async (fn, args) => {
      const { data, error } = await client.rpc(fn, args);
      return { data, error: error ? { message: error.message } : null };
    },
  };
}

export async function fetchRemoteLeaderboardRows(
  client: LeaderboardClient | null,
): Promise<RemoteLeaderboardRows | { error: string }> {
  if (!client) return { error: 'not_configured' };
  try {
    const [predictionsRes, votesRes, profilesRes] = await Promise.all([
      client.from('predictions').select('match_id,user_id,league_id,home_score,away_score,created_at,updated_at'),
      client.from('motm_votes').select('match_id,user_id,player_key,player_id,player_name,team_id,created_at'),
      client.from('profiles').select('id,handle,display_name,bio,avatar_color'),
    ]);
    if (predictionsRes.error) return { error: predictionsRes.error.message };
    if (votesRes.error) return { error: votesRes.error.message };
    if (profilesRes.error) return { error: profilesRes.error.message };

    const predictions = (predictionsRes.data ?? []).map(parseRemotePrediction).filter((row): row is ScorePrediction => row != null);
    const motmVotes = (votesRes.data ?? []).map(parseRemoteMotmVote).filter((row): row is MotmVote => row != null);
    const users = (profilesRes.data ?? []).map(parseRemoteProfile).filter((row): row is User => row != null);
    return { predictions, motmVotes, users };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'fetch failed' };
  }
}

export async function upsertRemotePrediction(
  client: LeaderboardClient | null,
  row: ScorePrediction,
  leagueId = '',
  kickoff?: string,
): Promise<{ error: string | null }> {
  if (!client) return { error: 'not_configured' };
  try {
    const { error } = await client.rpc('kickfeed_upsert_prediction', {
      p_match_id: row.matchId,
      p_home_score: clampScore(row.homeScore),
      p_away_score: clampScore(row.awayScore),
      p_league_id: leagueId,
      p_kickoff: kickoff,
    });
    return { error: error?.message ?? null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'upsert failed' };
  }
}

export async function upsertRemoteMotmVote(
  client: LeaderboardClient | null,
  row: MotmVote,
  kickoff?: string,
): Promise<{ error: string | null }> {
  if (!client) return { error: 'not_configured' };
  try {
    const { error } = await client.rpc('kickfeed_upsert_motm_vote', {
      p_match_id: row.matchId,
      p_player_key: row.playerKey,
      p_player_id: row.playerId ?? null,
      p_player_name: row.playerName,
      p_team_id: row.teamId,
      p_kickoff: kickoff,
    });
    return { error: error?.message ?? null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'upsert failed' };
  }
}

export async function syncUserEngagementToCloud(
  client: LeaderboardClient | null,
  userId: string,
  predictions: ScorePrediction[],
  motmVotes: MotmVote[],
  leagueIdFor: (matchId: string) => string,
  kickoffFor: (matchId: string) => string | undefined,
): Promise<{ error: string | null }> {
  if (!client) return { error: 'not_configured' };
  try {
    const minePred = predictions.filter((row) => row.userId === userId);
    const mineVotes = motmVotes.filter((row) => row.userId === userId);
    const results = await Promise.all([
      ...minePred.map((row) => upsertRemotePrediction(client, row, leagueIdFor(row.matchId), kickoffFor(row.matchId))),
      ...mineVotes.map((row) => upsertRemoteMotmVote(client, row, kickoffFor(row.matchId))),
    ]);
    const first = results.find((row) => row.error);
    return { error: first?.error ?? null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'sync failed' };
  }
}

export async function fetchRemoteProfileById(userId: string): Promise<User | null> {
  const client = getSupabaseClient();
  if (!client || !isPersistedUserId(userId)) return null;
  try {
    const { data, error } = await client
      .from('profiles')
      .select('id,handle,display_name,bio,avatar_color')
      .eq('id', userId)
      .maybeSingle();
    if (error || !data) return null;
    return parseRemoteProfile(data);
  } catch {
    return null;
  }
}

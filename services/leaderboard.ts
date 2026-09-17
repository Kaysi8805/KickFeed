import type { MotmVote, ScorePrediction, User } from '@/data/types';
import { clampScore } from '@/lib/engagement';
import { isPersistedUserId, userFromProfile } from '@/lib/userIdentity';

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
    upsert: (
      row: Record<string, unknown>,
      opts?: { onConflict?: string },
    ) => Promise<LeaderboardMutateResult>;
  };
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

/** Wrap supabase-js `from()` so tests can mock a tiny Promise surface. */
export function asLeaderboardClient(
  client: {
    from: (table: string) => {
      select: (columns: string) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
      upsert: (
        row: Record<string, unknown>,
        opts?: { onConflict?: string },
      ) => PromiseLike<{ error: { message: string } | null }>;
    };
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
      upsert: async (row, opts) => {
        const { error } = await client.from(table).upsert(row, opts);
        return { error: error ? { message: error.message } : null };
      },
    }),
  };
}

export async function fetchRemoteLeaderboardRows(
  client: LeaderboardClient | null,
): Promise<RemoteLeaderboardRows | { error: string }> {
  if (!client) return { error: 'not_configured' };
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
}

export async function upsertRemotePrediction(
  client: LeaderboardClient | null,
  row: ScorePrediction,
  leagueId = '',
): Promise<{ error: string | null }> {
  if (!client) return { error: 'not_configured' };
  const { error } = await client.from('predictions').upsert(predictionToRemote(row, leagueId), {
    onConflict: 'match_id,user_id',
  });
  return { error: error?.message ?? null };
}

export async function upsertRemoteMotmVote(
  client: LeaderboardClient | null,
  row: MotmVote,
): Promise<{ error: string | null }> {
  if (!client) return { error: 'not_configured' };
  const { error } = await client.from('motm_votes').upsert(motmVoteToRemote(row), {
    onConflict: 'match_id,user_id',
  });
  return { error: error?.message ?? null };
}

export async function syncUserEngagementToCloud(
  client: LeaderboardClient | null,
  userId: string,
  predictions: ScorePrediction[],
  motmVotes: MotmVote[],
  leagueIdFor: (matchId: string) => string,
): Promise<void> {
  if (!client) return;
  const minePred = predictions.filter((row) => row.userId === userId);
  const mineVotes = motmVotes.filter((row) => row.userId === userId);
  await Promise.all([
    ...minePred.map((row) => upsertRemotePrediction(client, row, leagueIdFor(row.matchId))),
    ...mineVotes.map((row) => upsertRemoteMotmVote(client, row)),
  ]);
}

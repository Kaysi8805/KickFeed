import type { User } from '@/data/types';
import {
  cleanInviteCode,
  cleanLeagueName,
  isFantasyCompetition,
  isRoundId,
  isSeasonYear,
  parseFantasyLeague,
  parseFantasyMember,
  parseFantasyPick,
  parseFantasyRoundPoints,
  type FantasyLeague,
  type FantasyMember,
  type FantasyPick,
  type FantasyRoundPoints,
  type FantasySlot,
  type FantasySnapshot,
} from '@/lib/fantasy';
import { isPersistedUserId, userFromProfile } from '@/lib/userIdentity';

export type FantasyRowError = { message: string };

export type FantasyQueryResult = {
  data: Record<string, unknown>[] | null;
  error: FantasyRowError | null;
};

export type FantasyClient = {
  from: (table: string) => {
    select: (columns: string) => Promise<FantasyQueryResult>;
  };
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: FantasyRowError | null }>;
};

export type RemoteFantasy = {
  snapshot: FantasySnapshot;
  users: User[];
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function asFantasyClient(
  client: {
    from: (table: string) => {
      select: (columns: string) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
    };
    rpc: (
      fn: string,
      args?: Record<string, unknown>,
    ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
  } | null,
): FantasyClient | null {
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

export async function fetchRemoteFantasy(client: FantasyClient | null): Promise<RemoteFantasy | { error: string }> {
  if (!client) return { error: 'not_configured' };
  try {
    const [leaguesRes, membersRes, picksRes, pointsRes, profilesRes] = await Promise.all([
      client.from('fantasy_leagues').select('id,name,invite_code,owner_id,competition_id,season,created_at'),
      client.from('fantasy_members').select('league_id,user_id,joined_at'),
      client.from('fantasy_picks').select('league_id,user_id,round_id,slots,updated_at'),
      client.from('fantasy_points').select('league_id,user_id,round_id,points,goals,assists'),
      client.from('profiles').select('id,handle,display_name,bio,avatar_color'),
    ]);
    if (leaguesRes.error) return { error: leaguesRes.error.message };
    if (membersRes.error) return { error: membersRes.error.message };
    if (picksRes.error) return { error: picksRes.error.message };
    if (pointsRes.error) return { error: pointsRes.error.message };
    if (profilesRes.error) return { error: profilesRes.error.message };

    const leagues = (leaguesRes.data ?? []).map(parseFantasyLeague).filter((row): row is FantasyLeague => row != null);
    const leagueIds = new Set(leagues.map((league) => league.id));
    const members = (membersRes.data ?? [])
      .map(parseFantasyMember)
      .filter((row): row is FantasyMember => row != null && leagueIds.has(row.leagueId));
    const picks = (picksRes.data ?? [])
      .map(parseFantasyPick)
      .filter((row): row is FantasyPick => row != null && leagueIds.has(row.leagueId));
    const points = (pointsRes.data ?? [])
      .map(parseFantasyRoundPoints)
      .filter((row): row is FantasyRoundPoints => row != null && leagueIds.has(row.leagueId));
    const users = (profilesRes.data ?? [])
      .map((row) => {
        if (!isPlainObject(row)) return null;
        const id = typeof row.id === 'string' ? row.id : '';
        if (!isPersistedUserId(id)) return null;
        return userFromProfile(id, {
          name: typeof row.display_name === 'string' ? row.display_name : undefined,
          handle: typeof row.handle === 'string' ? row.handle : undefined,
          bio: typeof row.bio === 'string' ? row.bio : undefined,
          avatarColor: typeof row.avatar_color === 'string' ? row.avatar_color : undefined,
        });
      })
      .filter((row): row is User => row != null);
    return { snapshot: { leagues, members, picks, points }, users };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'fetch failed' };
  }
}

function rpcLeague(data: unknown): Pick<FantasyLeague, 'id' | 'name' | 'inviteCode' | 'competitionId' | 'season'> | null {
  if (!isPlainObject(data)) return null;
  const id = typeof data.id === 'string' ? data.id : '';
  const name = typeof data.name === 'string' ? cleanLeagueName(data.name) : null;
  const inviteCode = typeof data.invite_code === 'string' ? cleanInviteCode(data.invite_code) : null;
  const competitionId = typeof data.competition_id === 'string' ? data.competition_id : '';
  const season = typeof data.season === 'number' ? data.season : Number(data.season);
  if (!id || !name || !inviteCode || !isFantasyCompetition(competitionId) || !isSeasonYear(season)) return null;
  return { id, name, inviteCode, competitionId, season };
}

export async function createRemoteFantasyLeague(
  client: FantasyClient | null,
  name: string,
  competitionId: string,
  season: number,
): Promise<{ league: { id: string } } | { error: string }> {
  if (!client) return { error: 'not_configured' };
  const cleaned = cleanLeagueName(name);
  if (!cleaned) return { error: 'invalid_name' };
  if (!isFantasyCompetition(competitionId)) return { error: 'invalid_competition' };
  if (!isSeasonYear(season)) return { error: 'invalid_season' };
  try {
    const { data, error } = await client.rpc('kickfeed_create_fantasy_league', {
      p_name: cleaned,
      p_competition: competitionId,
      p_season: season,
    });
    if (error) return { error: error.message };
    const league = rpcLeague(data);
    if (!league) return { error: 'invalid_name' };
    return { league: { id: league.id } };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'create failed' };
  }
}

export async function joinRemoteFantasyLeague(
  client: FantasyClient | null,
  code: string,
): Promise<{ league: { id: string } } | { error: string }> {
  if (!client) return { error: 'not_configured' };
  const cleaned = cleanInviteCode(code);
  if (!cleaned) return { error: 'invalid_code' };
  try {
    const { data, error } = await client.rpc('kickfeed_join_fantasy_league', { p_code: cleaned });
    if (error) return { error: error.message };
    const league = rpcLeague(data);
    if (!league) return { error: 'league_not_found' };
    return { league: { id: league.id } };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'join failed' };
  }
}

export type FantasySyncInvoker = {
  functions: {
    invoke: (
      name: string,
      args: { body: Record<string, unknown> },
    ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
  };
};

/** Ask KickFeed to store this competition’s round kickoffs. The pick RPC does not take a deadline. */
export async function syncFantasyDeadline(
  client: FantasySyncInvoker | null,
  competitionId: string,
  season: number,
): Promise<{ error: string | null }> {
  if (!client) return { error: 'not_configured' };
  if (!isFantasyCompetition(competitionId) || !isSeasonYear(season)) return { error: 'invalid_competition' };
  try {
    const { data, error } = await client.functions.invoke('sync-fantasy-deadlines', {
      body: { competitionId, season },
    });
    if (error) return { error: 'deadline_unavailable' };
    if (!data || typeof data !== 'object' || (data as { ok?: unknown }).ok === false) {
      const reason = data && typeof data === 'object' ? (data as { reason?: unknown }).reason : undefined;
      return { error: typeof reason === 'string' ? reason : 'deadline_unavailable' };
    }
    return { error: null };
  } catch {
    return { error: 'deadline_unavailable' };
  }
}

export async function upsertRemoteFantasyPick(
  client: FantasyClient | null,
  leagueId: string,
  roundId: string,
  slots: FantasySlot[],
): Promise<{ error: string | null }> {
  if (!client) return { error: 'not_configured' };
  if (!isRoundId(roundId)) return { error: 'invalid_round' };
  try {
    const { error } = await client.rpc('kickfeed_upsert_fantasy_pick', {
      p_league_id: leagueId,
      p_round_id: roundId,
      p_slots: slots,
    });
    return { error: error?.message ?? null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'upsert failed' };
  }
}

export async function upsertRemoteFantasyPoints(
  client: FantasyClient | null,
  leagueId: string,
  roundId: string,
  rows: Array<Pick<FantasyRoundPoints, 'userId' | 'points' | 'goals' | 'assists'>>,
): Promise<{ error: string | null }> {
  if (!client) return { error: 'not_configured' };
  if (!isRoundId(roundId)) return { error: 'invalid_round' };
  try {
    const { error } = await client.rpc('kickfeed_upsert_fantasy_points', {
      p_league_id: leagueId,
      p_round_id: roundId,
      p_rows: rows,
    });
    return { error: error?.message ?? null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'upsert failed' };
  }
}

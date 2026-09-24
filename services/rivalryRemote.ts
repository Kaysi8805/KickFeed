import {
  parseRemoteBond,
  parseRemoteClub,
  parseRemoteLedger,
  rivalryFactsPayload,
  type RivalryBook,
  type RivalryClub,
  type RivalryMatchFact,
} from '@/lib/rivalry';

export type RivalryRowError = { message: string };

export type RivalryQueryResult = {
  data: Record<string, unknown>[] | null;
  error: RivalryRowError | null;
};

export type RivalryClient = {
  from: (table: string) => {
    select: (columns: string) => Promise<RivalryQueryResult>;
  };
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: RivalryRowError | null }>;
};

const CLUB_COLUMNS = 'user_id,club_id,club_name,club_code,crest_url,color,accent';
const BOND_COLUMNS = [
  'id,user_a,user_b,club_a_id,club_b_id,club_a_name,club_b_name,club_a_code,club_b_code',
  'club_a_crest,club_b_crest,club_a_color,club_b_color,club_a_accent,club_b_accent',
  'season,status,invited_by,points_a,points_b,created_at,updated_at',
].join(',');
const LEDGER_COLUMNS = 'id,bond_id,kind,match_id,points_a,points_b,body,author_id,source_key,created_at';

export function asRivalryClient(
  client: {
    from: (table: string) => {
      select: (columns: string) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
    };
    rpc: (
      fn: string,
      args?: Record<string, unknown>,
    ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
  } | null,
): RivalryClient | null {
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

function rpcError(error: RivalryRowError | null): string | null {
  return error ? error.message : null;
}

export async function fetchRemoteRivalry(client: RivalryClient | null): Promise<RivalryBook | { error: string }> {
  if (!client) return { error: 'not_configured' };
  try {
    const [clubsRes, bondsRes, ledgerRes] = await Promise.all([
      client.from('rivalry_clubs').select(CLUB_COLUMNS),
      client.from('rivalry_bonds').select(BOND_COLUMNS),
      client.from('rivalry_ledger').select(LEDGER_COLUMNS),
    ]);
    if (clubsRes.error) return { error: clubsRes.error.message };
    if (bondsRes.error) return { error: bondsRes.error.message };
    if (ledgerRes.error) return { error: ledgerRes.error.message };
    const clubs: RivalryBook['clubs'] = {};
    for (const row of clubsRes.data ?? []) {
      const parsed = parseRemoteClub(row);
      if (parsed) clubs[parsed.userId] = parsed.club;
    }
    const bonds = (bondsRes.data ?? []).map(parseRemoteBond).filter((row) => row != null);
    const ledger = (ledgerRes.data ?? []).map(parseRemoteLedger).filter((row) => row != null);
    return { clubs, bonds, ledger };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'fetch failed' };
  }
}

export async function setRemoteRivalryClub(
  client: RivalryClient | null,
  club: RivalryClub,
): Promise<{ error: string | null }> {
  if (!client) return { error: 'not_configured' };
  try {
    const { error } = await client.rpc('kickfeed_set_rivalry_club', {
      p_club_id: club.clubId,
      p_club_name: club.name,
      p_club_code: club.code,
      p_crest_url: club.crestUrl ?? null,
      p_color: club.color,
      p_accent: club.accent,
    });
    return { error: rpcError(error) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'bad_club' };
  }
}

export async function inviteRemoteRivalry(
  client: RivalryClient | null,
  peerId: string,
): Promise<{ bondId: string } | { error: string }> {
  if (!client) return { error: 'not_configured' };
  try {
    const { data, error } = await client.rpc('kickfeed_invite_rivalry', { p_peer_id: peerId });
    if (error) return { error: error.message };
    return typeof data === 'string' && data ? { bondId: data } : { error: 'bad_peer' };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'bad_peer' };
  }
}

export async function respondRemoteRivalry(
  client: RivalryClient | null,
  bondId: string,
  accept: boolean,
): Promise<{ error: string | null }> {
  if (!client) return { error: 'not_configured' };
  try {
    const { error } = await client.rpc('kickfeed_respond_rivalry', { p_bond_id: bondId, p_accept: accept });
    return { error: rpcError(error) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'not_invite' };
  }
}

export async function endRemoteRivalry(client: RivalryClient | null, bondId: string): Promise<{ error: string | null }> {
  if (!client) return { error: 'not_configured' };
  try {
    const { error } = await client.rpc('kickfeed_end_rivalry', { p_bond_id: bondId });
    return { error: rpcError(error) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'not_active' };
  }
}

export async function postRemoteRivalryBanter(
  client: RivalryClient | null,
  bondId: string,
  body: string,
): Promise<{ error: string | null }> {
  if (!client) return { error: 'not_configured' };
  try {
    const { error } = await client.rpc('kickfeed_post_rivalry_banter', { p_bond_id: bondId, p_body: body });
    return { error: rpcError(error) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'bad_banter' };
  }
}

export async function syncRemoteRivalryLedger(
  client: RivalryClient | null,
  bondId: string,
  facts: readonly RivalryMatchFact[],
): Promise<{ error: string | null }> {
  if (!client) return { error: 'not_configured' };
  try {
    const { error } = await client.rpc('kickfeed_sync_rivalry_ledger', {
      p_bond_id: bondId,
      p_matches: rivalryFactsPayload(facts),
    });
    return { error: rpcError(error) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'bad_matches' };
  }
}

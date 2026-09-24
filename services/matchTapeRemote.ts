import type { MatchTapeAttachment } from '@/data/types';
import { parseRemoteMatchTape, tapeErrorMessage, type TapeScoreSnapshot } from '@/lib/matchTape';

export type MatchTapeRowError = { message: string };

export type MatchTapeClient = {
  from: (table: string) => {
    select: (columns: string) => Promise<{ data: Record<string, unknown>[] | null; error: MatchTapeRowError | null }>;
  };
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ error: MatchTapeRowError | null }>;
};

const COLUMNS = [
  'id',
  'kind',
  'thread_key',
  'match_id',
  'status',
  'attached_by',
  'created_at',
  'archived_at',
  'home_name',
  'away_name',
  'home_short',
  'away_short',
  'kickoff',
  'home_score',
  'away_score',
  'minute',
  'match_status',
].join(',');

export function asMatchTapeClient(
  client: {
    from: (table: string) => {
      select: (columns: string) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
    };
    rpc: (
      fn: string,
      args?: Record<string, unknown>,
    ) => PromiseLike<{ error: { message: string } | null }>;
  } | null,
): MatchTapeClient | null {
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
      const { error } = await client.rpc(fn, args);
      return { error: error ? { message: error.message } : null };
    },
  };
}

export async function fetchRemoteMatchTapes(
  client: MatchTapeClient | null,
): Promise<{ tapes: MatchTapeAttachment[] } | { error: string }> {
  if (!client) return { error: 'not_configured' };
  try {
    const res = await client.from('match_tape_attachments').select(COLUMNS);
    if (res.error) return { error: res.error.message };
    return {
      tapes: (res.data ?? []).map(parseRemoteMatchTape).filter((row): row is MatchTapeAttachment => row != null),
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'fetch failed' };
  }
}

export async function attachRemoteMatchTape(
  client: MatchTapeClient | null,
  row: MatchTapeAttachment,
): Promise<{ error: string | null }> {
  if (!client) return { error: 'not_configured' };
  try {
    const { error } = await client.rpc('kickfeed_attach_match_tape', {
      p_id: row.id,
      p_kind: row.kind,
      p_thread_key: row.threadKey,
      p_match_id: row.matchId,
      p_home_name: row.homeName,
      p_away_name: row.awayName,
      p_home_short: row.homeShort,
      p_away_short: row.awayShort,
      p_kickoff: row.kickoff ?? null,
    });
    return { error: error ? tapeErrorMessage(error.message) : null };
  } catch (err) {
    return { error: tapeErrorMessage(err instanceof Error ? err.message : 'attach failed') };
  }
}

export async function archiveRemoteMatchTape(
  client: MatchTapeClient | null,
  id: string,
  snapshot?: TapeScoreSnapshot,
): Promise<{ error: string | null }> {
  if (!client) return { error: 'not_configured' };
  try {
    const { error } = await client.rpc('kickfeed_archive_match_tape', {
      p_id: id,
      p_home_score: snapshot?.homeScore ?? null,
      p_away_score: snapshot?.awayScore ?? null,
      p_minute: snapshot?.minute ?? null,
      p_match_status: snapshot?.matchStatus ?? null,
    });
    return { error: error ? tapeErrorMessage(error.message) : null };
  } catch (err) {
    return { error: tapeErrorMessage(err instanceof Error ? err.message : 'archive failed') };
  }
}

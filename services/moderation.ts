import type { UserReport } from '@/data/types';
import { isPersistedUserId } from '@/lib/userIdentity';
import {
  normalizeReportReason,
  parseUserReport,
  uniqueBlockedIds,
  type ReportInput,
} from '@/lib/moderation';
import { getSupabaseClient } from '@/services/supabase';

export type ModerationRowError = { message: string };

export type ModerationMutateResult = { error: ModerationRowError | null };

export type RemoteBlockRow = {
  blockerId: string;
  blockedId: string;
  createdAt: string;
};

/** Minimal supabase-js surface for blocks/reports — easy to mock in CI. */
export type ModerationClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => Promise<{ data: Record<string, unknown>[] | null; error: ModerationRowError | null }>;
    };
    insert: (row: Record<string, unknown>) => Promise<{ error: ModerationRowError | null }>;
    delete: () => {
      eq: (
        column: string,
        value: string,
      ) => {
        eq: (column: string, value: string) => Promise<{ error: ModerationRowError | null }>;
      };
    };
  };
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function parseRemoteBlock(value: unknown): RemoteBlockRow | null {
  if (!isPlainObject(value)) return null;
  const blockerId = asString(value.blocker_id);
  const blockedId = asString(value.blocked_id);
  if (!blockerId || !blockedId || !isPersistedUserId(blockerId) || !isPersistedUserId(blockedId)) return null;
  if (blockerId === blockedId) return null;
  return {
    blockerId,
    blockedId,
    createdAt: asString(value.created_at) ?? new Date(0).toISOString(),
  };
}

export function parseRemoteReport(value: unknown): UserReport | null {
  if (!isPlainObject(value)) return null;
  return parseUserReport({
    id: asString(value.id),
    reporterId: asString(value.reporter_id),
    targetType: asString(value.target_type),
    targetId: asString(value.target_id),
    targetUserId: asString(value.target_user_id),
    reason: asString(value.reason),
    createdAt: asString(value.created_at),
  });
}

export function blockToRemote(blockerId: string, blockedId: string, createdAt?: string): Record<string, unknown> {
  return {
    blocker_id: blockerId,
    blocked_id: blockedId,
    ...(createdAt ? { created_at: createdAt } : {}),
  };
}

export function reportToRemote(row: UserReport): Record<string, unknown> {
  return {
    id: row.id,
    reporter_id: row.reporterId,
    target_type: row.targetType,
    target_id: row.targetId,
    target_user_id: row.targetUserId,
    reason: row.reason,
    created_at: row.createdAt,
  };
}

export function asModerationClient(
  client: { from: (table: string) => unknown } | null,
): ModerationClient | null {
  if (!client) return null;
  return {
    from: (table: string) => {
      const query = client.from(table) as {
        select: (columns: string) => {
          eq: (
            column: string,
            value: string,
          ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
        };
        insert: (row: Record<string, unknown>) => PromiseLike<{ error: { message: string } | null }>;
        delete: () => {
          eq: (
            column: string,
            value: string,
          ) => {
            eq: (
              column: string,
              value: string,
            ) => PromiseLike<{ error: { message: string } | null }>;
          };
        };
      };
      return {
        select: (columns: string) => ({
          eq: async (column: string, value: string) => {
            const { data, error } = await query.select(columns).eq(column, value);
            return {
              data: Array.isArray(data) ? (data as Record<string, unknown>[]) : null,
              error: error ? { message: error.message } : null,
            };
          },
        }),
        insert: async (row: Record<string, unknown>) => {
          const { error } = await query.insert(row);
          return { error: error ? { message: error.message } : null };
        },
        delete: () => ({
          eq: (column: string, value: string) => ({
            eq: async (column2: string, value2: string) => {
              const { error } = await query.delete().eq(column, value).eq(column2, value2);
              return { error: error ? { message: error.message } : null };
            },
          }),
        }),
      };
    },
  };
}

export async function fetchRemoteBlocks(
  client: ModerationClient | null,
  blockerId: string,
): Promise<{ ids: string[] } | { error: string }> {
  if (!client) return { error: 'not_configured' };
  if (!isPersistedUserId(blockerId)) return { error: 'bad_identity' };
  try {
    const { data, error } = await client
      .from('user_blocks')
      .select('blocker_id,blocked_id,created_at')
      .eq('blocker_id', blockerId);
    if (error) return { error: error.message };
    const ids = uniqueBlockedIds(
      (data ?? []).map(parseRemoteBlock).filter((row): row is RemoteBlockRow => row != null).map((row) => row.blockedId),
      blockerId,
    );
    return { ids };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'fetch failed' };
  }
}

export async function fetchRemoteReports(
  client: ModerationClient | null,
  reporterId: string,
): Promise<{ reports: UserReport[] } | { error: string }> {
  if (!client) return { error: 'not_configured' };
  if (!isPersistedUserId(reporterId)) return { error: 'bad_identity' };
  try {
    const { data, error } = await client
      .from('user_reports')
      .select('id,reporter_id,target_type,target_id,target_user_id,reason,created_at')
      .eq('reporter_id', reporterId);
    if (error) return { error: error.message };
    const reports = (data ?? []).map(parseRemoteReport).filter((row): row is UserReport => row != null);
    return { reports };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'fetch failed' };
  }
}

export async function insertRemoteBlock(
  client: ModerationClient | null,
  blockerId: string,
  blockedId: string,
): Promise<{ error: string | null }> {
  if (!client) return { error: 'not_configured' };
  if (!isPersistedUserId(blockerId) || !isPersistedUserId(blockedId) || blockerId === blockedId) {
    return { error: 'bad_identity' };
  }
  try {
    const { error } = await client.from('user_blocks').insert(blockToRemote(blockerId, blockedId));
    if (error?.message && /duplicate|unique/i.test(error.message)) return { error: null };
    return { error: error?.message ?? null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'insert failed' };
  }
}

export async function deleteRemoteBlock(
  client: ModerationClient | null,
  blockerId: string,
  blockedId: string,
): Promise<{ error: string | null }> {
  if (!client) return { error: 'not_configured' };
  try {
    const { error } = await client.from('user_blocks').delete().eq('blocker_id', blockerId).eq('blocked_id', blockedId);
    return { error: error?.message ?? null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'delete failed' };
  }
}

export async function insertRemoteReport(
  client: ModerationClient | null,
  input: ReportInput & { id: string; createdAt: string },
): Promise<{ error: string | null }> {
  if (!client) return { error: 'not_configured' };
  const reason = normalizeReportReason(input.reason);
  if (!reason) return { error: 'bad_reason' };
  try {
    const { error } = await client.from('user_reports').insert(
      reportToRemote({
        id: input.id,
        reporterId: input.reporterId,
        targetType: input.targetType,
        targetId: input.targetId,
        targetUserId: input.targetUserId,
        reason,
        createdAt: input.createdAt,
      }),
    );
    if (error?.message && /duplicate|unique/i.test(error.message)) return { error: null };
    return { error: error?.message ?? null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'insert failed' };
  }
}

export async function syncRemoteModeration(
  userId: string,
): Promise<{ blocks: string[]; reports: UserReport[] } | { error: string }> {
  const client = asModerationClient(getSupabaseClient());
  const [blocks, reports] = await Promise.all([
    fetchRemoteBlocks(client, userId),
    fetchRemoteReports(client, userId),
  ]);
  if ('error' in blocks) return blocks;
  if ('error' in reports) return reports;
  return { blocks: blocks.ids, reports: reports.reports };
}

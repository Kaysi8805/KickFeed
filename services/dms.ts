import type { DirectMessage } from '@/data/types';
import { isPersistedUserId } from '@/lib/userIdentity';
import { normalizeDmText, parseDirectMessage } from '@/lib/dms';
import { getSupabaseClient } from '@/services/supabase';

export type DmRowError = { message: string };

/** Minimal supabase-js surface for DMs — easy to mock in CI. */
export type DmsClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => Promise<{ data: Record<string, unknown>[] | null; error: DmRowError | null }>;
    };
    insert: (row: Record<string, unknown>) => Promise<{ error: DmRowError | null }>;
  };
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function parseRemoteDirectMessage(value: unknown): DirectMessage | null {
  if (!isPlainObject(value)) return null;
  return parseDirectMessage({
    id: asString(value.id),
    senderId: asString(value.sender_id),
    recipientId: asString(value.recipient_id),
    text: asString(value.body) ?? asString(value.text),
    createdAt: asString(value.created_at),
  });
}

export function dmToRemote(row: DirectMessage): Record<string, unknown> {
  return {
    id: row.id,
    sender_id: row.senderId,
    recipient_id: row.recipientId,
    body: row.text,
    created_at: row.createdAt,
  };
}

export function asDmsClient(client: { from: (table: string) => unknown } | null): DmsClient | null {
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
      };
    },
  };
}

function uniqueMessages(rows: DirectMessage[]): DirectMessage[] {
  const byId = new Map<string, DirectMessage>();
  for (const row of rows) byId.set(row.id, row);
  return [...byId.values()].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}

export async function fetchRemoteDirectMessages(
  client: DmsClient | null,
  userId: string,
): Promise<{ messages: DirectMessage[] } | { error: string }> {
  if (!client) return { error: 'not_configured' };
  if (!isPersistedUserId(userId)) return { error: 'bad_identity' };
  try {
    const columns = 'id,sender_id,recipient_id,body,created_at';
    const [sent, received] = await Promise.all([
      client.from('direct_messages').select(columns).eq('sender_id', userId),
      client.from('direct_messages').select(columns).eq('recipient_id', userId),
    ]);
    if (sent.error) return { error: sent.error.message };
    if (received.error) return { error: received.error.message };
    const messages = uniqueMessages(
      [...(sent.data ?? []), ...(received.data ?? [])]
        .map(parseRemoteDirectMessage)
        .filter((row): row is DirectMessage => row != null)
        .filter((row) => row.senderId === userId || row.recipientId === userId),
    );
    return { messages };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'fetch failed' };
  }
}

export async function insertRemoteDirectMessage(
  client: DmsClient | null,
  row: DirectMessage,
): Promise<{ error: string | null }> {
  if (!client) return { error: 'not_configured' };
  const text = normalizeDmText(row.text);
  if (!text) return { error: 'bad_body' };
  if (!isPersistedUserId(row.senderId) || !isPersistedUserId(row.recipientId) || row.senderId === row.recipientId) {
    return { error: 'bad_identity' };
  }
  try {
    const { error } = await client.from('direct_messages').insert(dmToRemote({ ...row, text }));
    if (error?.message && /duplicate|unique/i.test(error.message)) return { error: null };
    if (error?.message && /slow_mode/i.test(error.message)) return { error: 'slow_mode' };
    return { error: error?.message ?? null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'insert failed' };
  }
}

export async function syncRemoteDirectMessages(
  userId: string,
): Promise<{ messages: DirectMessage[] } | { error: string }> {
  return fetchRemoteDirectMessages(asDmsClient(getSupabaseClient()), userId);
}

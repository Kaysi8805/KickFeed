import type { DirectMessage, DmGroup, GroupMessage } from '@/data/types';
import { normalizeDmText, parseDirectMessage } from '@/lib/dms';
import { isGroupId, parseDmGroup, parseGroupMessage } from '@/lib/groups';
import { isPersistedUserId } from '@/lib/userIdentity';
import { getSupabaseClient } from '@/services/supabase';

export type DmRowError = { message: string };

type QueryResult = { data: Record<string, unknown>[] | null; error: DmRowError | null };

/** Minimal supabase-js surface for DMs and group chats — easy to mock in CI. */
export type DmsClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => Promise<QueryResult>;
      in: (column: string, values: string[]) => Promise<QueryResult>;
    };
    insert: (row: Record<string, unknown> | Record<string, unknown>[]) => Promise<{ error: DmRowError | null }>;
    delete: () => {
      eq: (column: string, value: string) => {
        eq: (column2: string, value2: string) => Promise<{ error: DmRowError | null }>;
      };
    };
  };
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: DmRowError | null }>;
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
    share: value.share,
    tape: value.tape,
  });
}

/** Insert payload. Omit created_at so Postgres default + insert trigger stamp now(). */
export function dmToRemote(row: DirectMessage): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    id: row.id,
    sender_id: row.senderId,
    recipient_id: row.recipientId,
    body: row.text,
  };
  if (row.share) payload.share = row.share;
  if (row.tape) payload.tape = row.tape;
  return payload;
}

export function groupMessageToRemote(row: GroupMessage): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    id: row.id,
    group_id: row.groupId,
    sender_id: row.senderId,
    body: row.text,
  };
  if (row.share) payload.share = row.share;
  if (row.tape) payload.tape = row.tape;
  return payload;
}

export function parseRemoteGroupMessage(value: unknown): GroupMessage | null {
  if (!isPlainObject(value)) return null;
  if (asString(value.recipient_id)) return null;
  return parseGroupMessage({
    id: asString(value.id),
    groupId: asString(value.group_id),
    senderId: asString(value.sender_id),
    text: asString(value.body) ?? asString(value.text),
    createdAt: asString(value.created_at),
    share: value.share,
    tape: value.tape,
  });
}

export function asDmsClient(
  client: {
    from: (table: string) => unknown;
    rpc?: (
      fn: string,
      args?: Record<string, unknown>,
    ) => PromiseLike<{ error: { message: string } | null }>;
  } | null,
): DmsClient | null {
  if (!client) return null;
  return {
    from: (table: string) => {
      const query = client.from(table) as {
        select: (columns: string) => {
          eq: (
            column: string,
            value: string,
          ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
          in: (
            column: string,
            values: string[],
          ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
        };
        insert: (
          row: Record<string, unknown> | Record<string, unknown>[],
        ) => PromiseLike<{ error: { message: string } | null }>;
        delete: () => {
          eq: (column: string, value: string) => {
            eq: (column2: string, value2: string) => PromiseLike<{ error: { message: string } | null }>;
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
          in: async (column: string, values: string[]) => {
            if (values.length === 0) return { data: [], error: null };
            const { data, error } = await query.select(columns).in(column, values);
            return {
              data: Array.isArray(data) ? (data as Record<string, unknown>[]) : null,
              error: error ? { message: error.message } : null,
            };
          },
        }),
        insert: async (row: Record<string, unknown> | Record<string, unknown>[]) => {
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
    rpc: async (fn: string, args: Record<string, unknown>) => {
      if (!client.rpc) return { error: { message: 'not_configured' } };
      const { error } = await client.rpc(fn, args);
      return { error: error ? { message: error.message } : null };
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
    const columns = 'id,sender_id,recipient_id,body,created_at,share,tape';
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

function remoteWriteError(message: string | undefined): string | null {
  if (!message) return null;
  if (/duplicate|unique/i.test(message)) return null;
  if (/slow_mode/i.test(message)) return 'slow_mode';
  return message;
}

function assembleGroups(
  groupRows: Record<string, unknown>[],
  memberRows: Record<string, unknown>[],
): DmGroup[] {
  const members = new Map<string, string[]>();
  for (const row of memberRows) {
    const groupId = asString(row.group_id);
    const userId = asString(row.user_id);
    if (!groupId || !userId) continue;
    const list = members.get(groupId) ?? [];
    list.push(userId);
    members.set(groupId, list);
  }
  const groups: DmGroup[] = [];
  for (const row of groupRows) {
    const id = asString(row.id);
    if (!id) continue;
    const parsed = parseDmGroup({
      id,
      title: row.title ?? null,
      createdBy: asString(row.created_by),
      memberIds: members.get(id) ?? [],
      createdAt: asString(row.created_at),
    });
    if (parsed) groups.push(parsed);
  }
  return groups;
}

export async function fetchRemoteGroupChats(
  client: DmsClient | null,
  userId: string,
): Promise<{ groups: DmGroup[]; messages: GroupMessage[] } | { error: string }> {
  if (!client) return { error: 'not_configured' };
  if (!isPersistedUserId(userId)) return { error: 'bad_identity' };
  try {
    const mine = await client.from('dm_group_members').select('group_id,user_id').eq('user_id', userId);
    if (mine.error) return { error: mine.error.message };
    const groupIds = [
      ...new Set(
        (mine.data ?? [])
          .map((row) => asString(row.group_id))
          .filter((id): id is string => !!id && isGroupId(id)),
      ),
    ];
    if (groupIds.length === 0) return { groups: [], messages: [] };
    const [members, groups, messages] = await Promise.all([
      client.from('dm_group_members').select('group_id,user_id').in('group_id', groupIds),
      client.from('dm_groups').select('id,title,created_by,created_at').in('id', groupIds),
      client
        .from('direct_messages')
        .select('id,group_id,sender_id,recipient_id,body,created_at,share,tape')
        .in('group_id', groupIds),
    ]);
    if (members.error) return { error: members.error.message };
    if (groups.error) return { error: groups.error.message };
    if (messages.error) return { error: messages.error.message };
    return {
      groups: assembleGroups(groups.data ?? [], members.data ?? []).filter((group) =>
        group.memberIds.includes(userId),
      ),
      messages: (messages.data ?? [])
        .map(parseRemoteGroupMessage)
        .filter((row): row is GroupMessage => row != null)
        .filter((row) => groupIds.includes(row.groupId)),
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'fetch failed' };
  }
}

export async function insertRemoteDmGroup(
  client: DmsClient | null,
  group: DmGroup,
): Promise<{ error: string | null }> {
  if (!client) return { error: 'not_configured' };
  if (!isGroupId(group.id) || !isPersistedUserId(group.createdBy)) return { error: 'bad_identity' };
  if (!group.memberIds.includes(group.createdBy) || group.memberIds.length < 3) return { error: 'bad_members' };
  try {
    // One RPC. Postgres rolls the group row back if any member insert fails.
    const { error } = await client.rpc('kickfeed_create_dm_group', {
      p_id: group.id,
      p_title: group.title,
      p_member_ids: group.memberIds,
    });
    return { error: remoteWriteError(error?.message) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'insert failed' };
  }
}

export async function insertRemoteGroupMessage(
  client: DmsClient | null,
  row: GroupMessage,
): Promise<{ error: string | null }> {
  if (!client) return { error: 'not_configured' };
  const text = normalizeDmText(row.text);
  if (!text) return { error: 'bad_body' };
  if (!isGroupId(row.groupId) || !isPersistedUserId(row.senderId)) return { error: 'bad_identity' };
  try {
    const { error } = await client.from('direct_messages').insert(groupMessageToRemote({ ...row, text }));
    return { error: remoteWriteError(error?.message) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'insert failed' };
  }
}

export async function deleteRemoteGroupMember(
  client: DmsClient | null,
  groupId: string,
  userId: string,
): Promise<{ error: string | null }> {
  if (!client) return { error: 'not_configured' };
  if (!isGroupId(groupId) || !isPersistedUserId(userId)) return { error: 'bad_identity' };
  try {
    const { error } = await client.from('dm_group_members').delete().eq('group_id', groupId).eq('user_id', userId);
    return { error: remoteWriteError(error?.message) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'delete failed' };
  }
}

export async function syncRemoteGroupChats(
  userId: string,
): Promise<{ groups: DmGroup[]; messages: GroupMessage[] } | { error: string }> {
  return fetchRemoteGroupChats(asDmsClient(getSupabaseClient()), userId);
}

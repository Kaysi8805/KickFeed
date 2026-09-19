import { describe, expect, it } from 'vitest';

import {
  asDmsClient,
  fetchRemoteDirectMessages,
  insertRemoteDirectMessage,
  parseRemoteDirectMessage,
} from '@/services/dms';

const UUID = '66666666-6666-4666-8666-666666666666';

describe('remote dm rows', () => {
  it('maps snake_case postgres rows onto KickFeed identity keys', () => {
    const row = parseRemoteDirectMessage({
      id: 'dm-1',
      sender_id: UUID,
      recipient_id: 'omar',
      body: 'Clásico night?',
      created_at: '2026-09-19T12:00:00.000Z',
    });
    expect(row).toMatchObject({ senderId: UUID, recipientId: 'omar', text: 'Clásico night?' });
    expect(parseRemoteDirectMessage({ sender_id: UUID, recipient_id: UUID, body: 'nope', created_at: '2026-09-19T12:00:00.000Z' })).toBeNull();
    expect(parseRemoteDirectMessage({ sender_id: 'ghost', recipient_id: 'omar', body: 'hi', created_at: '2026-09-19T12:00:00.000Z' })).toBeNull();
  });

  it('lists sent+received and writes through the tiny client wrapper', async () => {
    expect(asDmsClient(null)).toBeNull();
    const missing = await fetchRemoteDirectMessages(null, UUID);
    expect(missing).toEqual({ error: 'not_configured' });

    const tables: Record<string, Record<string, unknown>[]> = {
      direct_messages: [
        { id: 'dm-s', sender_id: UUID, recipient_id: 'omar', body: 'sent', created_at: '2026-09-19T12:00:00.000Z' },
        { id: 'dm-r', sender_id: 'omar', recipient_id: UUID, body: 'back', created_at: '2026-09-19T12:01:00.000Z' },
      ],
    };
    const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];
    const client = asDmsClient({
      from: (table: string) => ({
        select: () => ({
          eq: async (column: string, value: string) => ({
            data: (tables[table] ?? []).filter((row) => row[column] === value),
            error: null,
          }),
        }),
        insert: async (row: Record<string, unknown>) => {
          inserts.push({ table, row });
          return { error: null };
        },
      }),
    });

    const fetched = await fetchRemoteDirectMessages(client, UUID);
    expect('error' in fetched).toBe(false);
    if ('error' in fetched) return;
    expect(fetched.messages.map((row) => row.id)).toEqual(['dm-s', 'dm-r']);

    const saved = await insertRemoteDirectMessage(client, {
      id: 'dm-9',
      senderId: UUID,
      recipientId: 'jordan',
      text: 'YNWA',
      createdAt: '2026-09-19T12:02:00.000Z',
    });
    expect(saved.error).toBeNull();
    expect(inserts[0]).toMatchObject({
      table: 'direct_messages',
      row: { sender_id: UUID, recipient_id: 'jordan', body: 'YNWA' },
    });
  });

  it('treats unique violations as already-saved and maps slow_mode', async () => {
    const dup = asDmsClient({
      from: () => ({
        select: () => ({ eq: async () => ({ data: [], error: null }) }),
        insert: async () => ({ error: { message: 'duplicate key value violates unique constraint' } }),
      }),
    });
    expect(
      (
        await insertRemoteDirectMessage(dup, {
          id: 'dm-9',
          senderId: UUID,
          recipientId: 'omar',
          text: 'hi',
          createdAt: '2026-09-19T12:00:00.000Z',
        })
      ).error,
    ).toBeNull();

    const slow = asDmsClient({
      from: () => ({
        select: () => ({ eq: async () => ({ data: [], error: null }) }),
        insert: async () => ({ error: { message: 'slow_mode' } }),
      }),
    });
    expect(
      (
        await insertRemoteDirectMessage(slow, {
          id: 'dm-10',
          senderId: UUID,
          recipientId: 'omar',
          text: 'too fast',
          createdAt: '2026-09-19T12:00:00.000Z',
        })
      ).error,
    ).toBe('slow_mode');
  });
});

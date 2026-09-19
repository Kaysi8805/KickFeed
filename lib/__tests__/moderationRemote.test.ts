import { describe, expect, it } from 'vitest';

import {
  asModerationClient,
  fetchRemoteBlocks,
  fetchRemoteIncomingBlocks,
  insertRemoteBlock,
  insertRemoteReport,
  parseRemoteBlock,
  parseRemoteReport,
} from '@/services/moderation';

const UUID = '66666666-6666-4666-8666-666666666666';

describe('remote moderation rows', () => {
  it('maps snake_case postgres rows onto KickFeed identity keys', () => {
    const block = parseRemoteBlock({
      blocker_id: UUID,
      blocked_id: 'omar',
      created_at: '2026-09-18T18:00:00.000Z',
    });
    expect(block).toMatchObject({ blockerId: UUID, blockedId: 'omar' });
    expect(parseRemoteBlock({ blocker_id: UUID, blocked_id: UUID })).toBeNull();
    expect(parseRemoteBlock({ blocker_id: 'ghost', blocked_id: 'omar' })).toBeNull();

    const report = parseRemoteReport({
      id: 'r-1',
      reporter_id: UUID,
      target_type: 'post',
      target_id: 'p1',
      target_user_id: 'jordan',
      reason: 'Spam or scam',
      created_at: '2026-09-18T18:00:00.000Z',
    });
    expect(report).toMatchObject({ reporterId: UUID, targetType: 'post', targetUserId: 'jordan' });
    expect(parseRemoteReport({ reporter_id: UUID, target_type: 'post', target_id: 'p1', target_user_id: UUID, reason: 'x' })).toBeNull();
  });

  it('lists and writes through the tiny client wrapper', async () => {
    expect(asModerationClient(null)).toBeNull();
    const missing = await fetchRemoteBlocks(null, UUID);
    expect(missing).toEqual({ error: 'not_configured' });

    const tables: Record<string, Record<string, unknown>[]> = {
      user_blocks: [
        { blocker_id: UUID, blocked_id: 'omar', created_at: '2026-09-18T18:00:00.000Z' },
        { blocker_id: 'jordan', blocked_id: UUID, created_at: '2026-09-18T18:00:00.000Z' },
      ],
      user_reports: [],
    };
    const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];
    const client = asModerationClient({
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
        delete: () => ({
          eq: () => ({
            eq: async () => ({ error: null }),
          }),
        }),
      }),
    });

    const blocks = await fetchRemoteBlocks(client, UUID);
    expect('error' in blocks).toBe(false);
    if ('error' in blocks) return;
    expect(blocks.ids).toEqual(['omar']);

    const incoming = await fetchRemoteIncomingBlocks(client, UUID);
    expect('error' in incoming).toBe(false);
    if ('error' in incoming) return;
    expect(incoming.ids).toEqual(['jordan']);

    const savedBlock = await insertRemoteBlock(client, UUID, 'jordan');
    expect(savedBlock.error).toBeNull();
    expect(inserts[0]).toMatchObject({
      table: 'user_blocks',
      row: { blocker_id: UUID, blocked_id: 'jordan' },
    });

    const savedReport = await insertRemoteReport(client, {
      id: 'r-9',
      reporterId: UUID,
      targetType: 'comment',
      targetId: 'c1',
      targetUserId: 'jordan',
      reason: 'Harassment or hate',
      createdAt: '2026-09-18T18:00:00.000Z',
    });
    expect(savedReport.error).toBeNull();
    expect(inserts[1]?.row).toMatchObject({
      reporter_id: UUID,
      target_type: 'comment',
      target_id: 'c1',
    });
  });

  it('treats unique violations as already-saved, not a hard error', async () => {
    const client = asModerationClient({
      from: () => ({
        select: () => ({
          eq: async () => ({ data: [], error: null }),
        }),
        insert: async () => ({ error: { message: 'duplicate key value violates unique constraint' } }),
        delete: () => ({
          eq: () => ({
            eq: async () => ({ error: null }),
          }),
        }),
      }),
    });
    expect((await insertRemoteBlock(client, UUID, 'omar')).error).toBeNull();
  });
});

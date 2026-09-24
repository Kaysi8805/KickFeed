import { readFileSync } from 'node:fs';

import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const THREAD = `${A}::${B}`;
const GROUP = 'grp-testtape1-ab';

async function database(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(`
    create schema if not exists auth;
    create or replace function auth.uid() returns uuid
    language sql stable as $$
      select nullif(current_setting('kickfeed.uid', true), '')::uuid
    $$;
    create or replace function auth.role() returns text
    language sql stable as $$
      select nullif(current_setting('kickfeed.role', true), '')
    $$;
    do $$ begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
    end $$;
    create table public.user_blocks (
      blocker_id text not null,
      blocked_id text not null,
      primary key (blocker_id, blocked_id)
    );
    create table public.user_reports (
      id text primary key,
      reporter_id text not null,
      target_type text not null,
      target_id text not null,
      target_user_id text not null,
      reason text not null,
      constraint user_reports_target_type_check check (target_type in ('post', 'profile', 'comment'))
    );
    grant usage on schema public to anon, authenticated, service_role;
    grant select, insert, delete on public.user_blocks to authenticated;
  `);
  const root = new URL('../../supabase/migrations/', import.meta.url);
  for (const file of [
    '20260919120000_direct_messages.sql',
    '20260919133000_dm_stamp_created_at.sql',
    '20260923120000_dm_groups.sql',
    '20260924180000_match_tape.sql',
  ]) {
    await db.exec(readFileSync(new URL(file, root), 'utf8'));
  }
  return db;
}

async function asUser(db: PGlite, id: string) {
  await db.query(`select set_config('kickfeed.uid', $1, false)`, [id]);
  await db.query(`select set_config('kickfeed.role', 'authenticated', false)`);
}

async function attach(db: PGlite, id: string, kind: string, thread: string, matchId: string) {
  await db.query(
    `select public.kickfeed_attach_match_tape($1, $2, $3, $4, 'Liverpool', 'Arsenal', 'LIV', 'ARS', null)`,
    [id, kind, thread, matchId],
  );
}

describe('match tape in postgres', () => {
  it('lets the pair read a tape, hides it from a stranger, and allows one active row', async () => {
    const db = await database();
    await asUser(db, A);
    await attach(db, 'tape-a', 'dm', THREAD, 'fx-liv-ars');
    await expect(attach(db, 'tape-b', 'dm', THREAD, '9001')).rejects.toThrow(/tape_active/);

    await db.exec(`set role authenticated`);
    await asUser(db, A);
    const seen = await db.query<{ match_id: string }>(`select match_id from public.match_tape_attachments`);
    expect(seen.rows.map((row) => row.match_id)).toEqual(['fx-liv-ars']);

    await asUser(db, C);
    const hidden = await db.query(`select id from public.match_tape_attachments`);
    expect(hidden.rows).toEqual([]);

    await db.exec(`reset role`);
    await asUser(db, C);
    await expect(attach(db, 'tape-c', 'dm', THREAD, 'fx-liv-ars')).rejects.toThrow(/not_member/);
  });

  it('anchors a message to the active match, then locks the thread after archive', async () => {
    const db = await database();
    await asUser(db, A);
    await attach(db, 'tape-live', 'dm', THREAD, 'fx-liv-ars');
    await db.exec(`set role authenticated`);
    await asUser(db, A);
    await db.query(
      `insert into public.direct_messages (id, sender_id, recipient_id, body, tape)
       values ('dm-1', $1, $2, 'What a hit', $3::jsonb)`,
      [
        A,
        B,
        JSON.stringify({
          matchId: 'fx-liv-ars',
          eventKey: 'e67',
          minute: 67,
          eventType: 'goal',
          label: "67' Salah goal",
        }),
      ],
    );
    const stored = await db.query<{ event_key: string }>(
      `select tape->>'eventKey' as event_key from public.direct_messages where id = 'dm-1'`,
    );
    expect(stored.rows[0]?.event_key).toBe('e67');

    await db.exec(`reset role`);
    await asUser(db, B);
    await db.query(`select public.kickfeed_archive_match_tape('tape-live', 2, 1, 90, 'finished')`);
    await db.exec(`set role authenticated`);
    await asUser(db, A);
    await expect(
      db.query(`insert into public.direct_messages (id, sender_id, recipient_id, body) values ('dm-2', $1, $2, 'Late')`, [
        A,
        B,
      ]),
    ).rejects.toThrow(/tape_locked/);

    await db.exec(`reset role`);
    await asUser(db, A);
    await attach(db, 'tape-next', 'dm', THREAD, '9001');
    const active = await db.query<{ id: string }>(
      `select id from public.match_tape_attachments where status = 'active'`,
    );
    expect(active.rows.map((row) => row.id)).toEqual(['tape-next']);
  });

  it('refuses an anchor for another match and a caption over 160 characters', async () => {
    const db = await database();
    await asUser(db, A);
    await attach(db, 'tape-live', 'dm', THREAD, 'fx-liv-ars');
    await db.exec(`set role authenticated`);
    await asUser(db, A);
    await expect(
      db.query(
        `insert into public.direct_messages (id, sender_id, recipient_id, body, tape)
         values ('dm-wrong', $1, $2, 'Nope', $3::jsonb)`,
        [
          A,
          B,
          JSON.stringify({
            matchId: '9001',
            eventKey: 'e1',
            minute: 10,
            eventType: 'yellow',
            label: "10' card",
          }),
        ],
      ),
    ).rejects.toThrow(/tape_anchor/);
    await expect(
      db.query(
        `insert into public.direct_messages (id, sender_id, recipient_id, body, tape)
         values ('dm-long', $1, $2, $3, $4::jsonb)`,
        [
          A,
          B,
          'x'.repeat(161),
          JSON.stringify({
            matchId: 'fx-liv-ars',
            eventKey: 'e67',
            minute: 67,
            eventType: 'goal',
            label: "67' Salah goal",
          }),
        ],
      ),
    ).rejects.toThrow(/tape_caption/);
  });

  it('lets a group member attach and hides the tape from someone outside the group', async () => {
    const db = await database();
    await asUser(db, A);
    await db.query(`select public.kickfeed_create_dm_group($1, 'Derby', $2::text[])`, [GROUP, [A, B, C]]);
    await attach(db, 'tape-group', 'group', GROUP, 'fx-liv-ars');
    await db.exec(`set role authenticated`);
    await asUser(db, B);
    const seen = await db.query<{ kind: string }>(`select kind from public.match_tape_attachments`);
    expect(seen.rows.map((row) => row.kind)).toEqual(['group']);

    const outsider = '44444444-4444-4444-8444-444444444444';
    await db.exec(`reset role`);
    await asUser(db, outsider);
    await expect(attach(db, 'tape-out', 'group', GROUP, 'fx-liv-ars')).rejects.toThrow(/not_member/);
    await db.exec(`set role authenticated`);
    await asUser(db, outsider);
    const hidden = await db.query(`select id from public.match_tape_attachments`);
    expect(hidden.rows).toEqual([]);
  });
});

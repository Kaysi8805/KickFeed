import { readFileSync } from 'node:fs';

import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const TOKEN = 'ExponentPushToken[aaaaaaaaaaaa]';

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
    create table public.push_devices (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null,
      expo_push_token text not null,
      platform text not null,
      enabled boolean not null default true,
      kickoff boolean not null default true,
      goals boolean not null default true,
      favorite_team_ids text[] not null default '{}'
    );
    grant usage on schema public to authenticated;
  `);
  const sql = readFileSync(new URL('../../supabase/migrations/20260923210000_live_circle.sql', import.meta.url), 'utf8');
  await db.exec(sql);
  return db;
}

async function asUser(db: PGlite, id: string) {
  await db.query(`select set_config('kickfeed.uid', $1, false)`, [id]);
  await db.query(`select set_config('kickfeed.role', 'authenticated', false)`);
}

describe('live circle in postgres', () => {
  it('shows a mutual opted-in friend and hides strangers, blocks, idle rows, and opted-out fans', async () => {
    const db = await database();
    await asUser(db, A);
    await db.query(`select public.kickfeed_set_live_circle(true)`);
    await db.query(`select public.kickfeed_sync_follows($1::text[])`, [[B, C]]);
    await asUser(db, B);
    await db.query(`select public.kickfeed_set_live_circle(true)`);
    await db.query(`select public.kickfeed_sync_follows($1::text[])`, [[A]]);
    const started = await db.query<{ kickfeed_touch_live_circle: boolean }>(
      `select public.kickfeed_touch_live_circle('9001', 'Omar', 'omar', 'OM', '#22C55E') as kickfeed_touch_live_circle`,
    );
    expect(started.rows[0]?.kickfeed_touch_live_circle).toBe(true);
    const again = await db.query<{ kickfeed_touch_live_circle: boolean }>(
      `select public.kickfeed_touch_live_circle('9001', 'Omar', 'omar', 'OM', '#22C55E') as kickfeed_touch_live_circle`,
    );
    expect(again.rows[0]?.kickfeed_touch_live_circle).toBe(false);

    await asUser(db, C);
    await db.query(`select public.kickfeed_set_live_circle(true)`);
    await db.query(`select public.kickfeed_touch_live_circle('9001', 'Casey', 'casey', 'CA', '#3B82F6')`);

    await db.exec(`set role authenticated`);
    await asUser(db, A);
    const seen = await db.query<{ user_id: string }>(`select user_id from public.live_circle_presence order by user_id`);
    expect(seen.rows.map((row) => row.user_id)).toEqual([B]);

    await db.exec(`reset role`);
    await asUser(db, A);
    await db.query(`insert into public.user_blocks (blocker_id, blocked_id) values ('${A}', '${B}')`);
    await db.exec(`set role authenticated`);
    const blocked = await db.query(`select user_id from public.live_circle_presence`);
    expect(blocked.rows).toEqual([]);

    await db.exec(`reset role`);
    await db.query(`delete from public.user_blocks`);
    await db.query(`update public.live_circle_presence set heartbeat_at = now() - interval '6 minutes' where user_id = '${B}'`);
    await db.exec(`set role authenticated`);
    await asUser(db, A);
    const idle = await db.query(`select user_id from public.live_circle_presence`);
    expect(idle.rows).toEqual([]);

    await db.exec(`reset role`);
    await asUser(db, B);
    await db.query(`select public.kickfeed_set_live_circle(false)`);
    const gone = await db.query(`select user_id from public.live_circle_presence where user_id = '${B}'`);
    expect(gone.rows).toEqual([]);
    await expect(db.query(`select public.kickfeed_touch_live_circle('9001', 'Omar', 'omar', 'OM', '#22C55E')`)).rejects.toThrow(
      /opted_out/,
    );
  });

  it('claims one favorited push and refuses a second claim inside the debounce window', async () => {
    const db = await database();
    await asUser(db, A);
    await db.query(`select public.kickfeed_set_live_circle(true)`);
    await db.query(`select public.kickfeed_sync_follows($1::text[])`, [[B]]);
    await db.query(`select public.kickfeed_touch_live_circle('9001', 'Maya', 'maya', 'MA', '#22C55E')`);
    await asUser(db, B);
    await db.query(`select public.kickfeed_set_live_circle(true)`);
    await db.query(`select public.kickfeed_sync_follows($1::text[])`, [[A]]);
    await db.query(`insert into public.push_devices (user_id, expo_push_token, platform, enabled, favorite_team_ids) values ('${B}', '${TOKEN}', 'ios', true, '{ars,tot}')`);

    await db.query(`select set_config('kickfeed.role', 'authenticated', false)`);
    await expect(
      db.query(`select * from public.kickfeed_claim_live_circle_pushes('${A}', '9001', 'ars', 'tot')`),
    ).rejects.toThrow(/forbidden/);

    await db.query(`select set_config('kickfeed.role', 'service_role', false)`);
    const first = await db.query<{ recipient_id: string; expo_push_token: string }>(
      `select * from public.kickfeed_claim_live_circle_pushes('${A}', '9001', 'ars', 'tot')`,
    );
    expect(first.rows).toEqual([{ recipient_id: B, expo_push_token: TOKEN }]);
    const second = await db.query(
      `select * from public.kickfeed_claim_live_circle_pushes('${A}', '9001', 'ars', 'tot')`,
    );
    expect(second.rows).toEqual([]);

    await db.query(`update public.live_circle_notices set sent_at = now() - interval '31 minutes'`);
    await asUser(db, B);
    await db.query(`select public.kickfeed_touch_live_circle('9001', 'Omar', 'omar', 'OM', '#22C55E')`);
    await db.query(`select set_config('kickfeed.role', 'service_role', false)`);
    const viewing = await db.query(
      `select * from public.kickfeed_claim_live_circle_pushes('${A}', '9001', 'ars', 'tot')`,
    );
    expect(viewing.rows).toEqual([]);
  });
});

import { readFileSync } from 'node:fs';

import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';

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
    create table public.user_follows (
      follower_id text not null,
      followee_id text not null,
      primary key (follower_id, followee_id)
    );
    create table public.predictions (
      match_id text not null,
      user_id text not null,
      home_score int not null,
      away_score int not null,
      primary key (match_id, user_id)
    );
    create table public.user_reports (
      id text primary key,
      reporter_id text not null,
      target_type text not null check (target_type in ('post', 'profile', 'comment', 'dm')),
      target_id text not null,
      target_user_id text not null,
      reason text not null
    );
    grant usage on schema public to authenticated;
  `);
  const sql = readFileSync(new URL('../../supabase/migrations/20260924120000_rivalry_bonds.sql', import.meta.url), 'utf8');
  await db.exec(sql);
  return db;
}

async function asUser(db: PGlite, id: string) {
  await db.query(`select set_config('kickfeed.uid', $1, false)`, [id]);
  await db.query(`select set_config('kickfeed.role', 'authenticated', false)`);
}

async function declare(db: PGlite, id: string, clubId: string, name: string) {
  await asUser(db, id);
  await db.query(`select public.kickfeed_set_rivalry_club($1, $2, $3, null, '#EF0107', '#FFFFFF')`, [clubId, name, clubId]);
}

describe('rivalry bond in postgres', () => {
  it('labels July as the new European season', async () => {
    const db = await database();
    const july = await db.query<{ rivalry_season: string }>(
      `select private.rivalry_season('2026-07-01T00:00:00Z'::timestamptz) as rivalry_season`,
    );
    const june = await db.query<{ rivalry_season: string }>(
      `select private.rivalry_season('2026-06-30T12:00:00Z'::timestamptz) as rivalry_season`,
    );
    expect(july.rows[0]?.rivalry_season).toBe('2026/27');
    expect(june.rows[0]?.rivalry_season).toBe('2025/26');
  });

  it('rejects same club, one-way follows, and blocks, then scores a head-to-head and a prediction once', async () => {
    const db = await database();
    await declare(db, A, 'ars', 'Arsenal');
    await declare(db, B, 'ars', 'Arsenal');
    await db.query(`insert into public.user_follows (follower_id, followee_id) values ('${A}', '${B}'), ('${B}', '${A}')`);
    await asUser(db, A);
    await expect(db.query(`select public.kickfeed_invite_rivalry('${B}')`)).rejects.toThrow(/same_club/);

    await declare(db, B, 'liv', 'Liverpool');
    await db.query(`delete from public.user_follows where follower_id = '${B}'`);
    await asUser(db, A);
    await expect(db.query(`select public.kickfeed_invite_rivalry('${B}')`)).rejects.toThrow(/not_friends/);
    await db.query(`insert into public.user_follows (follower_id, followee_id) values ('${B}', '${A}')`);
    await db.query(`insert into public.user_blocks (blocker_id, blocked_id) values ('${B}', '${A}')`);
    await expect(db.query(`select public.kickfeed_invite_rivalry('${B}')`)).rejects.toThrow(/blocked/);
    await db.query(`delete from public.user_blocks`);

    const invited = await db.query<{ kickfeed_invite_rivalry: string }>(
      `select public.kickfeed_invite_rivalry('${B}') as kickfeed_invite_rivalry`,
    );
    const bondId = invited.rows[0]?.kickfeed_invite_rivalry;
    expect(bondId).toBeTruthy();
    const ordered = await db.query<{ user_a: string; user_b: string; status: string }>(
      `select user_a, user_b, status from public.rivalry_bonds where id = '${bondId}'`,
    );
    expect(ordered.rows[0]).toMatchObject({ user_a: A, user_b: B, status: 'invite' });

    await asUser(db, A);
    await expect(db.query(`select public.kickfeed_respond_rivalry('${bondId}', true)`)).rejects.toThrow(/not_invite/);
    await asUser(db, B);
    await db.query(`select public.kickfeed_respond_rivalry('${bondId}', true)`);

    await db.query(
      `insert into public.predictions (match_id, user_id, home_score, away_score) values
        ('fx-liv-ars', '${A}', 2, 1),
        ('fx-liv-ars', '${B}', 1, 0),
        ('fx-other', '${A}', 0, 0),
        ('alias-1', '${B}', 0, 0)`,
    );
    const matches = JSON.stringify([
      {
        match_id: 'fx-liv-ars',
        alias_ids: [],
        home_team_id: 'ars',
        away_team_id: 'liv',
        home_alias_ids: [],
        away_alias_ids: [],
        home_score: 2,
        away_score: 1,
      },
      {
        match_id: 'fx-other',
        alias_ids: ['alias-1'],
        home_team_id: 'che',
        away_team_id: 'tot',
        home_alias_ids: [],
        away_alias_ids: [],
        home_score: 0,
        away_score: 0,
      },
    ]);
    const added = await db.query<{ kickfeed_sync_rivalry_ledger: number }>(
      `select public.kickfeed_sync_rivalry_ledger('${bondId}', $1::jsonb) as kickfeed_sync_rivalry_ledger`,
      [matches],
    );
    expect(added.rows[0]?.kickfeed_sync_rivalry_ledger).toBe(3);
    const again = await db.query<{ kickfeed_sync_rivalry_ledger: number }>(
      `select public.kickfeed_sync_rivalry_ledger('${bondId}', $1::jsonb) as kickfeed_sync_rivalry_ledger`,
      [matches],
    );
    expect(again.rows[0]?.kickfeed_sync_rivalry_ledger).toBe(0);
    const score = await db.query<{ points_a: number; points_b: number }>(
      `select points_a, points_b from public.rivalry_bonds where id = '${bondId}'`,
    );
    expect(score.rows[0]).toEqual({ points_a: 4, points_b: 0 });

    await db.exec(`set role authenticated`);
    await asUser(db, C);
    const hidden = await db.query(`select id from public.rivalry_bonds`);
    expect(hidden.rows).toEqual([]);
    const hiddenLedger = await db.query(`select id from public.rivalry_ledger`);
    expect(hiddenLedger.rows).toEqual([]);
    await expect(
      db.query(`insert into public.rivalry_ledger (bond_id, kind, body) values ('${bondId}', 'banter', 'nope')`),
    ).rejects.toThrow();

    await db.exec(`reset role`);
    await asUser(db, A);
    await db.query(`select public.kickfeed_post_rivalry_banter('${bondId}', '  See you Sunday  ')`);
    await expect(db.query(`select public.kickfeed_post_rivalry_banter('${bondId}', 'Again')`)).rejects.toThrow(/slow_mode/);
    await expect(db.query(`select public.kickfeed_post_rivalry_banter('${bondId}', '${'a'.repeat(161)}')`)).rejects.toThrow(/bad_banter/);
    await asUser(db, C);
    await expect(db.query(`select public.kickfeed_post_rivalry_banter('${bondId}', 'hello')`)).rejects.toThrow(/not_participant/);

    await db.exec(`set role authenticated`);
    await asUser(db, B);
    const seen = await db.query<{ body: string }>(
      `select body from public.rivalry_ledger where kind = 'banter'`,
    );
    expect(seen.rows.map((row) => row.body)).toEqual(['See you Sunday']);
  });
});

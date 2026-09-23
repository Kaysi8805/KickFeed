import { readFileSync } from 'node:fs';

import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';

const UID = '11111111-1111-4111-8111-111111111111';
const ROUND = 'Regular Season - 8';

function slots() {
  const positions = ['GK', 'DF', 'DF', 'DF', 'DF', 'MF', 'MF', 'MF', 'MF', 'FW', 'FW'];
  return positions.map((pos, index) => ({
    pos,
    playerId: `p${index + 1}`,
    playerName: `Player ${index + 1}`,
    teamId: `c${index % 4}`,
    number: index + 1,
  }));
}

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
  `);
  const base = readFileSync(new URL('../../supabase/migrations/20260923180000_fantasy_leagues.sql', import.meta.url), 'utf8');
  const follow = readFileSync(new URL('../../supabase/migrations/20260923193000_fantasy_server_deadline.sql', import.meta.url), 'utf8');
  await db.exec(base);
  await db.exec(follow);
  await db.exec(`
    insert into public.fantasy_leagues (id, name, invite_code, owner_id, competition_id, season)
    values ('fl_test', 'Office XI', 'OFF1CE', '${UID}', '39', 2026);
    insert into public.fantasy_members (league_id, user_id)
    values ('fl_test', '${UID}');
    select set_config('kickfeed.uid', '${UID}', false);
  `);
  return db;
}

async function sync(db: PGlite, deadlineAt: string) {
  await db.query(`select set_config('kickfeed.role', 'service_role', false)`);
  await db.query(
    `select public.kickfeed_sync_fantasy_round_deadlines($1, $2, $3::jsonb)`,
    ['39', 2026, JSON.stringify([{ roundId: ROUND, deadlineAt }])],
  );
}

async function expectRaises(db: PGlite, sql: string, code: string) {
  await expect(db.query(sql)).rejects.toThrow(new RegExp(code));
}

describe('fantasy pick deadline in postgres', () => {
  it('saves before the server deadline and rejects a later forged deadline', async () => {
    const db = await database();
    const future = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
    const farFuture = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
    const past = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const payload = JSON.stringify(slots());

    await sync(db, future);
    await db.query(`select set_config('kickfeed.role', 'authenticated', false)`);
    await db.query(`select public.kickfeed_upsert_fantasy_pick('fl_test', $1, $2::jsonb)`, [ROUND, payload]);
    const saved = await db.query<{ round_id: string }>(`select round_id from public.fantasy_picks`);
    expect(saved.rows).toHaveLength(1);

    await sync(db, farFuture);
    const stored = await db.query<{ deadline_at: Date }>(
      `select deadline_at from public.fantasy_round_deadlines where round_id = $1`,
      [ROUND],
    );
    expect(new Date(stored.rows[0].deadline_at).toISOString()).toBe(new Date(future).toISOString());

    await db.query(`select set_config('kickfeed.role', 'authenticated', false)`);
    await expectRaises(
      db,
      `select public.kickfeed_upsert_fantasy_pick('fl_test', '${ROUND}', '${payload}'::jsonb, '${farFuture}'::timestamptz)`,
      'does not exist|kickfeed_upsert_fantasy_pick',
    );

    await sync(db, past);
    await db.query(`select set_config('kickfeed.role', 'authenticated', false)`);
    await expectRaises(
      db,
      `select public.kickfeed_upsert_fantasy_pick('fl_test', '${ROUND}', '${payload}'::jsonb)`,
      'gameweek_locked',
    );

    await db.query(`select set_config('kickfeed.role', 'authenticated', false)`);
    await expectRaises(
      db,
      `select public.kickfeed_sync_fantasy_round_deadlines('39', 2026, '[{"roundId":"${ROUND}","deadlineAt":"${farFuture}"}]'::jsonb)`,
      'not_authorized',
    );

    await db.exec(`set role authenticated`);
    await expect(
      db.query(`update public.fantasy_round_deadlines set deadline_at = '2035-01-01'`),
    ).rejects.toThrow(/permission denied/i);
    await db.exec(`reset role`);
    const locked = await db.query<{ deadline_at: Date }>(
      `select deadline_at from public.fantasy_round_deadlines where round_id = $1`,
      [ROUND],
    );
    expect(new Date(locked.rows[0].deadline_at).getTime()).toBeLessThan(Date.now());

    const args = await db.query<{ identity: string }>(`
      select pg_get_function_identity_arguments(oid) as identity
      from pg_proc
      where proname = 'kickfeed_upsert_fantasy_pick'
    `);
    expect(args.rows.map((row) => row.identity)).toEqual(['p_league_id text, p_round_id text, p_slots jsonb']);
    await db.close();
  });
});

-- KickFeed private fantasy mini-leagues (v1).
-- Identity: user_id is auth.users uuid text. Demo ids never pass auth.uid(), so they stay on device.
-- One XI per fan per gameweek (Friday UTC), shared by every league they join.
-- Formation is fixed 4-4-2. Points are counted in the app from catalog goals — there is no scoreboard table.
-- Apply after 20260923140000_push_devices.sql.
--
-- Karol: run this file in the SQL editor. Safe to re-run (create or replace / drop policy if exists).
-- Clients call kickfeed_create_fantasy_league, kickfeed_join_fantasy_league, and
-- kickfeed_upsert_fantasy_pick. Direct inserts are revoked.

create table if not exists public.fantasy_leagues (
  id text primary key,
  name text not null,
  invite_code text not null,
  owner_id text not null,
  created_at timestamptz not null default now(),
  constraint fantasy_leagues_id_len check (char_length(id) between 4 and 80),
  constraint fantasy_leagues_name_len check (char_length(btrim(name)) between 2 and 40),
  constraint fantasy_leagues_code check (invite_code ~ '^[A-Z0-9]{6}$')
);

create unique index if not exists fantasy_leagues_invite_code_idx
  on public.fantasy_leagues (invite_code);

create table if not exists public.fantasy_members (
  league_id text not null references public.fantasy_leagues (id) on delete cascade,
  user_id text not null,
  joined_at timestamptz not null default now(),
  primary key (league_id, user_id)
);

create index if not exists fantasy_members_user_id_idx
  on public.fantasy_members (user_id);

create table if not exists public.fantasy_picks (
  user_id text not null,
  gameweek_id text not null,
  slots jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, gameweek_id),
  constraint fantasy_picks_gw check (gameweek_id ~ '^\d{4}-\d{2}-\d{2}$'),
  constraint fantasy_picks_slots_size check (
    jsonb_typeof(slots) = 'array'
    and jsonb_array_length(slots) = 11
    and char_length(slots::text) <= 4000
  )
);

alter table public.fantasy_leagues enable row level security;
alter table public.fantasy_members enable row level security;
alter table public.fantasy_picks enable row level security;

create schema if not exists private;

create or replace function private.fantasy_is_member(p_league text, p_user text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.fantasy_members m
    where m.league_id = p_league
      and m.user_id = p_user
  );
$$;

create or replace function private.fantasy_shares_league(p_viewer text, p_subject text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_viewer = p_subject
    or exists (
      select 1
      from public.fantasy_members mine
      join public.fantasy_members theirs
        on theirs.league_id = mine.league_id
      where mine.user_id = p_viewer
        and theirs.user_id = p_subject
    );
$$;

-- 1 GK, 4 DF, 4 MF, 2 FW, eleven distinct players. Mirrors lib/fantasy.ts.
create or replace function private.fantasy_slots_ok(p_slots jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  gk int;
  df int;
  mf int;
  fw int;
  distinct_ids int;
  bad int;
begin
  if p_slots is null or jsonb_typeof(p_slots) <> 'array' or jsonb_array_length(p_slots) <> 11 then
    return false;
  end if;
  if char_length(p_slots::text) > 4000 then
    return false;
  end if;

  select
    count(*) filter (where elem->>'pos' = 'GK'),
    count(*) filter (where elem->>'pos' = 'DF'),
    count(*) filter (where elem->>'pos' = 'MF'),
    count(*) filter (where elem->>'pos' = 'FW'),
    count(distinct elem->>'playerId'),
    count(*) filter (
      where coalesce(elem->>'playerId', '') = ''
        or char_length(elem->>'playerId') > 80
        or coalesce(elem->>'playerName', '') = ''
        or char_length(elem->>'playerName') > 80
        or coalesce(elem->>'teamId', '') = ''
        or char_length(elem->>'teamId') > 80
        or coalesce(elem->>'pos', '') not in ('GK', 'DF', 'MF', 'FW')
    )
  into gk, df, mf, fw, distinct_ids, bad
  from jsonb_array_elements(p_slots) as elem;

  return gk = 1 and df = 4 and mf = 4 and fw = 2 and distinct_ids = 11 and bad = 0;
end;
$$;

drop policy if exists "fantasy leagues readable by members" on public.fantasy_leagues;
create policy "fantasy leagues readable by members"
  on public.fantasy_leagues for select
  to authenticated
  using (private.fantasy_is_member(id, (select auth.uid())::text));

drop policy if exists "fantasy members readable inside a league" on public.fantasy_members;
create policy "fantasy members readable inside a league"
  on public.fantasy_members for select
  to authenticated
  using (private.fantasy_is_member(league_id, (select auth.uid())::text));

drop policy if exists "fantasy picks readable by league mates" on public.fantasy_picks;
create policy "fantasy picks readable by league mates"
  on public.fantasy_picks for select
  to authenticated
  using (private.fantasy_shares_league((select auth.uid())::text, user_id));

revoke insert, update, delete on public.fantasy_leagues from anon, authenticated, public;
revoke insert, update, delete on public.fantasy_members from anon, authenticated, public;
revoke insert, update, delete on public.fantasy_picks from anon, authenticated, public;

grant select on public.fantasy_leagues to authenticated;
grant select on public.fantasy_members to authenticated;
grant select on public.fantasy_picks to authenticated;

create or replace function public.kickfeed_fantasy_invite_code()
returns text
language sql
volatile
set search_path = ''
as $$
  select string_agg(
    substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(pg_catalog.random() * 32)::int, 1),
    ''
  )
  from pg_catalog.generate_series(1, 6);
$$;

create or replace function public.kickfeed_create_fantasy_league(p_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid text := (select auth.uid())::text;
  cleaned text := btrim(p_name);
  new_id text;
  code text;
  attempts int := 0;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  if cleaned is null or char_length(cleaned) < 2 or char_length(cleaned) > 40 then
    raise exception 'invalid_name';
  end if;
  if (select count(*) from public.fantasy_members m where m.user_id = uid) >= 10 then
    raise exception 'too_many_leagues';
  end if;

  loop
    attempts := attempts + 1;
    if attempts > 8 then
      raise exception 'code_exhausted';
    end if;
    code := public.kickfeed_fantasy_invite_code();
    exit when not exists (
      select 1 from public.fantasy_leagues l where l.invite_code = code
    );
  end loop;

  new_id := 'fl_' || substr(md5(uid || pg_catalog.clock_timestamp()::text || code), 1, 16);
  insert into public.fantasy_leagues (id, name, invite_code, owner_id)
  values (new_id, cleaned, code, uid);
  insert into public.fantasy_members (league_id, user_id)
  values (new_id, uid);

  return jsonb_build_object('id', new_id, 'name', cleaned, 'invite_code', code);
end;
$$;

create or replace function public.kickfeed_join_fantasy_league(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid text := (select auth.uid())::text;
  code text := upper(btrim(coalesce(p_code, '')));
  league public.fantasy_leagues%rowtype;
  members int;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  if code !~ '^[A-Z0-9]{6}$' then
    raise exception 'invalid_code';
  end if;

  select * into league from public.fantasy_leagues l where l.invite_code = code;
  if not found then
    raise exception 'league_not_found';
  end if;

  if exists (
    select 1 from public.fantasy_members m
    where m.league_id = league.id and m.user_id = uid
  ) then
    return jsonb_build_object('id', league.id, 'name', league.name, 'invite_code', league.invite_code);
  end if;

  if (select count(*) from public.fantasy_members m where m.user_id = uid) >= 10 then
    raise exception 'too_many_leagues';
  end if;

  select count(*) into members from public.fantasy_members m where m.league_id = league.id;
  if members >= 20 then
    raise exception 'league_full';
  end if;

  insert into public.fantasy_members (league_id, user_id)
  values (league.id, uid);

  return jsonb_build_object('id', league.id, 'name', league.name, 'invite_code', league.invite_code);
end;
$$;

create or replace function public.kickfeed_upsert_fantasy_pick(
  p_gameweek_id text,
  p_slots jsonb,
  p_deadline timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid text := (select auth.uid())::text;
  gw date;
  today date := (pg_catalog.now() at time zone 'utc')::date;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_gameweek_id is null or p_gameweek_id !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'invalid_gameweek';
  end if;
  gw := p_gameweek_id::date;
  if extract(dow from gw) <> 5 then
    raise exception 'invalid_gameweek';
  end if;
  -- Current Friday window only. Postgres does not store fixtures, so a passed
  -- deadline is whatever the client reports from the catalog (no stakes).
  if today < gw or today >= gw + 7 then
    raise exception 'gameweek_locked';
  end if;
  if p_deadline is not null and pg_catalog.now() >= p_deadline then
    raise exception 'gameweek_locked';
  end if;
  if not private.fantasy_slots_ok(p_slots) then
    raise exception 'invalid_xi';
  end if;
  if not exists (select 1 from public.fantasy_members m where m.user_id = uid) then
    raise exception 'invalid_xi';
  end if;

  insert into public.fantasy_picks (user_id, gameweek_id, slots, updated_at)
  values (uid, p_gameweek_id, p_slots, pg_catalog.now())
  on conflict (user_id, gameweek_id) do update
    set slots = excluded.slots,
        updated_at = pg_catalog.now();
end;
$$;

revoke all on function public.kickfeed_fantasy_invite_code() from public, anon, authenticated;
revoke all on function public.kickfeed_create_fantasy_league(text) from public, anon;
revoke all on function public.kickfeed_join_fantasy_league(text) from public, anon;
revoke all on function public.kickfeed_upsert_fantasy_pick(text, jsonb, timestamptz) from public, anon;

grant execute on function public.kickfeed_create_fantasy_league(text) to authenticated;
grant execute on function public.kickfeed_join_fantasy_league(text) to authenticated;
grant execute on function public.kickfeed_upsert_fantasy_pick(text, jsonb, timestamptz) to authenticated;

-- KickFeed private fantasy mini-leagues.
-- A league is one live competition (39, 40, 332, 140) and one season.
-- The gameweek id is that competition’s API-Football round label.
-- One XI per member per round. Points rows are the device’s FT tally (goal 4, assist 3).
-- Demo ids never pass auth.uid(), so they cannot write these tables.
--
-- Karol: run this file after 20260923140000_push_devices.sql, then immediately run
-- 20260923193000_fantasy_server_deadline.sql. That follow-up drops the 4-argument
-- pick RPC in this file (it trusted a client deadline) and locks saves to a
-- server-owned kickoff. Safe to re-run this file only if the follow-up is applied after.
-- If an earlier draft of this same file was applied (Friday-window schema, no competition_id),
-- drop public.fantasy_points, public.fantasy_picks, public.fantasy_members, public.fantasy_leagues
-- and run this file again, then run the follow-up.
--
-- Writes: kickfeed_create_fantasy_league, kickfeed_join_fantasy_league,
-- kickfeed_upsert_fantasy_pick, kickfeed_upsert_fantasy_points.
-- Direct inserts are revoked.

create table if not exists public.fantasy_leagues (
  id text primary key,
  name text not null,
  invite_code text not null,
  owner_id text not null,
  competition_id text not null,
  season int not null,
  created_at timestamptz not null default now(),
  constraint fantasy_leagues_id_len check (char_length(id) between 4 and 80),
  constraint fantasy_leagues_name_len check (char_length(btrim(name)) between 2 and 40),
  constraint fantasy_leagues_code check (invite_code ~ '^[A-Z0-9]{6}$'),
  constraint fantasy_leagues_competition check (competition_id in ('39', '40', '332', '140')),
  constraint fantasy_leagues_season check (season between 2020 and 2035)
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
  league_id text not null references public.fantasy_leagues (id) on delete cascade,
  user_id text not null,
  round_id text not null,
  slots jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (league_id, user_id, round_id),
  constraint fantasy_picks_round check (char_length(btrim(round_id)) between 1 and 80),
  constraint fantasy_picks_slots_size check (
    jsonb_typeof(slots) = 'array'
    and jsonb_array_length(slots) = 11
    and char_length(slots::text) <= 6000
  )
);

create table if not exists public.fantasy_points (
  league_id text not null references public.fantasy_leagues (id) on delete cascade,
  user_id text not null,
  round_id text not null,
  points int not null,
  goals int not null,
  assists int not null,
  updated_at timestamptz not null default now(),
  primary key (league_id, user_id, round_id),
  constraint fantasy_points_round check (char_length(btrim(round_id)) between 1 and 80),
  constraint fantasy_points_range check (
    points between 0 and 200
    and goals between 0 and 50
    and assists between 0 and 50
  )
);

alter table public.fantasy_leagues enable row level security;
alter table public.fantasy_members enable row level security;
alter table public.fantasy_picks enable row level security;
alter table public.fantasy_points enable row level security;

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

-- 1 GK, >=3 DF, >=3 MID, >=1 FWD, 11 distinct players, <=3 from one club.
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
  crowded int;
begin
  if p_slots is null or jsonb_typeof(p_slots) <> 'array' or jsonb_array_length(p_slots) <> 11 then
    return false;
  end if;
  if char_length(p_slots::text) > 6000 then
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
        or coalesce(elem->>'number', '0') !~ '^[0-9]{1,2}$'
        or (elem->>'number')::int > 99
    )
  into gk, df, mf, fw, distinct_ids, bad
  from jsonb_array_elements(p_slots) as elem;

  select count(*) into crowded
  from (
    select elem->>'teamId' as team_id
    from jsonb_array_elements(p_slots) as elem
    group by 1
    having count(*) > 3
  ) clubs;

  return gk = 1 and df >= 3 and mf >= 3 and fw >= 1
    and gk + df + mf + fw = 11
    and distinct_ids = 11
    and bad = 0
    and crowded = 0;
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
  using (private.fantasy_is_member(league_id, (select auth.uid())::text));

drop policy if exists "fantasy points readable by league mates" on public.fantasy_points;
create policy "fantasy points readable by league mates"
  on public.fantasy_points for select
  to authenticated
  using (private.fantasy_is_member(league_id, (select auth.uid())::text));

revoke insert, update, delete on public.fantasy_leagues from anon, authenticated, public;
revoke insert, update, delete on public.fantasy_members from anon, authenticated, public;
revoke insert, update, delete on public.fantasy_picks from anon, authenticated, public;
revoke insert, update, delete on public.fantasy_points from anon, authenticated, public;

grant select on public.fantasy_leagues to authenticated;
grant select on public.fantasy_members to authenticated;
grant select on public.fantasy_picks to authenticated;
grant select on public.fantasy_points to authenticated;

drop function if exists public.kickfeed_create_fantasy_league(text);
drop function if exists public.kickfeed_upsert_fantasy_pick(text, jsonb, timestamptz);

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

create or replace function public.kickfeed_create_fantasy_league(
  p_name text,
  p_competition text,
  p_season int
)
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
  if p_competition not in ('39', '40', '332', '140') then
    raise exception 'invalid_competition';
  end if;
  if p_season is null or p_season < 2020 or p_season > 2035 then
    raise exception 'invalid_season';
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
  insert into public.fantasy_leagues (id, name, invite_code, owner_id, competition_id, season)
  values (new_id, cleaned, code, uid, p_competition, p_season);
  insert into public.fantasy_members (league_id, user_id)
  values (new_id, uid);

  return jsonb_build_object(
    'id', new_id,
    'name', cleaned,
    'invite_code', code,
    'competition_id', p_competition,
    'season', p_season
  );
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
    return jsonb_build_object(
      'id', league.id,
      'name', league.name,
      'invite_code', league.invite_code,
      'competition_id', league.competition_id,
      'season', league.season
    );
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

  return jsonb_build_object(
    'id', league.id,
    'name', league.name,
    'invite_code', league.invite_code,
    'competition_id', league.competition_id,
    'season', league.season
  );
end;
$$;

create or replace function public.kickfeed_upsert_fantasy_pick(
  p_league_id text,
  p_round_id text,
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
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_round_id is null or char_length(btrim(p_round_id)) < 1 or char_length(btrim(p_round_id)) > 80 then
    raise exception 'invalid_round';
  end if;
  if p_deadline is not null and pg_catalog.now() >= p_deadline then
    raise exception 'gameweek_locked';
  end if;
  if not private.fantasy_is_member(p_league_id, uid) then
    raise exception 'invalid_xi';
  end if;
  if not private.fantasy_slots_ok(p_slots) then
    raise exception 'invalid_xi';
  end if;

  insert into public.fantasy_picks (league_id, user_id, round_id, slots, updated_at)
  values (p_league_id, uid, btrim(p_round_id), p_slots, pg_catalog.now())
  on conflict (league_id, user_id, round_id) do update
    set slots = excluded.slots,
        updated_at = pg_catalog.now();
end;
$$;

-- A member may store the FT tally for everyone in the league. Postgres has no fixture feed,
-- so the numbers are the device’s count of BFF goal and assist events. No stakes.
create or replace function public.kickfeed_upsert_fantasy_points(
  p_league_id text,
  p_round_id text,
  p_rows jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid text := (select auth.uid())::text;
  row jsonb;
  target text;
  pts int;
  gls int;
  ast int;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  if not private.fantasy_is_member(p_league_id, uid) then
    raise exception 'league_not_found';
  end if;
  if p_round_id is null or char_length(btrim(p_round_id)) < 1 or char_length(btrim(p_round_id)) > 80 then
    raise exception 'invalid_round';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 20 then
    raise exception 'invalid_points';
  end if;

  for row in select value from jsonb_array_elements(p_rows)
  loop
    target := row->>'userId';
    pts := (row->>'points')::int;
    gls := (row->>'goals')::int;
    ast := (row->>'assists')::int;
    if target is null or not private.fantasy_is_member(p_league_id, target) then
      raise exception 'invalid_points';
    end if;
    if pts < 0 or pts > 200 or gls < 0 or gls > 50 or ast < 0 or ast > 50 then
      raise exception 'invalid_points';
    end if;
    insert into public.fantasy_points (league_id, user_id, round_id, points, goals, assists, updated_at)
    values (p_league_id, target, btrim(p_round_id), pts, gls, ast, pg_catalog.now())
    on conflict (league_id, user_id, round_id) do update
      set points = excluded.points,
          goals = excluded.goals,
          assists = excluded.assists,
          updated_at = pg_catalog.now();
  end loop;
end;
$$;

revoke all on function public.kickfeed_fantasy_invite_code() from public, anon, authenticated;
revoke all on function public.kickfeed_create_fantasy_league(text, text, int) from public, anon;
revoke all on function public.kickfeed_join_fantasy_league(text) from public, anon;
revoke all on function public.kickfeed_upsert_fantasy_pick(text, text, jsonb, timestamptz) from public, anon;
revoke all on function public.kickfeed_upsert_fantasy_points(text, text, jsonb) from public, anon;

grant execute on function public.kickfeed_create_fantasy_league(text, text, int) to authenticated;
grant execute on function public.kickfeed_join_fantasy_league(text) to authenticated;
grant execute on function public.kickfeed_upsert_fantasy_pick(text, text, jsonb, timestamptz) to authenticated;
grant execute on function public.kickfeed_upsert_fantasy_points(text, text, jsonb) to authenticated;

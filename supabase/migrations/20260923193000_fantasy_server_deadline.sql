-- Server-owned fantasy deadline. Apply after 20260923180000_fantasy_leagues.sql.
-- Safe to re-run.
--
-- kickfeed_upsert_fantasy_pick no longer takes a client timestamp. A null or
-- far-future p_deadline cannot skip the lock, because that argument is gone.
-- The deadline lives in fantasy_round_deadlines. Only service_role may write it
-- (the sync-fantasy-deadlines Edge Function, after it reads the football BFF).
-- A later sync can move a deadline earlier (least), never later.
--
-- If 20260923180000 was already applied, run this file. Do not edit that file
-- in place on a database that already has it.

create table if not exists public.fantasy_round_deadlines (
  competition_id text not null,
  season int not null,
  round_id text not null,
  deadline_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (competition_id, season, round_id),
  constraint fantasy_round_deadlines_competition check (competition_id in ('39', '40', '332', '140')),
  constraint fantasy_round_deadlines_season check (season between 2020 and 2035),
  constraint fantasy_round_deadlines_round check (char_length(btrim(round_id)) between 1 and 80)
);

create table if not exists public.fantasy_deadline_sync (
  competition_id text not null,
  season int not null,
  fetched_at timestamptz not null,
  primary key (competition_id, season),
  constraint fantasy_deadline_sync_competition check (competition_id in ('39', '40', '332', '140')),
  constraint fantasy_deadline_sync_season check (season between 2020 and 2035)
);

alter table public.fantasy_round_deadlines enable row level security;
alter table public.fantasy_deadline_sync enable row level security;

revoke all on public.fantasy_round_deadlines from public, anon, authenticated;
revoke all on public.fantasy_deadline_sync from public, anon, authenticated;
grant select, insert, update, delete on public.fantasy_round_deadlines to service_role;
grant select, insert, update, delete on public.fantasy_deadline_sync to service_role;

-- Old signatures trusted a client deadline (null skipped the lock).
drop function if exists public.kickfeed_upsert_fantasy_pick(text, jsonb, timestamptz);
drop function if exists public.kickfeed_upsert_fantasy_pick(text, text, jsonb, timestamptz);

create or replace function public.kickfeed_sync_fantasy_round_deadlines(
  p_competition text,
  p_season int,
  p_rows jsonb
)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  row jsonb;
  written int := 0;
  round_label text;
  deadline timestamptz;
begin
  if coalesce(auth.role(), '') is distinct from 'service_role' then
    raise exception 'not_authorized';
  end if;
  if p_competition not in ('39', '40', '332', '140') then
    raise exception 'invalid_competition';
  end if;
  if p_season is null or p_season < 2020 or p_season > 2035 then
    raise exception 'invalid_season';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 60 then
    raise exception 'invalid_deadline';
  end if;

  for row in select value from jsonb_array_elements(p_rows)
  loop
    round_label := btrim(row->>'roundId');
    begin
      deadline := (row->>'deadlineAt')::timestamptz;
    exception
      when others then
        raise exception 'invalid_deadline';
    end;
    if round_label is null or char_length(round_label) < 1 or char_length(round_label) > 80 then
      raise exception 'invalid_deadline';
    end if;
    if deadline is null or deadline < timestamptz '2020-01-01 UTC' or deadline > timestamptz '2036-01-01 UTC' then
      raise exception 'invalid_deadline';
    end if;
    insert into public.fantasy_round_deadlines (competition_id, season, round_id, deadline_at, updated_at)
    values (p_competition, p_season, round_label, deadline, pg_catalog.now())
    on conflict (competition_id, season, round_id) do update
      set deadline_at = least(public.fantasy_round_deadlines.deadline_at, excluded.deadline_at),
          updated_at = pg_catalog.now();
    written := written + 1;
  end loop;

  insert into public.fantasy_deadline_sync (competition_id, season, fetched_at)
  values (p_competition, p_season, pg_catalog.now())
  on conflict (competition_id, season) do update
    set fetched_at = pg_catalog.now();

  return written;
end;
$$;

create or replace function public.kickfeed_upsert_fantasy_pick(
  p_league_id text,
  p_round_id text,
  p_slots jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid text := (select auth.uid())::text;
  comp text;
  league_season int;
  deadline timestamptz;
  round_label text := btrim(p_round_id);
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  if round_label is null or char_length(round_label) < 1 or char_length(round_label) > 80 then
    raise exception 'invalid_round';
  end if;
  if not private.fantasy_is_member(p_league_id, uid) then
    raise exception 'invalid_xi';
  end if;

  select l.competition_id, l.season
    into comp, league_season
  from public.fantasy_leagues l
  where l.id = p_league_id;

  if comp is null then
    raise exception 'league_not_found';
  end if;

  select d.deadline_at
    into deadline
  from public.fantasy_round_deadlines d
  where d.competition_id = comp
    and d.season = league_season
    and d.round_id = round_label;

  if deadline is null then
    raise exception 'round_unknown';
  end if;
  if pg_catalog.now() >= deadline then
    raise exception 'gameweek_locked';
  end if;
  if not private.fantasy_slots_ok(p_slots) then
    raise exception 'invalid_xi';
  end if;

  insert into public.fantasy_picks (league_id, user_id, round_id, slots, updated_at)
  values (p_league_id, uid, round_label, p_slots, pg_catalog.now())
  on conflict (league_id, user_id, round_id) do update
    set slots = excluded.slots,
        updated_at = pg_catalog.now();
end;
$$;

revoke all on function public.kickfeed_sync_fantasy_round_deadlines(text, int, jsonb) from public, anon, authenticated;
grant execute on function public.kickfeed_sync_fantasy_round_deadlines(text, int, jsonb) to service_role;

revoke all on function public.kickfeed_upsert_fantasy_pick(text, text, jsonb) from public, anon;
grant execute on function public.kickfeed_upsert_fantasy_pick(text, text, jsonb) to authenticated;

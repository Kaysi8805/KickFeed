-- Live ranking write lock: RLS ownership is not enough.
-- Direct INSERT/UPDATE/DELETE on predictions / motm_votes is revoked for
-- authenticated clients. Writes go through SECURITY DEFINER RPCs that:
--   * stamp created_at / updated_at with now() (client timestamps ignored)
--   * store a per-match kickoff that can only move earlier
--   * reject score picks once now() >= kickoff
--   * reject MOTM votes before kickoff and from 4 hours after kickoff
--     (covers FT + a short buffer; not an unbounded post-match ballot)

create table if not exists public.match_windows (
  match_id text primary key,
  kickoff timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.match_windows enable row level security;

drop policy if exists "match windows are readable by signed-in users" on public.match_windows;
create policy "match windows are readable by signed-in users"
  on public.match_windows for select
  to authenticated
  using (true);

revoke insert, update, delete on public.match_windows from anon, authenticated;
grant select on public.match_windows to authenticated;

create or replace function public.kickfeed_touch_match_window(p_match_id text, p_kickoff timestamptz)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  stored timestamptz;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if p_match_id is null or length(trim(p_match_id)) = 0 or p_kickoff is null then
    raise exception 'match and kickoff required';
  end if;

  insert into public.match_windows (match_id, kickoff)
  values (trim(p_match_id), p_kickoff)
  on conflict (match_id) do update
    set kickoff = least(public.match_windows.kickoff, excluded.kickoff),
        updated_at = now()
  returning kickoff into stored;

  return stored;
end;
$$;

revoke all on function public.kickfeed_touch_match_window(text, timestamptz) from public, anon, authenticated;

create or replace function public.kickfeed_upsert_prediction(
  p_match_id text,
  p_home_score int,
  p_away_score int,
  p_league_id text,
  p_kickoff timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid text := auth.uid()::text;
  window_kickoff timestamptz;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if p_home_score is null or p_away_score is null or p_home_score < 0 or p_home_score > 9
     or p_away_score < 0 or p_away_score > 9 then
    raise exception 'score out of range';
  end if;

  window_kickoff := public.kickfeed_touch_match_window(p_match_id, p_kickoff);
  if now() >= window_kickoff then
    raise exception 'predictions locked at kickoff';
  end if;

  insert into public.predictions (
    match_id, user_id, league_id, home_score, away_score, created_at, updated_at
  ) values (
    trim(p_match_id), uid, coalesce(p_league_id, ''), p_home_score, p_away_score, now(), now()
  )
  on conflict (match_id, user_id) do update
    set home_score = excluded.home_score,
        away_score = excluded.away_score,
        league_id = excluded.league_id,
        updated_at = now();
end;
$$;

create or replace function public.kickfeed_upsert_motm_vote(
  p_match_id text,
  p_player_key text,
  p_player_id text,
  p_player_name text,
  p_team_id text,
  p_kickoff timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid text := auth.uid()::text;
  window_kickoff timestamptz;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if p_player_key is null or length(trim(p_player_key)) = 0
     or p_player_name is null or length(trim(p_player_name)) = 0
     or p_team_id is null or length(trim(p_team_id)) = 0 then
    raise exception 'motm vote incomplete';
  end if;

  window_kickoff := public.kickfeed_touch_match_window(p_match_id, p_kickoff);
  if now() < window_kickoff then
    raise exception 'motm voting has not opened';
  end if;
  if now() >= window_kickoff + interval '4 hours' then
    raise exception 'motm voting locked';
  end if;

  insert into public.motm_votes (
    match_id, user_id, player_key, player_id, player_name, team_id, created_at
  ) values (
    trim(p_match_id), uid, trim(p_player_key), nullif(trim(coalesce(p_player_id, '')), ''),
    trim(p_player_name), trim(p_team_id), now()
  )
  on conflict (match_id, user_id) do nothing;
end;
$$;

-- Ownership RLS is not a deadline. Drop write policies so a restored GRANT
-- cannot bypass the RPCs; SECURITY DEFINER owner still writes.
drop policy if exists "users can write their own predictions" on public.predictions;
drop policy if exists "users can update their own predictions" on public.predictions;
drop policy if exists "users can delete their own predictions" on public.predictions;
drop policy if exists "users can write their own motm votes" on public.motm_votes;
drop policy if exists "users can update their own motm votes" on public.motm_votes;
drop policy if exists "users can delete their own motm votes" on public.motm_votes;

revoke insert, update, delete on public.predictions from anon, authenticated;
revoke insert, update, delete on public.motm_votes from anon, authenticated;
grant select on public.predictions to authenticated;
grant select on public.motm_votes to authenticated;

revoke all on function public.kickfeed_upsert_prediction(text, int, int, text, timestamptz) from public, anon;
grant execute on function public.kickfeed_upsert_prediction(text, int, int, text, timestamptz) to authenticated;

revoke all on function public.kickfeed_upsert_motm_vote(text, text, text, text, text, timestamptz) from public, anon;
grant execute on function public.kickfeed_upsert_motm_vote(text, text, text, text, text, timestamptz) to authenticated;

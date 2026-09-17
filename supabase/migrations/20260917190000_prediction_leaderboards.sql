-- KickFeed prediction leaderboards.
-- Identity: user_id is the same key as AsyncStorage social state —
--   demo seed (`maya`) OR auth.users uuid (text, not uuid, so both fit).
-- Live writes: RLS only allows auth.uid()::text, so demo ids stay local.
-- Scoring stays in the app against FootballProvider finished fixtures
-- (no match_results table — clients must not author official scores).

create table if not exists public.predictions (
  match_id text not null,
  user_id text not null,
  league_id text not null default '',
  home_score int not null check (home_score between 0 and 9),
  away_score int not null check (away_score between 0 and 9),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (match_id, user_id)
);

create index if not exists predictions_user_id_idx on public.predictions (user_id);
create index if not exists predictions_league_id_idx on public.predictions (league_id);

create table if not exists public.motm_votes (
  match_id text not null,
  user_id text not null,
  player_key text not null,
  player_id text,
  player_name text not null,
  team_id text not null,
  created_at timestamptz not null default now(),
  primary key (match_id, user_id)
);

create index if not exists motm_votes_user_id_idx on public.motm_votes (user_id);

alter table public.predictions enable row level security;
alter table public.motm_votes enable row level security;

drop policy if exists "predictions are readable by signed-in users" on public.predictions;
create policy "predictions are readable by signed-in users"
  on public.predictions for select
  to authenticated
  using (true);

drop policy if exists "users can write their own predictions" on public.predictions;
create policy "users can write their own predictions"
  on public.predictions for insert
  to authenticated
  with check ((select auth.uid())::text = user_id);

drop policy if exists "users can update their own predictions" on public.predictions;
create policy "users can update their own predictions"
  on public.predictions for update
  to authenticated
  using ((select auth.uid())::text = user_id)
  with check ((select auth.uid())::text = user_id);

drop policy if exists "users can delete their own predictions" on public.predictions;
create policy "users can delete their own predictions"
  on public.predictions for delete
  to authenticated
  using ((select auth.uid())::text = user_id);

drop policy if exists "motm votes are readable by signed-in users" on public.motm_votes;
create policy "motm votes are readable by signed-in users"
  on public.motm_votes for select
  to authenticated
  using (true);

drop policy if exists "users can write their own motm votes" on public.motm_votes;
create policy "users can write their own motm votes"
  on public.motm_votes for insert
  to authenticated
  with check ((select auth.uid())::text = user_id);

drop policy if exists "users can update their own motm votes" on public.motm_votes;
create policy "users can update their own motm votes"
  on public.motm_votes for update
  to authenticated
  using ((select auth.uid())::text = user_id)
  with check ((select auth.uid())::text = user_id);

drop policy if exists "users can delete their own motm votes" on public.motm_votes;
create policy "users can delete their own motm votes"
  on public.motm_votes for delete
  to authenticated
  using ((select auth.uid())::text = user_id);

-- Favorite-match Expo push (Batch 2).
-- Apply after 20260923120000_dm_groups.sql. Safe to re-run (IF NOT EXISTS / CREATE OR REPLACE).
--
-- push_devices: one Expo push token per install. RLS lets a signed-in user read only
-- their rows. Writes go through kickfeed_upsert_push_device (security definer) so a
-- token can move when the same phone signs into another account. Tokens are secrets:
-- never grant anon, never select another user's row.
--
-- push_dispatch_state: per-user score baseline + fingerprints so the dispatcher does
-- not re-send a kickoff or goal. Service role writes the snapshot. The signed-in user
-- may only append their own fingerprints (kickfeed_ack_push_fingerprints) so a banner
-- already shown on the open app is not sent again.
--
-- push_fixture_cache: last BFF fixture window per league. Service role only. The
-- dispatcher refreshes live leagues about every 10 minutes and idle leagues hourly
-- so the free API-Football budget stays intact. No FOOTBALL_API_KEY lives here.

create table if not exists public.push_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  expo_push_token text not null,
  platform text not null,
  enabled boolean not null default true,
  kickoff boolean not null default true,
  goals boolean not null default true,
  favorite_team_ids text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_devices_platform_chk check (platform in ('ios', 'android')),
  constraint push_devices_token_chk check (
    expo_push_token ~ '^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,140}\]$'
  )
);

create unique index if not exists push_devices_token_uidx on public.push_devices (expo_push_token);
create index if not exists push_devices_user_idx on public.push_devices (user_id);
create index if not exists push_devices_enabled_idx on public.push_devices (user_id) where enabled;

alter table public.push_devices enable row level security;

drop policy if exists "users read their own push devices" on public.push_devices;
create policy "users read their own push devices"
  on public.push_devices for select
  to authenticated
  using (auth.uid() = user_id);

revoke all on table public.push_devices from public, anon, authenticated;
grant select on table public.push_devices to authenticated;
grant select, insert, update, delete on table public.push_devices to service_role;

create table if not exists public.push_dispatch_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  scores jsonb not null default '{}'::jsonb,
  presented text[] not null default '{}',
  scheduled jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.push_dispatch_state enable row level security;

revoke all on table public.push_dispatch_state from public, anon, authenticated;
grant select, insert, update, delete on table public.push_dispatch_state to service_role;

create table if not exists public.push_fixture_cache (
  league_id text primary key,
  matches jsonb not null default '[]'::jsonb,
  fetched_at timestamptz not null default now(),
  constraint push_fixture_cache_league_chk check (league_id in ('39', '40', '332', '140'))
);

alter table public.push_fixture_cache enable row level security;

revoke all on table public.push_fixture_cache from public, anon, authenticated;
grant select, insert, update, delete on table public.push_fixture_cache to service_role;

create or replace function public.kickfeed_upsert_push_device(
  p_token text,
  p_platform text,
  p_enabled boolean,
  p_kickoff boolean,
  p_goals boolean,
  p_favorite_team_ids text[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  device_id uuid;
  teams text[];
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if p_platform is null or p_platform not in ('ios', 'android') then
    raise exception 'platform';
  end if;
  if p_token is null or p_token !~ '^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,140}\]$' then
    raise exception 'token';
  end if;

  if coalesce(array_length(p_favorite_team_ids, 1), 0) > 40 then
    p_favorite_team_ids := p_favorite_team_ids[1:40];
  end if;

  select coalesce(array_agg(t), '{}')
    into teams
  from (
    select distinct trim(x) as t
    from unnest(coalesce(p_favorite_team_ids, '{}'::text[])) as x
    where char_length(trim(x)) between 1 and 64
    limit 40
  ) s;

  delete from public.push_devices
  where expo_push_token = p_token
    and user_id <> uid;

  insert into public.push_devices (
    user_id,
    expo_push_token,
    platform,
    enabled,
    kickoff,
    goals,
    favorite_team_ids,
    updated_at
  )
  values (
    uid,
    p_token,
    p_platform,
    coalesce(p_enabled, false),
    coalesce(p_kickoff, true),
    coalesce(p_goals, true),
    coalesce(teams, '{}'),
    now()
  )
  on conflict (expo_push_token) do update
    set user_id = excluded.user_id,
        platform = excluded.platform,
        enabled = excluded.enabled,
        kickoff = excluded.kickoff,
        goals = excluded.goals,
        favorite_team_ids = excluded.favorite_team_ids,
        updated_at = now()
  returning id into device_id;

  return device_id;
end;
$$;

revoke all on function public.kickfeed_upsert_push_device(text, text, boolean, boolean, boolean, text[]) from public, anon;
grant execute on function public.kickfeed_upsert_push_device(text, text, boolean, boolean, boolean, text[]) to authenticated;

create or replace function public.kickfeed_ack_push_fingerprints(p_fingerprints text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  incoming text[];
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  if coalesce(array_length(p_fingerprints, 1), 0) > 10 then
    p_fingerprints := p_fingerprints[1:10];
  end if;

  select coalesce(array_agg(distinct fp), '{}')
    into incoming
  from (
    select trim(x) as fp
    from unnest(coalesce(p_fingerprints, '{}'::text[])) as x
    where char_length(trim(x)) between 8 and 120
      and trim(x) !~ '[[:space:]]'
      and (
        trim(x) like 'kickoff:' || uid::text || ':%'
        or trim(x) like 'goal:' || uid::text || ':%'
      )
    limit 10
  ) s;

  if coalesce(array_length(incoming, 1), 0) = 0 then
    return;
  end if;

  insert into public.push_dispatch_state (user_id, presented, updated_at)
  values (uid, incoming, now())
  on conflict (user_id) do update
    set presented = (
      select coalesce(array_agg(fp), '{}')
      from (
        select distinct unnest(public.push_dispatch_state.presented || excluded.presented) as fp
        limit 80
      ) trimmed
    ),
        updated_at = now();
end;
$$;

revoke all on function public.kickfeed_ack_push_fingerprints(text[]) from public, anon;
grant execute on function public.kickfeed_ack_push_fingerprints(text[]) to authenticated;

create or replace function public.kickfeed_save_push_dispatch_state(
  p_user_id uuid,
  p_scores jsonb,
  p_presented text[],
  p_scheduled jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'forbidden';
  end if;
  if p_user_id is null then
    raise exception 'user';
  end if;

  insert into public.push_dispatch_state (user_id, scores, presented, scheduled, updated_at)
  values (
    p_user_id,
    coalesce(p_scores, '{}'::jsonb),
    coalesce(p_presented, '{}'),
    coalesce(p_scheduled, '{}'::jsonb),
    now()
  )
  on conflict (user_id) do update
    set scores = excluded.scores,
        scheduled = excluded.scheduled,
        presented = (
          select coalesce(array_agg(fp), '{}')
          from (
            select distinct unnest(public.push_dispatch_state.presented || excluded.presented) as fp
            limit 80
          ) trimmed
        ),
        updated_at = now();
end;
$$;

revoke all on function public.kickfeed_save_push_dispatch_state(uuid, jsonb, text[], jsonb) from public, anon, authenticated;
grant execute on function public.kickfeed_save_push_dispatch_state(uuid, jsonb, text[], jsonb) to service_role;

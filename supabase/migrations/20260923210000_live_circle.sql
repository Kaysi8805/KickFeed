-- Live Circle (Živý kruh). Apply after 20260923140000_push_devices.sql
-- (claim-push joins push_devices) and after user_blocks exists.
-- Safe to re-run (IF NOT EXISTS / CREATE OR REPLACE / DROP POLICY).
--
-- Opt-in is off until kickfeed_set_live_circle(true). Presence is one fixture
-- per user. Friends are mutual rows in user_follows. RLS hides presence from
-- anyone who is not a mutual friend, either person opted out, a block exists,
-- or the heartbeat is older than 5 minutes.
--
-- Clients do not insert these tables. Writes go through the kickfeed_* RPCs.
-- kickfeed_claim_live_circle_pushes is service_role only (it returns Expo tokens).

create table if not exists public.user_follows (
  follower_id text not null,
  followee_id text not null,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  constraint user_follows_not_self check (follower_id <> followee_id)
);

create index if not exists user_follows_followee_id_idx on public.user_follows (followee_id);

create table if not exists public.live_circle_settings (
  user_id text primary key,
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.live_circle_presence (
  user_id text primary key,
  fixture_id text not null,
  display_name text not null,
  handle text not null,
  initials text not null,
  avatar_color text not null,
  heartbeat_at timestamptz not null default now(),
  constraint live_circle_fixture_len check (char_length(fixture_id) between 1 and 80),
  constraint live_circle_name_len check (char_length(btrim(display_name)) between 1 and 80),
  constraint live_circle_handle_len check (char_length(btrim(handle)) between 1 and 32),
  constraint live_circle_initials_len check (char_length(btrim(initials)) between 1 and 4)
);

create index if not exists live_circle_presence_fixture_idx
  on public.live_circle_presence (fixture_id, heartbeat_at desc);

create table if not exists public.live_circle_notices (
  recipient_id text not null,
  actor_id text not null,
  fixture_id text not null,
  sent_at timestamptz not null default now(),
  primary key (recipient_id, actor_id, fixture_id)
);

alter table public.user_follows enable row level security;
alter table public.live_circle_settings enable row level security;
alter table public.live_circle_presence enable row level security;
alter table public.live_circle_notices enable row level security;

create schema if not exists private;

create or replace function private.live_circle_can_see(p_viewer text, p_subject text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    p_viewer is not null
    and p_subject is not null
    and p_viewer <> p_subject
    and exists (
      select 1 from public.live_circle_settings s
      where s.user_id = p_viewer and s.enabled
    )
    and exists (
      select 1 from public.live_circle_settings s
      where s.user_id = p_subject and s.enabled
    )
    and exists (
      select 1
      from public.user_follows mine
      join public.user_follows theirs
        on theirs.follower_id = mine.followee_id
       and theirs.followee_id = mine.follower_id
      where mine.follower_id = p_viewer
        and mine.followee_id = p_subject
    )
    and not exists (
      select 1
      from public.user_blocks b
      where (b.blocker_id = p_viewer and b.blocked_id = p_subject)
         or (b.blocker_id = p_subject and b.blocked_id = p_viewer)
    );
$$;

revoke all on function private.live_circle_can_see(text, text) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.live_circle_can_see(text, text) to authenticated;

drop policy if exists "users read their follows" on public.user_follows;
create policy "users read their follows"
  on public.user_follows for select
  to authenticated
  using (
    follower_id = (select auth.uid())::text
    or followee_id = (select auth.uid())::text
  );

drop policy if exists "users read their live circle setting" on public.live_circle_settings;
create policy "users read their live circle setting"
  on public.live_circle_settings for select
  to authenticated
  using (user_id = (select auth.uid())::text);

drop policy if exists "friends read fresh live circle presence" on public.live_circle_presence;
create policy "friends read fresh live circle presence"
  on public.live_circle_presence for select
  to authenticated
  using (
    user_id = (select auth.uid())::text
    or (
      private.live_circle_can_see((select auth.uid())::text, user_id)
      and heartbeat_at > now() - interval '5 minutes'
    )
  );

revoke all on public.user_follows from anon, public;
revoke all on public.live_circle_settings from anon, public;
revoke all on public.live_circle_presence from anon, public;
revoke all on public.live_circle_notices from anon, public, authenticated;

grant select on public.user_follows to authenticated;
grant select on public.live_circle_settings to authenticated;
grant select on public.live_circle_presence to authenticated;
grant select, insert, update, delete on public.user_follows to service_role;
grant select, insert, update, delete on public.live_circle_settings to service_role;
grant select, insert, update, delete on public.live_circle_presence to service_role;
grant select, insert, update, delete on public.live_circle_notices to service_role;

create or replace function public.kickfeed_set_live_circle(p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid text := (select auth.uid())::text;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  insert into public.live_circle_settings (user_id, enabled, updated_at)
  values (uid, coalesce(p_enabled, false), now())
  on conflict (user_id) do update
    set enabled = excluded.enabled,
        updated_at = now();

  if coalesce(p_enabled, false) is not true then
    delete from public.live_circle_presence where user_id = uid;
  end if;
end;
$$;

create or replace function public.kickfeed_sync_follows(p_followee_ids text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid text := (select auth.uid())::text;
  incoming text[];
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  if coalesce(array_length(p_followee_ids, 1), 0) > 200 then
    p_followee_ids := p_followee_ids[1:200];
  end if;

  select coalesce(array_agg(id), '{}'::text[])
    into incoming
  from (
    select distinct trim(x) as id
    from unnest(coalesce(p_followee_ids, '{}'::text[])) as x
    where char_length(trim(x)) between 1 and 80
      and trim(x) <> uid
      and trim(x) !~ '[[:space:]]'
    limit 200
  ) s
  where not exists (
    select 1
    from public.user_blocks b
    where (b.blocker_id = uid and b.blocked_id = s.id)
       or (b.blocker_id = s.id and b.blocked_id = uid)
  );

  delete from public.user_follows f
  where f.follower_id = uid
    and not (f.followee_id = any (coalesce(incoming, '{}'::text[])));

  insert into public.user_follows (follower_id, followee_id)
  select uid, id
  from unnest(coalesce(incoming, '{}'::text[])) as id
  on conflict (follower_id, followee_id) do nothing;
end;
$$;

-- True when this touch starts a session (first sighting, fixture change, or idle expiry).
create or replace function public.kickfeed_touch_live_circle(
  p_fixture_id text,
  p_display_name text,
  p_handle text,
  p_initials text,
  p_avatar_color text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid text := (select auth.uid())::text;
  prev_fixture text;
  prev_at timestamptz;
  started boolean;
  display_name text;
  handle text;
  initials text;
  avatar_color text;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if p_fixture_id is null or p_fixture_id !~ '^[A-Za-z0-9][A-Za-z0-9:_-]{0,79}$' then
    raise exception 'bad_fixture';
  end if;
  if not exists (
    select 1 from public.live_circle_settings s
    where s.user_id = uid and s.enabled
  ) then
    delete from public.live_circle_presence where user_id = uid;
    raise exception 'opted_out';
  end if;

  display_name := left(btrim(regexp_replace(coalesce(p_display_name, ''), '[[:space:]]+', ' ', 'g')), 80);
  if display_name is null or display_name = '' then
    display_name := 'Fan';
  end if;
  handle := left(regexp_replace(coalesce(p_handle, ''), '^@', ''), 32);
  handle := regexp_replace(handle, '[[:space:]]', '', 'g');
  if handle is null or handle = '' then
    handle := 'fan';
  end if;
  initials := upper(left(btrim(coalesce(p_initials, '')), 4));
  if initials is null or initials = '' then
    initials := upper(left(display_name, 2));
  end if;
  avatar_color := coalesce(p_avatar_color, '');
  if avatar_color !~ '^#[0-9A-Fa-f]{3,8}$' then
    avatar_color := '#22C55E';
  end if;

  select fixture_id, heartbeat_at
    into prev_fixture, prev_at
  from public.live_circle_presence
  where user_id = uid;

  started := prev_at is null
    or prev_fixture is distinct from p_fixture_id
    or prev_at < now() - interval '5 minutes';

  insert into public.live_circle_presence (
    user_id, fixture_id, display_name, handle, initials, avatar_color, heartbeat_at
  )
  values (uid, p_fixture_id, display_name, handle, initials, avatar_color, now())
  on conflict (user_id) do update
    set fixture_id = excluded.fixture_id,
        display_name = excluded.display_name,
        handle = excluded.handle,
        initials = excluded.initials,
        avatar_color = excluded.avatar_color,
        heartbeat_at = now();

  return started;
end;
$$;

create or replace function public.kickfeed_clear_live_circle()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid text := (select auth.uid())::text;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  delete from public.live_circle_presence where user_id = uid;
end;
$$;

-- Service role. Favorited friends who are not themselves on the fixture.
-- Skips anyone notified for this actor+fixture in the last 30 minutes.
create or replace function public.kickfeed_claim_live_circle_pushes(
  p_actor_id text,
  p_fixture_id text,
  p_home_team_id text,
  p_away_team_id text
)
returns table (recipient_id text, expo_push_token text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'forbidden';
  end if;
  if p_actor_id is null or p_fixture_id is null then
    return;
  end if;
  if not exists (
    select 1
    from public.live_circle_presence p
    join public.live_circle_settings s on s.user_id = p.user_id
    where p.user_id = p_actor_id
      and p.fixture_id = p_fixture_id
      and s.enabled
      and p.heartbeat_at > now() - interval '5 minutes'
  ) then
    return;
  end if;

  return query
  with friends as (
    select mine.followee_id as friend_id
    from public.user_follows mine
    join public.user_follows back
      on back.follower_id = mine.followee_id
     and back.followee_id = mine.follower_id
    join public.live_circle_settings s on s.user_id = mine.followee_id and s.enabled
    where mine.follower_id = p_actor_id
      and mine.followee_id <> p_actor_id
      and not exists (
        select 1
        from public.user_blocks b
        where (b.blocker_id = p_actor_id and b.blocked_id = mine.followee_id)
           or (b.blocker_id = mine.followee_id and b.blocked_id = p_actor_id)
      )
      and not exists (
        select 1
        from public.live_circle_presence vp
        where vp.user_id = mine.followee_id
          and vp.fixture_id = p_fixture_id
          and vp.heartbeat_at > now() - interval '5 minutes'
      )
      and not exists (
        select 1
        from public.live_circle_notices n
        where n.recipient_id = mine.followee_id
          and n.actor_id = p_actor_id
          and n.fixture_id = p_fixture_id
          and n.sent_at > now() - interval '30 minutes'
      )
  ),
  picked as (
    select distinct f.friend_id
    from friends f
    join public.push_devices d
      on d.user_id::text = f.friend_id
     and d.enabled
     and (
       p_home_team_id = any (d.favorite_team_ids)
       or p_away_team_id = any (d.favorite_team_ids)
     )
    order by f.friend_id
    limit 20
  ),
  noted as (
    insert into public.live_circle_notices (recipient_id, actor_id, fixture_id, sent_at)
    select p.friend_id, p_actor_id, p_fixture_id, now()
    from picked p
    on conflict (recipient_id, actor_id, fixture_id) do update
      set sent_at = excluded.sent_at
    returning live_circle_notices.recipient_id
  )
  select n.recipient_id, d.expo_push_token
  from noted n
  join public.push_devices d
    on d.user_id::text = n.recipient_id
   and d.enabled
   and (
     p_home_team_id = any (d.favorite_team_ids)
     or p_away_team_id = any (d.favorite_team_ids)
   );
end;
$$;

revoke all on function public.kickfeed_set_live_circle(boolean) from public, anon;
revoke all on function public.kickfeed_sync_follows(text[]) from public, anon;
revoke all on function public.kickfeed_touch_live_circle(text, text, text, text, text) from public, anon;
revoke all on function public.kickfeed_clear_live_circle() from public, anon;
revoke all on function public.kickfeed_claim_live_circle_pushes(text, text, text, text) from public, anon, authenticated;

grant execute on function public.kickfeed_set_live_circle(boolean) to authenticated;
grant execute on function public.kickfeed_sync_follows(text[]) to authenticated;
grant execute on function public.kickfeed_touch_live_circle(text, text, text, text, text) to authenticated;
grant execute on function public.kickfeed_clear_live_circle() to authenticated;
grant execute on function public.kickfeed_claim_live_circle_pushes(text, text, text, text) to service_role;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.live_circle_presence;
    exception
      when duplicate_object then
        null;
    end;
  end if;
end $$;

-- Rivalry Bond. Apply after 20260923210000_live_circle.sql (user_follows),
-- 20260917190000_prediction_leaderboards.sql (predictions), and
-- 20260919120000_direct_messages.sql (user_reports target check).
-- Safe to re-run (IF NOT EXISTS / CREATE OR REPLACE / DROP POLICY).
--
-- One declared club per user (public.rivalry_clubs). A season bond locks the
-- two clubs at accept time. Pair order is least user id first so the same
-- friends cannot open two bonds.
--
-- Scoring (no stakes, no payouts):
--   real_h2h (weight 3): a finished match whose two clubs are exactly this pair.
--     The winner's friend gets 3. A draw is 1 each. A match that includes only
--     one of the clubs does not score here.
--   prediction (weight 1): both users already have a predictions row for that
--     match. Higher leaderboard points wins (exact 5, right result 2, else 0).
--     If those tie, the smaller scoreline error wins. Still level → 0 each.
--   banter: text only, 1–160 characters, 20s cooldown and 8 / 2 min on the bond.
-- Clients do not send point totals. kickfeed_sync_rivalry_ledger computes them
-- from the scoreline plus stored predictions. There is no Edge Function.
--
-- RLS: only the two participants can select the bond, its ledger, and their
-- own declared club. Writes go through the kickfeed_* RPCs.

create table if not exists public.rivalry_clubs (
  user_id text primary key,
  club_id text not null,
  club_name text not null,
  club_code text not null,
  crest_url text,
  color text not null default '#152018',
  accent text not null default '#22C55E',
  updated_at timestamptz not null default now(),
  constraint rivalry_clubs_club_id check (club_id ~ '^[A-Za-z0-9][A-Za-z0-9:_-]{0,39}$'),
  constraint rivalry_clubs_name_len check (char_length(btrim(club_name)) between 1 and 80),
  constraint rivalry_clubs_code_len check (char_length(club_code) between 1 and 8),
  constraint rivalry_clubs_crest check (
    crest_url is null
    or (crest_url ~ '^https://' and char_length(crest_url) <= 300)
  ),
  constraint rivalry_clubs_color check (color ~ '^#[0-9A-Fa-f]{6}$'),
  constraint rivalry_clubs_accent check (accent ~ '^#[0-9A-Fa-f]{6}$')
);

create table if not exists public.rivalry_bonds (
  id uuid primary key default gen_random_uuid(),
  user_a text not null,
  user_b text not null,
  club_a_id text not null,
  club_b_id text not null,
  club_a_name text not null,
  club_b_name text not null,
  club_a_code text not null,
  club_b_code text not null,
  club_a_crest text,
  club_b_crest text,
  club_a_color text not null default '#152018',
  club_b_color text not null default '#152018',
  club_a_accent text not null default '#22C55E',
  club_b_accent text not null default '#22C55E',
  season text not null,
  status text not null,
  invited_by text not null,
  points_a int not null default 0,
  points_b int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rivalry_bonds_users_ordered check (user_a < user_b),
  constraint rivalry_bonds_users_distinct check (user_a <> user_b),
  constraint rivalry_bonds_clubs_distinct check (club_a_id <> club_b_id),
  constraint rivalry_bonds_status check (status in ('invite', 'active', 'ended')),
  constraint rivalry_bonds_season check (season ~ '^[0-9]{4}/[0-9]{2}$'),
  constraint rivalry_bonds_points check (points_a >= 0 and points_b >= 0),
  constraint rivalry_bonds_inviter check (invited_by = user_a or invited_by = user_b),
  constraint rivalry_bonds_club_id check (
    club_a_id ~ '^[A-Za-z0-9][A-Za-z0-9:_-]{0,39}$'
    and club_b_id ~ '^[A-Za-z0-9][A-Za-z0-9:_-]{0,39}$'
  )
);

create unique index if not exists rivalry_bonds_open_pair_idx
  on public.rivalry_bonds (user_a, user_b, season)
  where status in ('invite', 'active');

create index if not exists rivalry_bonds_user_b_idx on public.rivalry_bonds (user_b);

create table if not exists public.rivalry_ledger (
  id uuid primary key default gen_random_uuid(),
  bond_id uuid not null references public.rivalry_bonds (id) on delete cascade,
  kind text not null,
  match_id text,
  points_a int not null default 0,
  points_b int not null default 0,
  body text,
  author_id text,
  source_key text,
  created_at timestamptz not null default now(),
  constraint rivalry_ledger_kind check (kind in ('real_h2h', 'prediction', 'banter', 'system')),
  constraint rivalry_ledger_points check (points_a between 0 and 3 and points_b between 0 and 3),
  constraint rivalry_ledger_body check (body is null or char_length(body) between 1 and 280),
  constraint rivalry_ledger_match check (
    match_id is null or match_id ~ '^[A-Za-z0-9][A-Za-z0-9:_-]{0,79}$'
  ),
  constraint rivalry_ledger_source unique (bond_id, source_key)
);

create index if not exists rivalry_ledger_bond_created_idx
  on public.rivalry_ledger (bond_id, created_at desc);

alter table public.rivalry_clubs enable row level security;
alter table public.rivalry_bonds enable row level security;
alter table public.rivalry_ledger enable row level security;

-- Banter reports reuse user_reports. Existing rows stay valid.
alter table public.user_reports drop constraint if exists user_reports_target_type_check;
alter table public.user_reports
  add constraint user_reports_target_type_check
  check (target_type in ('post', 'profile', 'comment', 'dm', 'rivalry'));

create schema if not exists private;

create or replace function private.rivalry_season(p_now timestamptz)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when extract(month from (p_now at time zone 'utc')) >= 7
      then to_char(p_now at time zone 'utc', 'YYYY')
        || '/'
        || to_char((p_now at time zone 'utc') + interval '1 year', 'YY')
    else to_char((p_now at time zone 'utc') - interval '1 year', 'YYYY')
        || '/'
        || to_char(p_now at time zone 'utc', 'YY')
  end;
$$;

create or replace function private.rivalry_blocked(p_left text, p_right text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_blocks b
    where (b.blocker_id = p_left and b.blocked_id = p_right)
       or (b.blocker_id = p_right and b.blocked_id = p_left)
  );
$$;

create or replace function private.rivalry_mutual(p_left text, p_right text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_follows mine
    join public.user_follows back
      on back.follower_id = mine.followee_id
     and back.followee_id = mine.follower_id
    where mine.follower_id = p_left
      and mine.followee_id = p_right
  );
$$;

create or replace function private.rivalry_pick_points(p_home int, p_away int, r_home int, r_away int)
returns int
language sql
immutable
set search_path = ''
as $$
  select case
    when p_home = r_home and p_away = r_away then 5
    when (p_home > p_away and r_home > r_away)
      or (p_home < p_away and r_home < r_away)
      or (p_home = p_away and r_home = r_away) then 2
    else 0
  end;
$$;

create or replace function private.rivalry_pick_error(p_home int, p_away int, r_home int, r_away int)
returns int
language sql
immutable
set search_path = ''
as $$
  select abs(p_home - r_home) + abs(p_away - r_away);
$$;

revoke all on function private.rivalry_season(timestamptz) from public, anon, authenticated;
revoke all on function private.rivalry_blocked(text, text) from public, anon, authenticated;
revoke all on function private.rivalry_mutual(text, text) from public, anon, authenticated;
revoke all on function private.rivalry_pick_points(int, int, int, int) from public, anon, authenticated;
revoke all on function private.rivalry_pick_error(int, int, int, int) from public, anon, authenticated;

drop policy if exists "users read their declared club" on public.rivalry_clubs;
create policy "users read their declared club"
  on public.rivalry_clubs for select
  to authenticated
  using (user_id = (select auth.uid())::text);

drop policy if exists "participants read rivalry bonds" on public.rivalry_bonds;
create policy "participants read rivalry bonds"
  on public.rivalry_bonds for select
  to authenticated
  using (
    user_a = (select auth.uid())::text
    or user_b = (select auth.uid())::text
  );

drop policy if exists "participants read rivalry ledger" on public.rivalry_ledger;
create policy "participants read rivalry ledger"
  on public.rivalry_ledger for select
  to authenticated
  using (
    exists (
      select 1
      from public.rivalry_bonds b
      where b.id = bond_id
        and (
          b.user_a = (select auth.uid())::text
          or b.user_b = (select auth.uid())::text
        )
    )
  );

revoke all on public.rivalry_clubs from anon, public, authenticated;
revoke all on public.rivalry_bonds from anon, public, authenticated;
revoke all on public.rivalry_ledger from anon, public, authenticated;

grant select on public.rivalry_clubs to authenticated;
grant select on public.rivalry_bonds to authenticated;
grant select on public.rivalry_ledger to authenticated;
grant select, insert, update, delete on public.rivalry_clubs to service_role;
grant select, insert, update, delete on public.rivalry_bonds to service_role;
grant select, insert, update, delete on public.rivalry_ledger to service_role;

create or replace function public.kickfeed_set_rivalry_club(
  p_club_id text,
  p_club_name text,
  p_club_code text,
  p_crest_url text,
  p_color text,
  p_accent text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid text := (select auth.uid())::text;
  club_id text;
  club_name text;
  club_code text;
  crest_url text;
  color text;
  accent text;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  club_id := btrim(coalesce(p_club_id, ''));
  if club_id !~ '^[A-Za-z0-9][A-Za-z0-9:_-]{0,39}$' then
    raise exception 'bad_club';
  end if;
  club_name := left(btrim(regexp_replace(coalesce(p_club_name, ''), '[[:space:]]+', ' ', 'g')), 80);
  if club_name is null or club_name = '' then
    raise exception 'bad_club';
  end if;
  club_code := upper(left(regexp_replace(coalesce(p_club_code, ''), '[^A-Za-z0-9]', '', 'g'), 4));
  if club_code is null or club_code = '' then
    club_code := upper(left(regexp_replace(club_name, '[^A-Za-z0-9]', '', 'g'), 3));
  end if;
  if club_code is null or club_code = '' then
    club_code := 'FC';
  end if;
  crest_url := nullif(btrim(coalesce(p_crest_url, '')), '');
  if crest_url is not null and (crest_url !~ '^https://' or char_length(crest_url) > 300) then
    crest_url := null;
  end if;
  color := upper(btrim(coalesce(p_color, '')));
  if color !~ '^#[0-9A-F]{6}$' then
    color := '#152018';
  end if;
  accent := upper(btrim(coalesce(p_accent, '')));
  if accent !~ '^#[0-9A-F]{6}$' then
    accent := '#22C55E';
  end if;

  insert into public.rivalry_clubs (
    user_id, club_id, club_name, club_code, crest_url, color, accent, updated_at
  )
  values (uid, club_id, club_name, club_code, crest_url, color, accent, now())
  on conflict (user_id) do update
    set club_id = excluded.club_id,
        club_name = excluded.club_name,
        club_code = excluded.club_code,
        crest_url = excluded.crest_url,
        color = excluded.color,
        accent = excluded.accent,
        updated_at = now();
end;
$$;

create or replace function public.kickfeed_invite_rivalry(p_peer_id text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid text := (select auth.uid())::text;
  peer text := nullif(btrim(coalesce(p_peer_id, '')), '');
  left_id text;
  right_id text;
  season_label text;
  bond_id uuid;
  a_club_id text;
  a_name text;
  a_code text;
  a_crest text;
  a_color text;
  a_accent text;
  b_club_id text;
  b_name text;
  b_code text;
  b_crest text;
  b_color text;
  b_accent text;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  if peer is null or peer = uid or char_length(peer) > 80 or peer ~ '[[:space:]]' then
    raise exception 'bad_peer';
  end if;
  if private.rivalry_blocked(uid, peer) then
    raise exception 'blocked';
  end if;
  if not private.rivalry_mutual(uid, peer) then
    raise exception 'not_friends';
  end if;

  if uid < peer then
    left_id := uid;
    right_id := peer;
  else
    left_id := peer;
    right_id := uid;
  end if;

  select c.club_id, c.club_name, c.club_code, c.crest_url, c.color, c.accent
    into a_club_id, a_name, a_code, a_crest, a_color, a_accent
  from public.rivalry_clubs c
  where c.user_id = left_id;
  select c.club_id, c.club_name, c.club_code, c.crest_url, c.color, c.accent
    into b_club_id, b_name, b_code, b_crest, b_color, b_accent
  from public.rivalry_clubs c
  where c.user_id = right_id;
  if a_club_id is null or b_club_id is null then
    raise exception 'missing_club';
  end if;
  if a_club_id = b_club_id then
    raise exception 'same_club';
  end if;

  season_label := private.rivalry_season(now());
  if exists (
    select 1
    from public.rivalry_bonds b
    where b.user_a = left_id
      and b.user_b = right_id
      and b.season = season_label
      and b.status in ('invite', 'active')
  ) then
    raise exception 'already_open';
  end if;

  insert into public.rivalry_bonds (
    user_a, user_b,
    club_a_id, club_b_id, club_a_name, club_b_name, club_a_code, club_b_code,
    club_a_crest, club_b_crest, club_a_color, club_b_color, club_a_accent, club_b_accent,
    season, status, invited_by
  )
  values (
    left_id, right_id,
    a_club_id, b_club_id, a_name, b_name, a_code, b_code,
    a_crest, b_crest, a_color, b_color, a_accent, b_accent,
    season_label, 'invite', uid
  )
  returning id into bond_id;

  insert into public.rivalry_ledger (bond_id, kind, points_a, points_b, body, author_id, source_key)
  values (
    bond_id,
    'system',
    0,
    0,
    'Invite sent for ' || season_label || '.',
    uid,
    'system:invite'
  );

  return bond_id;
end;
$$;

create or replace function public.kickfeed_respond_rivalry(p_bond_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid text := (select auth.uid())::text;
  bond public.rivalry_bonds%rowtype;
  a_club_id text;
  a_name text;
  a_code text;
  a_crest text;
  a_color text;
  a_accent text;
  b_club_id text;
  b_name text;
  b_code text;
  b_crest text;
  b_color text;
  b_accent text;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  select * into bond from public.rivalry_bonds where id = p_bond_id;
  if bond.id is null or (uid <> bond.user_a and uid <> bond.user_b) then
    raise exception 'not_participant';
  end if;
  if bond.status <> 'invite' then
    raise exception 'not_invite';
  end if;
  if coalesce(p_accept, false) and uid = bond.invited_by then
    raise exception 'not_invite';
  end if;
  if private.rivalry_blocked(bond.user_a, bond.user_b) then
    raise exception 'blocked';
  end if;

  if not coalesce(p_accept, false) then
    update public.rivalry_bonds
      set status = 'ended', updated_at = now()
      where id = bond.id;
    insert into public.rivalry_ledger (bond_id, kind, points_a, points_b, body, author_id, source_key)
    values (bond.id, 'system', 0, 0, 'Invite declined.', uid, 'system:decline');
    return;
  end if;

  if not private.rivalry_mutual(bond.user_a, bond.user_b) then
    raise exception 'not_friends';
  end if;

  select c.club_id, c.club_name, c.club_code, c.crest_url, c.color, c.accent
    into a_club_id, a_name, a_code, a_crest, a_color, a_accent
  from public.rivalry_clubs c
  where c.user_id = bond.user_a;
  select c.club_id, c.club_name, c.club_code, c.crest_url, c.color, c.accent
    into b_club_id, b_name, b_code, b_crest, b_color, b_accent
  from public.rivalry_clubs c
  where c.user_id = bond.user_b;
  if a_club_id is null or b_club_id is null then
    raise exception 'missing_club';
  end if;
  if a_club_id = b_club_id then
    raise exception 'same_club';
  end if;

  update public.rivalry_bonds
    set status = 'active',
        club_a_id = a_club_id,
        club_b_id = b_club_id,
        club_a_name = a_name,
        club_b_name = b_name,
        club_a_code = a_code,
        club_b_code = b_code,
        club_a_crest = a_crest,
        club_b_crest = b_crest,
        club_a_color = a_color,
        club_b_color = b_color,
        club_a_accent = a_accent,
        club_b_accent = b_accent,
        updated_at = now()
    where id = bond.id;

  insert into public.rivalry_ledger (bond_id, kind, points_a, points_b, body, author_id, source_key)
  values (
    bond.id,
    'system',
    0,
    0,
    'Rivalry Bond is on for ' || bond.season || '.',
    uid,
    'system:accept'
  );
end;
$$;

create or replace function public.kickfeed_end_rivalry(p_bond_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid text := (select auth.uid())::text;
  bond public.rivalry_bonds%rowtype;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  select * into bond from public.rivalry_bonds where id = p_bond_id;
  if bond.id is null or (uid <> bond.user_a and uid <> bond.user_b) then
    raise exception 'not_participant';
  end if;
  if bond.status <> 'active' then
    raise exception 'not_active';
  end if;
  update public.rivalry_bonds
    set status = 'ended', updated_at = now()
    where id = bond.id;
  insert into public.rivalry_ledger (bond_id, kind, points_a, points_b, body, author_id, source_key)
  values (bond.id, 'system', 0, 0, 'Rivalry Bond ended.', uid, 'system:end')
  on conflict (bond_id, source_key) do nothing;
end;
$$;

create or replace function public.kickfeed_post_rivalry_banter(p_bond_id uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid text := (select auth.uid())::text;
  bond public.rivalry_bonds%rowtype;
  line text;
  entry_id uuid;
  recent_count int;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  select * into bond from public.rivalry_bonds where id = p_bond_id;
  if bond.id is null or (uid <> bond.user_a and uid <> bond.user_b) then
    raise exception 'not_participant';
  end if;
  if bond.status <> 'active' then
    raise exception 'not_active';
  end if;
  if private.rivalry_blocked(bond.user_a, bond.user_b) then
    raise exception 'blocked';
  end if;

  line := btrim(regexp_replace(coalesce(p_body, ''), '[[:space:]]+', ' ', 'g'));
  if line is null or char_length(line) < 1 or char_length(line) > 160 then
    raise exception 'bad_banter';
  end if;

  if exists (
    select 1
    from public.rivalry_ledger l
    where l.bond_id = bond.id
      and l.kind = 'banter'
      and l.author_id = uid
      and l.created_at > now() - interval '20 seconds'
  ) then
    raise exception 'slow_mode';
  end if;

  select count(*) into recent_count
  from public.rivalry_ledger l
  where l.bond_id = bond.id
    and l.kind = 'banter'
    and l.author_id = uid
    and l.created_at > now() - interval '2 minutes';
  if recent_count >= 8 then
    raise exception 'slow_mode';
  end if;

  insert into public.rivalry_ledger (bond_id, kind, points_a, points_b, body, author_id)
  values (bond.id, 'banter', 0, 0, line, uid)
  returning id into entry_id;

  update public.rivalry_bonds set updated_at = now() where id = bond.id;
  return entry_id;
end;
$$;

create or replace function public.kickfeed_sync_rivalry_ledger(p_bond_id uuid, p_matches jsonb)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid text := (select auth.uid())::text;
  bond public.rivalry_bonds%rowtype;
  rec record;
  fixture_id text;
  home_team_id text;
  away_team_id text;
  hs int;
  aws int;
  home_aliases text[];
  away_aliases text[];
  match_aliases text[];
  ids text[];
  home_is_a boolean;
  home_is_b boolean;
  away_is_a boolean;
  away_is_b boolean;
  a_is_home boolean;
  award_a int;
  award_b int;
  line text;
  home_name text;
  away_name text;
  pred_a_home int;
  pred_a_away int;
  pred_b_home int;
  pred_b_away int;
  points_pick_a int;
  points_pick_b int;
  error_a int;
  error_b int;
  inserted_id uuid;
  added int := 0;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  select * into bond from public.rivalry_bonds where id = p_bond_id;
  if bond.id is null or (uid <> bond.user_a and uid <> bond.user_b) then
    raise exception 'not_participant';
  end if;
  if private.rivalry_blocked(bond.user_a, bond.user_b) then
    raise exception 'blocked';
  end if;
  if bond.status <> 'active' then
    raise exception 'not_active';
  end if;
  if p_matches is null or jsonb_typeof(p_matches) <> 'array' then
    raise exception 'bad_matches';
  end if;

  for rec in
    select t.value, t.ord
    from jsonb_array_elements(p_matches) with ordinality as t(value, ord)
  loop
    exit when rec.ord > 40;
    if jsonb_typeof(rec.value) is distinct from 'object' then
      continue;
    end if;

    fixture_id := btrim(coalesce(rec.value->>'match_id', ''));
    home_team_id := btrim(coalesce(rec.value->>'home_team_id', ''));
    away_team_id := btrim(coalesce(rec.value->>'away_team_id', ''));
    if fixture_id !~ '^[A-Za-z0-9][A-Za-z0-9:_-]{0,79}$' then
      continue;
    end if;
    if home_team_id !~ '^[A-Za-z0-9][A-Za-z0-9:_-]{0,39}$' then
      continue;
    end if;
    if away_team_id !~ '^[A-Za-z0-9][A-Za-z0-9:_-]{0,39}$' then
      continue;
    end if;
    if coalesce(rec.value->>'home_score', '') !~ '^[0-9]+$'
       or coalesce(rec.value->>'away_score', '') !~ '^[0-9]+$' then
      continue;
    end if;
    hs := (rec.value->>'home_score')::int;
    aws := (rec.value->>'away_score')::int;
    if hs > 30 or aws > 30 then
      continue;
    end if;

    home_aliases := private.rivalry_text_ids(rec.value->'home_alias_ids', 8);
    away_aliases := private.rivalry_text_ids(rec.value->'away_alias_ids', 8);
    match_aliases := private.rivalry_text_ids(rec.value->'alias_ids', 8);

    home_is_a := home_team_id = bond.club_a_id or bond.club_a_id = any (home_aliases);
    home_is_b := home_team_id = bond.club_b_id or bond.club_b_id = any (home_aliases);
    away_is_a := away_team_id = bond.club_a_id or bond.club_a_id = any (away_aliases);
    away_is_b := away_team_id = bond.club_b_id or bond.club_b_id = any (away_aliases);

    if home_is_a and away_is_b and not home_is_b and not away_is_a then
      a_is_home := true;
    elsif home_is_b and away_is_a and not home_is_a and not away_is_b then
      a_is_home := false;
    else
      a_is_home := null;
    end if;

    if a_is_home is not null then
      if a_is_home then
        home_name := bond.club_a_name;
        away_name := bond.club_b_name;
      else
        home_name := bond.club_b_name;
        away_name := bond.club_a_name;
      end if;
      if hs = aws then
        award_a := 1;
        award_b := 1;
        line := home_name || ' ' || hs::text || '–' || aws::text || ' ' || away_name || '. Draw, 1 each.';
      elsif (a_is_home and hs > aws) or (not a_is_home and aws > hs) then
        award_a := 3;
        award_b := 0;
        line := home_name || ' ' || hs::text || '–' || aws::text || ' ' || away_name || '. 3 to ' || bond.club_a_name || '.';
      else
        award_a := 0;
        award_b := 3;
        line := home_name || ' ' || hs::text || '–' || aws::text || ' ' || away_name || '. 3 to ' || bond.club_b_name || '.';
      end if;
      inserted_id := null;
      insert into public.rivalry_ledger (
        bond_id, kind, match_id, points_a, points_b, body, source_key, created_at
      )
      values (
        bond.id,
        'real_h2h',
        fixture_id,
        award_a,
        award_b,
        left(line, 280),
        'real:' || fixture_id,
        now() + (rec.ord * interval '1 millisecond')
      )
      on conflict (bond_id, source_key) do nothing
      returning id into inserted_id;
      if inserted_id is not null then
        added := added + 1;
      end if;
    end if;

    ids := array[fixture_id] || match_aliases;
    pred_a_home := null;
    pred_a_away := null;
    pred_b_home := null;
    pred_b_away := null;
    select p.home_score, p.away_score
      into pred_a_home, pred_a_away
    from public.predictions p
    where p.user_id = bond.user_a
      and p.match_id = any (ids)
    order by case when p.match_id = fixture_id then 0 else 1 end
    limit 1;
    select p.home_score, p.away_score
      into pred_b_home, pred_b_away
    from public.predictions p
    where p.user_id = bond.user_b
      and p.match_id = any (ids)
    order by case when p.match_id = fixture_id then 0 else 1 end
    limit 1;

    if pred_a_home is not null and pred_b_home is not null then
      points_pick_a := private.rivalry_pick_points(pred_a_home, pred_a_away, hs, aws);
      points_pick_b := private.rivalry_pick_points(pred_b_home, pred_b_away, hs, aws);
      error_a := private.rivalry_pick_error(pred_a_home, pred_a_away, hs, aws);
      error_b := private.rivalry_pick_error(pred_b_home, pred_b_away, hs, aws);
      if points_pick_a > points_pick_b or (points_pick_a = points_pick_b and error_a < error_b) then
        award_a := 1;
        award_b := 0;
        line := 'Closer prediction takes 1.';
      elsif points_pick_b > points_pick_a or (points_pick_a = points_pick_b and error_b < error_a) then
        award_a := 0;
        award_b := 1;
        line := 'Closer prediction takes 1.';
      else
        award_a := 0;
        award_b := 0;
        line := 'Level prediction. No points.';
      end if;
      inserted_id := null;
      insert into public.rivalry_ledger (
        bond_id, kind, match_id, points_a, points_b, body, source_key, created_at
      )
      values (
        bond.id,
        'prediction',
        fixture_id,
        award_a,
        award_b,
        line,
        'pred:' || fixture_id,
        now() + (rec.ord * interval '1 millisecond')
      )
      on conflict (bond_id, source_key) do nothing
      returning id into inserted_id;
      if inserted_id is not null then
        added := added + 1;
      end if;
    end if;
  end loop;

  update public.rivalry_bonds b
    set points_a = coalesce((
          select sum(l.points_a)::int from public.rivalry_ledger l where l.bond_id = b.id
        ), 0),
        points_b = coalesce((
          select sum(l.points_b)::int from public.rivalry_ledger l where l.bond_id = b.id
        ), 0),
        updated_at = now()
    where b.id = bond.id;

  return added;
end;
$$;

-- Text ids from a jsonb array. Empty when the value is missing or not an array.
create or replace function private.rivalry_text_ids(p_value jsonb, p_limit int)
returns text[]
language sql
stable
set search_path = ''
as $$
  select coalesce(array_agg(x), '{}'::text[])
  from (
    select distinct btrim(item) as x
    from jsonb_array_elements_text(
      case when jsonb_typeof(p_value) = 'array' then p_value else '[]'::jsonb end
    ) as item
    where char_length(btrim(item)) between 1 and 40
      and btrim(item) !~ '[[:space:]]'
    limit greatest(coalesce(p_limit, 0), 0)
  ) s;
$$;

revoke all on function private.rivalry_text_ids(jsonb, int) from public, anon, authenticated;

revoke all on function public.kickfeed_set_rivalry_club(text, text, text, text, text, text) from public, anon;
revoke all on function public.kickfeed_invite_rivalry(text) from public, anon;
revoke all on function public.kickfeed_respond_rivalry(uuid, boolean) from public, anon;
revoke all on function public.kickfeed_end_rivalry(uuid) from public, anon;
revoke all on function public.kickfeed_post_rivalry_banter(uuid, text) from public, anon;
revoke all on function public.kickfeed_sync_rivalry_ledger(uuid, jsonb) from public, anon;

grant execute on function public.kickfeed_set_rivalry_club(text, text, text, text, text, text) to authenticated;
grant execute on function public.kickfeed_invite_rivalry(text) to authenticated;
grant execute on function public.kickfeed_respond_rivalry(uuid, boolean) to authenticated;
grant execute on function public.kickfeed_end_rivalry(uuid) to authenticated;
grant execute on function public.kickfeed_post_rivalry_banter(uuid, text) to authenticated;
grant execute on function public.kickfeed_sync_rivalry_ledger(uuid, jsonb) to authenticated;

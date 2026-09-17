-- KickFeed profiles — apply in the Supabase SQL editor when you want a row per auth user.
-- Not required for CI, Expo demo mode, or email sign-in (session comes from auth.users).
--
-- User ids: public.profiles.id = auth.users.id (uuid). Keep KickFeed AsyncStorage
-- predictions / MOTM / favorites keyed by that same id so a later leaderboard batch
-- can attach rows without remapping.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  handle text unique,
  display_name text,
  bio text,
  avatar_color text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles are readable by signed-in users"
  on public.profiles for select
  to authenticated
  using (true);

create policy "users can insert their own profile"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

create policy "users can update their own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, handle, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'handle', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Next batch (not applied here): prediction leaderboards
--   create table public.predictions (
--     match_id text not null,
--     user_id uuid not null references public.profiles (id) on delete cascade,
--     home_score int not null,
--     away_score int not null,
--     primary key (match_id, user_id)
--   );

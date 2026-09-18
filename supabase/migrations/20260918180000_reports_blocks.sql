-- KickFeed reports + blocks.
-- Identity: reporter_id / blocker_id / target_user_id / blocked_id are the same
-- key as AsyncStorage social state — demo seed (`maya`) OR auth.users uuid (text).
-- Live writes: RLS only allows auth.uid()::text, so demo ids stay local.
-- No moderation inbox / admin dashboard in this batch.

create table if not exists public.user_blocks (
  blocker_id text not null,
  blocked_id text not null,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint user_blocks_not_self check (blocker_id <> blocked_id)
);

create index if not exists user_blocks_blocked_id_idx on public.user_blocks (blocked_id);

create table if not exists public.user_reports (
  id text primary key,
  reporter_id text not null,
  target_type text not null check (target_type in ('post', 'profile', 'comment')),
  target_id text not null,
  target_user_id text not null,
  reason text not null,
  created_at timestamptz not null default now(),
  constraint user_reports_reason_len check (char_length(trim(reason)) between 3 and 280),
  constraint user_reports_not_self check (reporter_id <> target_user_id),
  constraint user_reports_once unique (reporter_id, target_type, target_id)
);

create index if not exists user_reports_reporter_id_idx on public.user_reports (reporter_id);
create index if not exists user_reports_target_user_id_idx on public.user_reports (target_user_id);

alter table public.user_blocks enable row level security;
alter table public.user_reports enable row level security;

drop policy if exists "users can read their own blocks" on public.user_blocks;
create policy "users can read their own blocks"
  on public.user_blocks for select
  to authenticated
  using ((select auth.uid())::text = blocker_id);

drop policy if exists "users can insert their own blocks" on public.user_blocks;
create policy "users can insert their own blocks"
  on public.user_blocks for insert
  to authenticated
  with check (
    (select auth.uid())::text = blocker_id
    and blocker_id <> blocked_id
  );

drop policy if exists "users can delete their own blocks" on public.user_blocks;
create policy "users can delete their own blocks"
  on public.user_blocks for delete
  to authenticated
  using ((select auth.uid())::text = blocker_id);

drop policy if exists "users can read their own reports" on public.user_reports;
create policy "users can read their own reports"
  on public.user_reports for select
  to authenticated
  using ((select auth.uid())::text = reporter_id);

drop policy if exists "users can insert their own reports" on public.user_reports;
create policy "users can insert their own reports"
  on public.user_reports for insert
  to authenticated
  with check (
    (select auth.uid())::text = reporter_id
    and reporter_id <> target_user_id
  );

revoke all on public.user_blocks from anon, public;
revoke all on public.user_reports from anon, public;
grant select, insert, delete on public.user_blocks to authenticated;
grant select, insert on public.user_reports to authenticated;

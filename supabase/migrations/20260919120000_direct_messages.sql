-- KickFeed 1:1 direct messages.
-- Identity: sender_id / recipient_id are the same key as AsyncStorage social
-- state — demo seed (`maya`) OR auth.users uuid (text).
-- Live writes: RLS only allows auth.uid()::text, so demo ids stay local.
-- Text only. No group chats. Blocks (either direction) hide the thread.
-- Apply after 20260918180000_reports_blocks.sql.
--
-- Karol: SQL Editor (or supabase db push) → run this file. No secrets in CI.

-- Incoming blocks: so the client can hide Message / threads when someone
-- blocked you. Does not change the Blocked fans list (still outgoing only).
drop policy if exists "users can read blocks targeting them" on public.user_blocks;
create policy "users can read blocks targeting them"
  on public.user_blocks for select
  to authenticated
  using ((select auth.uid())::text = blocked_id);

-- Reports of a DM use target_type = 'dm'. Existing rows stay valid.
alter table public.user_reports drop constraint if exists user_reports_target_type_check;
alter table public.user_reports
  add constraint user_reports_target_type_check
  check (target_type in ('post', 'profile', 'comment', 'dm'));

create table if not exists public.direct_messages (
  id text primary key,
  sender_id text not null,
  recipient_id text not null,
  body text not null,
  created_at timestamptz not null default now(),
  constraint direct_messages_not_self check (sender_id <> recipient_id),
  constraint direct_messages_body_len check (char_length(trim(body)) between 1 and 1000)
);

create index if not exists direct_messages_sender_id_created_at_idx
  on public.direct_messages (sender_id, created_at desc);

create index if not exists direct_messages_recipient_id_created_at_idx
  on public.direct_messages (recipient_id, created_at desc);

create index if not exists direct_messages_pair_created_at_idx
  on public.direct_messages (sender_id, recipient_id, created_at desc);

alter table public.direct_messages enable row level security;

-- Participant can read a row unless either person blocked the other.
-- Incoming-block SELECT policy above lets this EXISTS see both directions.
drop policy if exists "participants can read their dms" on public.direct_messages;
create policy "participants can read their dms"
  on public.direct_messages for select
  to authenticated
  using (
    (
      (select auth.uid())::text = sender_id
      or (select auth.uid())::text = recipient_id
    )
    and not exists (
      select 1
      from public.user_blocks b
      where (b.blocker_id = sender_id and b.blocked_id = recipient_id)
         or (b.blocker_id = recipient_id and b.blocked_id = sender_id)
    )
  );

drop policy if exists "users can send their own dms" on public.direct_messages;
create policy "users can send their own dms"
  on public.direct_messages for insert
  to authenticated
  with check (
    (select auth.uid())::text = sender_id
    and sender_id <> recipient_id
    and char_length(trim(body)) between 1 and 1000
    and not exists (
      select 1
      from public.user_blocks b
      where (b.blocker_id = sender_id and b.blocked_id = recipient_id)
         or (b.blocker_id = recipient_id and b.blocked_id = sender_id)
    )
  );

revoke all on public.direct_messages from anon, public;
grant select, insert on public.direct_messages to authenticated;

-- Server-side slow-mode (mirrors client 20s / thread + 8 / 2 min).
-- Helper lives in private so it is not an RPC. search_path pinned.
create schema if not exists private;

create or replace function private.dm_rate_limited(p_sender text, p_recipient text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (
      select 1
      from public.direct_messages
      where sender_id = p_sender
        and recipient_id = p_recipient
        and created_at > now() - interval '20 seconds'
    )
    or (
      (
        select count(*)::int
        from public.direct_messages
        where sender_id = p_sender
          and created_at > now() - interval '2 minutes'
      ) >= 8
    );
$$;

revoke all on function private.dm_rate_limited(text, text) from public, anon, authenticated;

create or replace function private.dm_enforce_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Client timestamps cannot backdate a row past the slow-mode window.
  new.created_at := now();
  if private.dm_rate_limited(new.sender_id, new.recipient_id) then
    raise exception 'slow_mode';
  end if;
  return new;
end;
$$;

revoke all on function private.dm_enforce_rate_limit() from public, anon, authenticated;

drop trigger if exists direct_messages_rate_limit on public.direct_messages;
create trigger direct_messages_rate_limit
  before insert on public.direct_messages
  for each row
  execute function private.dm_enforce_rate_limit();

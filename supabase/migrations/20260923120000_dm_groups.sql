-- Group chats extend direct_messages. 1:1 rows stay sender + recipient.
-- A group row sets group_id and leaves recipient_id null.
-- share jsonb is an in-app post card (no url). Demo ids stay on-device;
-- RLS only allows auth.uid()::text.
-- Apply after 20260919133000_dm_stamp_created_at.sql.

create table if not exists public.dm_groups (
  id text primary key,
  title text,
  created_by text not null,
  created_at timestamptz not null default now(),
  constraint dm_groups_id_len check (char_length(id) between 4 and 80),
  constraint dm_groups_title_len check (title is null or char_length(btrim(title)) between 1 and 80)
);

create table if not exists public.dm_group_members (
  group_id text not null references public.dm_groups (id) on delete cascade,
  user_id text not null,
  created_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create index if not exists dm_group_members_user_id_idx
  on public.dm_group_members (user_id);

alter table public.direct_messages add column if not exists group_id text;
alter table public.direct_messages add column if not exists share jsonb;

alter table public.direct_messages alter column recipient_id drop not null;

alter table public.direct_messages drop constraint if exists direct_messages_not_self;
alter table public.direct_messages drop constraint if exists direct_messages_shape;
alter table public.direct_messages
  add constraint direct_messages_shape check (
    (
      group_id is null
      and recipient_id is not null
      and sender_id <> recipient_id
    )
    or (
      group_id is not null
      and recipient_id is null
    )
  );

alter table public.direct_messages drop constraint if exists direct_messages_group_fk;
alter table public.direct_messages
  add constraint direct_messages_group_fk
  foreign key (group_id) references public.dm_groups (id) on delete cascade;

alter table public.direct_messages drop constraint if exists direct_messages_share_obj;
alter table public.direct_messages
  add constraint direct_messages_share_obj check (
    share is null
    or (
      jsonb_typeof(share) = 'object'
      and not (share ? 'url')
      and not (share ? 'href')
      and not (share ? 'link')
      and char_length(share::text) <= 2000
    )
  );

create index if not exists direct_messages_group_id_created_at_idx
  on public.direct_messages (group_id, created_at desc);

alter table public.dm_groups enable row level security;
alter table public.dm_group_members enable row level security;

-- Security definer so policies can see membership without recursing on RLS.
create schema if not exists private;

create or replace function private.dm_is_group_member(p_group text, p_user text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.dm_group_members m
    where m.group_id = p_group
      and m.user_id = p_user
  );
$$;

create or replace function private.dm_group_has_block(p_group text, p_user text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.dm_group_members m
    join public.user_blocks b
      on (b.blocker_id = p_user and b.blocked_id = m.user_id)
      or (b.blocker_id = m.user_id and b.blocked_id = p_user)
    where m.group_id = p_group
      and m.user_id <> p_user
  );
$$;

revoke all on function private.dm_is_group_member(text, text) from public, anon;
revoke all on function private.dm_group_has_block(text, text) from public, anon;
grant execute on function private.dm_is_group_member(text, text) to authenticated;
grant execute on function private.dm_group_has_block(text, text) to authenticated;

drop policy if exists "members can read groups" on public.dm_groups;
create policy "members can read groups"
  on public.dm_groups for select
  to authenticated
  using (
    created_by = (select auth.uid())::text
    or private.dm_is_group_member(id, (select auth.uid())::text)
  );

drop policy if exists "users can create groups" on public.dm_groups;
create policy "users can create groups"
  on public.dm_groups for insert
  to authenticated
  with check ((select auth.uid())::text = created_by);

drop policy if exists "members can read membership" on public.dm_group_members;
create policy "members can read membership"
  on public.dm_group_members for select
  to authenticated
  using (private.dm_is_group_member(group_id, (select auth.uid())::text));

-- Creator adds every member, including themselves. Blocks in either direction refuse the row.
drop policy if exists "creator can add members" on public.dm_group_members;
create policy "creator can add members"
  on public.dm_group_members for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.dm_groups g
      where g.id = group_id
        and g.created_by = (select auth.uid())::text
    )
    and not exists (
      select 1
      from public.user_blocks b
      where (b.blocker_id = (select auth.uid())::text and b.blocked_id = user_id)
         or (b.blocker_id = user_id and b.blocked_id = (select auth.uid())::text)
    )
  );

drop policy if exists "members can leave" on public.dm_group_members;
create policy "members can leave"
  on public.dm_group_members for delete
  to authenticated
  using (user_id = (select auth.uid())::text);

revoke all on public.dm_groups from anon, public;
revoke all on public.dm_group_members from anon, public;
-- Creates go through kickfeed_create_dm_group so the group and its members
-- commit together. Direct insert is revoked; select/leave stay.
grant select on public.dm_groups to authenticated;
grant select, delete on public.dm_group_members to authenticated;

-- One transaction: a block or member failure rolls the group row back.
-- Mutual friends are enforced in the client; Postgres has no friends graph.
create or replace function public.kickfeed_create_dm_group(
  p_id text,
  p_title text,
  p_member_ids text[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid text := (select auth.uid())::text;
  member_count int;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if p_id is null or char_length(p_id) < 4 or char_length(p_id) > 80 then
    raise exception 'bad_group';
  end if;
  if p_title is not null and (char_length(btrim(p_title)) < 1 or char_length(btrim(p_title)) > 80) then
    raise exception 'bad_title';
  end if;
  if p_member_ids is null or not (uid = any (p_member_ids)) then
    raise exception 'bad_members';
  end if;

  select count(distinct member_id) into member_count
  from unnest(p_member_ids) as members(member_id);
  if member_count < 3 or member_count > 21 then
    raise exception 'bad_members';
  end if;

  if exists (
    select 1
    from unnest(p_member_ids) as members(member_id)
    where member_id <> uid
      and exists (
        select 1
        from public.user_blocks b
        where (b.blocker_id = uid and b.blocked_id = member_id)
           or (b.blocker_id = member_id and b.blocked_id = uid)
      )
  ) then
    raise exception 'blocked';
  end if;

  insert into public.dm_groups (id, title, created_by)
  values (p_id, nullif(btrim(p_title), ''), uid);

  insert into public.dm_group_members (group_id, user_id)
  select distinct p_id, member_id
  from unnest(p_member_ids) as members(member_id);
end;
$$;

revoke insert on public.dm_groups from anon, authenticated, public;
revoke insert on public.dm_group_members from anon, authenticated, public;

revoke all on function public.kickfeed_create_dm_group(text, text, text[]) from public, anon;
grant execute on function public.kickfeed_create_dm_group(text, text, text[]) to authenticated;

-- Read / send: 1:1 unchanged, plus group rows for current members.
-- A group send is refused when the sender is blocked with any other member.
drop policy if exists "participants can read their dms" on public.direct_messages;
create policy "participants can read their dms"
  on public.direct_messages for select
  to authenticated
  using (
    (
      group_id is null
      and (
        (select auth.uid())::text = sender_id
        or (select auth.uid())::text = recipient_id
      )
      and not exists (
        select 1
        from public.user_blocks b
        where (b.blocker_id = sender_id and b.blocked_id = recipient_id)
           or (b.blocker_id = recipient_id and b.blocked_id = sender_id)
      )
    )
    or (
      group_id is not null
      and private.dm_is_group_member(group_id, (select auth.uid())::text)
      and not exists (
        select 1
        from public.user_blocks b
        where (b.blocker_id = (select auth.uid())::text and b.blocked_id = sender_id)
           or (b.blocker_id = sender_id and b.blocked_id = (select auth.uid())::text)
      )
    )
  );

drop policy if exists "users can send their own dms" on public.direct_messages;
create policy "users can send their own dms"
  on public.direct_messages for insert
  to authenticated
  with check (
    (select auth.uid())::text = sender_id
    and char_length(btrim(body)) between 1 and 1000
    and (
      (
        group_id is null
        and recipient_id is not null
        and sender_id <> recipient_id
        and not exists (
          select 1
          from public.user_blocks b
          where (b.blocker_id = sender_id and b.blocked_id = recipient_id)
             or (b.blocker_id = recipient_id and b.blocked_id = sender_id)
        )
      )
      or (
        group_id is not null
        and recipient_id is null
        and private.dm_is_group_member(group_id, (select auth.uid())::text)
        and not private.dm_group_has_block(group_id, (select auth.uid())::text)
      )
    )
  );

-- Slow-mode now knows group threads. 1:1 cooldown stays per recipient.
-- Burst still counts every send by this user, including groups.
create or replace function private.dm_rate_limited(p_sender text, p_recipient text, p_group text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (
      p_group is null
      and exists (
        select 1
        from public.direct_messages
        where sender_id = p_sender
          and recipient_id = p_recipient
          and group_id is null
          and created_at > now() - interval '20 seconds'
      )
    )
    or (
      p_group is not null
      and exists (
        select 1
        from public.direct_messages
        where sender_id = p_sender
          and group_id = p_group
          and created_at > now() - interval '20 seconds'
      )
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

revoke all on function private.dm_rate_limited(text, text, text) from public, anon, authenticated;

create or replace function private.dm_enforce_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Client timestamps cannot backdate a row past the slow-mode window.
  new.created_at := now();
  if private.dm_rate_limited(new.sender_id, new.recipient_id, new.group_id) then
    raise exception 'slow_mode';
  end if;
  return new;
end;
$$;

revoke all on function private.dm_enforce_rate_limit() from public, anon, authenticated;

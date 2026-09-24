-- Match Tape (Zápasová páska). Apply after 20260924120000_rivalry_bonds.sql
-- and 20260923120000_dm_groups.sql (direct_messages, dm_groups, membership helpers).
--
-- Binds an existing 1:1 DM or group chat to one fixture. While the attachment
-- is active, a message may carry a tape jsonb anchor (goal, card, or sub).
-- After archive (full time, or the fans tap Archive) the thread is read-only
-- until someone attaches a new match. One active attachment per thread.
--
-- No Edge Function. Clients poll the football BFF and call
-- kickfeed_archive_match_tape when the fixture is FT. Writes go through the
-- kickfeed_*match_tape RPCs. Demo ids never pass auth.uid(), so they stay
-- on the device.

alter table public.direct_messages add column if not exists tape jsonb;

alter table public.direct_messages drop constraint if exists direct_messages_tape_obj;
alter table public.direct_messages
  add constraint direct_messages_tape_obj check (
    tape is null
    or (
      jsonb_typeof(tape) = 'object'
      and tape ? 'matchId'
      and tape ? 'eventKey'
      and tape ? 'minute'
      and tape ? 'eventType'
      and tape ? 'label'
      and not (tape ? 'url')
      and not (tape ? 'href')
      and not (tape ? 'link')
      and (tape->>'eventType') in ('goal', 'yellow', 'red', 'sub')
      and (tape->>'minute') ~ '^[0-9]{1,3}$'
      and (tape->>'minute')::int between 0 and 130
      and char_length(tape->>'eventKey') between 1 and 80
      and char_length(btrim(tape->>'label')) between 1 and 80
      and (tape->>'matchId') ~ '^[A-Za-z0-9][A-Za-z0-9:_-]{0,63}$'
      and char_length(tape::text) <= 800
    )
  );

create table if not exists public.match_tape_attachments (
  id text primary key,
  kind text not null,
  thread_key text not null,
  match_id text not null,
  status text not null,
  attached_by text not null,
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  home_name text not null,
  away_name text not null,
  home_short text not null,
  away_short text not null,
  kickoff timestamptz,
  home_score int,
  away_score int,
  minute int,
  match_status text,
  constraint match_tape_id_len check (char_length(id) between 4 and 80),
  constraint match_tape_kind check (kind in ('dm', 'group')),
  constraint match_tape_status check (status in ('active', 'archived')),
  constraint match_tape_match_id check (match_id ~ '^[A-Za-z0-9][A-Za-z0-9:_-]{0,63}$'),
  constraint match_tape_names check (
    char_length(btrim(home_name)) between 1 and 80
    and char_length(btrim(away_name)) between 1 and 80
    and char_length(home_short) between 1 and 8
    and char_length(away_short) between 1 and 8
  ),
  constraint match_tape_archive_shape check (
    (status = 'active' and archived_at is null)
    or (status = 'archived' and archived_at is not null)
  ),
  constraint match_tape_score check (
    (home_score is null or home_score between 0 and 30)
    and (away_score is null or away_score between 0 and 30)
    and (minute is null or minute between 0 and 130)
    and (
      match_status is null
      or match_status in ('upcoming', 'live', 'ht', 'finished')
    )
  )
);

create unique index if not exists match_tape_one_active
  on public.match_tape_attachments (thread_key)
  where status = 'active';

create index if not exists match_tape_thread_created_idx
  on public.match_tape_attachments (thread_key, created_at desc);

alter table public.match_tape_attachments enable row level security;

create schema if not exists private;

create or replace function private.match_tape_can_read(p_kind text, p_thread text, p_user text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_left text;
  v_right text;
begin
  if p_user is null or p_thread is null then
    return false;
  end if;
  if p_kind = 'group' then
    return private.dm_is_group_member(p_thread, p_user)
      and not private.dm_group_has_block(p_thread, p_user);
  end if;
  if p_kind <> 'dm' then
    return false;
  end if;
  v_left := split_part(p_thread, '::', 1);
  v_right := split_part(p_thread, '::', 2);
  if v_left = '' or v_right = '' or split_part(p_thread, '::', 3) <> '' then
    return false;
  end if;
  if p_user <> v_left and p_user <> v_right then
    return false;
  end if;
  return not exists (
    select 1
    from public.user_blocks b
    where (b.blocker_id = v_left and b.blocked_id = v_right)
       or (b.blocker_id = v_right and b.blocked_id = v_left)
  );
end;
$$;

revoke all on function private.match_tape_can_read(text, text, text) from public, anon;
grant execute on function private.match_tape_can_read(text, text, text) to authenticated;

drop policy if exists "participants can read match tapes" on public.match_tape_attachments;
create policy "participants can read match tapes"
  on public.match_tape_attachments for select
  to authenticated
  using (private.match_tape_can_read(kind, thread_key, (select auth.uid())::text));

revoke all on public.match_tape_attachments from anon, public;
grant select on public.match_tape_attachments to authenticated;

create or replace function public.kickfeed_attach_match_tape(
  p_id text,
  p_kind text,
  p_thread_key text,
  p_match_id text,
  p_home_name text,
  p_away_name text,
  p_home_short text,
  p_away_short text,
  p_kickoff timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid text := (select auth.uid())::text;
  v_left text;
  v_right text;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_id is null or char_length(p_id) < 4 or char_length(p_id) > 80 then
    raise exception 'bad_tape';
  end if;
  if p_kind not in ('dm', 'group') then
    raise exception 'bad_thread';
  end if;
  if p_match_id is null or p_match_id !~ '^[A-Za-z0-9][A-Za-z0-9:_-]{0,63}$' then
    raise exception 'bad_match';
  end if;
  if p_home_name is null or char_length(btrim(p_home_name)) < 1 or char_length(btrim(p_home_name)) > 80
     or p_away_name is null or char_length(btrim(p_away_name)) < 1 or char_length(btrim(p_away_name)) > 80
     or p_home_short is null or char_length(p_home_short) < 1 or char_length(p_home_short) > 8
     or p_away_short is null or char_length(p_away_short) < 1 or char_length(p_away_short) > 8 then
    raise exception 'bad_teams';
  end if;

  if p_kind = 'dm' then
    v_left := split_part(p_thread_key, '::', 1);
    v_right := split_part(p_thread_key, '::', 2);
    if v_left = '' or v_right = '' or split_part(p_thread_key, '::', 3) <> ''
       or (v_left collate "C") >= (v_right collate "C") then
      raise exception 'bad_thread';
    end if;
    if uid <> v_left and uid <> v_right then
      raise exception 'not_member';
    end if;
    if exists (
      select 1
      from public.user_blocks b
      where (b.blocker_id = v_left and b.blocked_id = v_right)
         or (b.blocker_id = v_right and b.blocked_id = v_left)
    ) then
      raise exception 'blocked';
    end if;
  else
    if not private.dm_is_group_member(p_thread_key, uid) then
      raise exception 'not_member';
    end if;
    if private.dm_group_has_block(p_thread_key, uid) then
      raise exception 'blocked';
    end if;
  end if;

  if exists (
    select 1
    from public.match_tape_attachments
    where thread_key = p_thread_key
      and status = 'active'
  ) then
    raise exception 'tape_active';
  end if;

  insert into public.match_tape_attachments (
    id, kind, thread_key, match_id, status, attached_by,
    home_name, away_name, home_short, away_short, kickoff
  ) values (
    p_id, p_kind, p_thread_key, p_match_id, 'active', uid,
    btrim(p_home_name), btrim(p_away_name), p_home_short, p_away_short, p_kickoff
  );
exception
  when unique_violation then
    raise exception 'tape_active';
end;
$$;

revoke all on function public.kickfeed_attach_match_tape(text, text, text, text, text, text, text, text, timestamptz) from public, anon;
grant execute on function public.kickfeed_attach_match_tape(text, text, text, text, text, text, text, text, timestamptz) to authenticated;

create or replace function public.kickfeed_archive_match_tape(
  p_id text,
  p_home_score int,
  p_away_score int,
  p_minute int,
  p_match_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid text := (select auth.uid())::text;
  found_row public.match_tape_attachments%rowtype;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_home_score is not null and (p_home_score < 0 or p_home_score > 30) then
    raise exception 'bad_score';
  end if;
  if p_away_score is not null and (p_away_score < 0 or p_away_score > 30) then
    raise exception 'bad_score';
  end if;
  if p_minute is not null and (p_minute < 0 or p_minute > 130) then
    raise exception 'bad_score';
  end if;
  if p_match_status is not null and p_match_status not in ('upcoming', 'live', 'ht', 'finished') then
    raise exception 'bad_score';
  end if;

  select * into found_row
  from public.match_tape_attachments
  where id = p_id;

  if not found then
    raise exception 'not_found';
  end if;
  if not private.match_tape_can_read(found_row.kind, found_row.thread_key, uid) then
    raise exception 'not_member';
  end if;
  if found_row.status = 'archived' then
    return;
  end if;

  update public.match_tape_attachments
  set status = 'archived',
      archived_at = now(),
      home_score = p_home_score,
      away_score = p_away_score,
      minute = p_minute,
      match_status = p_match_status
  where id = p_id
    and status = 'active';
end;
$$;

revoke all on function public.kickfeed_archive_match_tape(text, int, int, int, text) from public, anon;
grant execute on function public.kickfeed_archive_match_tape(text, int, int, int, text) to authenticated;

-- Read-only after the newest attachment is archived. Anchors require the
-- active attachment's match. Captions on an anchor stay short.
create or replace function private.match_tape_guard_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text;
  v_status text;
  v_match text;
begin
  if new.group_id is not null then
    v_key := new.group_id;
  elsif (new.sender_id collate "C") < (new.recipient_id collate "C") then
    v_key := new.sender_id || '::' || new.recipient_id;
  else
    v_key := new.recipient_id || '::' || new.sender_id;
  end if;

  select a.status into v_status
  from public.match_tape_attachments a
  where a.thread_key = v_key
  order by a.created_at desc, a.id desc
  limit 1;

  if v_status = 'archived' then
    raise exception 'tape_locked';
  end if;

  if new.tape is null then
    return new;
  end if;

  if char_length(btrim(new.body)) > 160 then
    raise exception 'tape_caption';
  end if;

  v_match := new.tape->>'matchId';
  if not exists (
    select 1
    from public.match_tape_attachments a
    where a.thread_key = v_key
      and a.status = 'active'
      and a.match_id = v_match
  ) then
    raise exception 'tape_anchor';
  end if;

  return new;
end;
$$;

revoke all on function private.match_tape_guard_message() from public, anon, authenticated;

-- Name sorts before direct_messages_rate_limit so a locked tape
-- reports tape_locked instead of slow_mode.
drop trigger if exists before_match_tape_guard on public.direct_messages;
create trigger before_match_tape_guard
  before insert on public.direct_messages
  for each row
  execute function private.match_tape_guard_message();

-- Follow-up for projects that already applied 20260919120000_direct_messages.sql.
-- Client-supplied created_at used to skip the slow-mode window; the insert
-- trigger now stamps now() so RLS/trigger time is the server clock.
-- Safe to re-run. Greenfield applies this after 19120000 (CREATE OR REPLACE).

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

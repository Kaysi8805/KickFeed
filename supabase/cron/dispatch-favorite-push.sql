-- Schedule favorite-match Expo push. Do NOT run this until:
--   1. 20260923140000_push_devices.sql is applied
--   2. `supabase functions deploy dispatch-favorite-push --no-verify-jwt` succeeded
--   3. PUSH_DISPATCH_SECRET (at least 16 chars) is set on the function
--      and the same value is in Vault as push_dispatch_secret
--   4. Extensions pg_cron and pg_net are enabled
--
-- The function refuses dispatch without the secret. verify_jwt is off so cron
-- does not need the service role key in this SQL.
--
-- Window is 10:00–22:59 UTC, every 10 minutes. England / Slovakia / La Liga
-- kickoffs sit in that band. The function itself only refetches a live league
-- every ~10 minutes and an idle league hourly (see REMOTE_FETCH_*).

-- select vault.create_secret('https://YOUR_PROJECT.supabase.co', 'project_url');
-- select vault.create_secret('paste-the-same-PUSH_DISPATCH_SECRET', 'push_dispatch_secret');

select cron.schedule(
  'kickfeed-favorite-push',
  '*/10 10-22 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
      || '/functions/v1/dispatch-favorite-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-kickfeed-dispatch-secret',
      (select decrypted_secret from vault.decrypted_secrets where name = 'push_dispatch_secret')
    ),
    body := '{"mode":"dispatch"}'::jsonb,
    timeout_milliseconds := 20000
  );
  $$
);

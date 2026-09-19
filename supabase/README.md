# KickFeed Supabase (optional)

Email auth, **prediction leaderboards**, **reports/blocks**, and **1:1 DMs** use `@supabase/supabase-js`. **CI and first-run demo do not need a project.**

1. Create a project at [supabase.com](https://supabase.com).
2. Authentication → Providers → enable **Email**. For local demos, Authentication → Providers → Email → turn **Confirm email** off (or keep it on and click the link).
3. Project Settings → API → copy **Project URL** and **anon public** key into `.env` as `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`. Restart Expo.
4. SQL Editor (or `supabase db push`) → apply:
   - [`migrations/20260917120000_profiles.sql`](migrations/20260917120000_profiles.sql) — `profiles.id` = `auth.users.id`
   - [`migrations/20260917190000_prediction_leaderboards.sql`](migrations/20260917190000_prediction_leaderboards.sql) — `predictions` / `motm_votes`
   - [`migrations/20260917200000_leaderboard_write_lock.sql`](migrations/20260917200000_leaderboard_write_lock.sql) — kickoff lock RPCs; direct writes revoked
   - [`migrations/20260918180000_reports_blocks.sql`](migrations/20260918180000_reports_blocks.sql) — `user_blocks` / `user_reports` with RLS (own rows only)
   - [`migrations/20260919120000_direct_messages.sql`](migrations/20260919120000_direct_messages.sql) — `direct_messages` + incoming-block SELECT + `dm` report target; slow-mode trigger stamps `created_at`
   - [`migrations/20260919133000_dm_stamp_created_at.sql`](migrations/20260919133000_dm_stamp_created_at.sql) — follow-up if 19120000 was already applied: trigger overwrites client `created_at` with `now()`

Identity is the same key as AsyncStorage social state: demo seed (`maya`) **or** `auth.users` uuid (`user_id text`). RLS only allows **reads** of `predictions` / `motm_votes` for signed-in users. Writes go through `kickfeed_upsert_prediction` / `kickfeed_upsert_motm_vote` (server clock vs stored kickoff; client timestamps ignored). Demo ids stay on-device. Live ranking reads Postgres; missing env uses the seeded local board.

Reports and blocks: authenticated users can insert/select their own `user_reports` and insert/select/delete their own `user_blocks`. They can also **select incoming blocks** (`blocked_id = auth.uid()`) so DMs can hide a thread when the other person blocked them. There is no admin inbox in the app. Demo ids never pass `auth.uid()` so they stay in AsyncStorage.

Direct messages: participants select/insert `direct_messages` when they are `sender_id` or `recipient_id` and neither person blocked the other. The insert trigger stamps `created_at := now()` (client clocks ignored) then enforces `slow_mode` (20s / thread + 8 / 2 min). Text 1–1000 chars. No groups, no media.

### Apply notes (Karol)

In the SQL editor, run migrations **in filename order**. If reports/blocks are already applied, run `20260919120000_direct_messages.sql`. If that file was already applied before the `created_at := now()` trigger fix, also run `20260919133000_dm_stamp_created_at.sql` (CREATE OR REPLACE; safe to re-run). Greenfield: both files, in order. No secrets, no client env beyond the existing anon key.

Handles are `localpart_` + 8 hex chars of the user uuid (`fan@gmail.com` vs `fan@yahoo.com` do not collide).

Google / Apple OAuth is **not** in this batch.

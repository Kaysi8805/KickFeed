# KickFeed Supabase (optional)

Email auth, **prediction leaderboards**, **reports/blocks**, **1:1 and group DMs**, **push devices**, and **fantasy mini-leagues** use `@supabase/supabase-js`. **CI and first-run demo do not need a project.**

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
   - [`migrations/20260923120000_dm_groups.sql`](migrations/20260923120000_dm_groups.sql) — group membership on `direct_messages` (`group_id`, optional `share` card) + RLS
   - [`migrations/20260923140000_push_devices.sql`](migrations/20260923140000_push_devices.sql) — Expo push tokens (own-row RLS), dispatch dedupe, fixture cache. Writes go through `kickfeed_upsert_push_device` / `kickfeed_ack_push_fingerprints`. The dispatcher uses the service role.
   - [`migrations/20260923180000_fantasy_leagues.sql`](migrations/20260923180000_fantasy_leagues.sql) — private mini-leagues, memberships, and one XI per gameweek. Writes go through the `kickfeed_*_fantasy_*` RPCs.

Identity is the same key as AsyncStorage social state: demo seed (`maya`) **or** `auth.users` uuid (`user_id text`). RLS only allows **reads** of `predictions` / `motm_votes` for signed-in users. Writes go through `kickfeed_upsert_prediction` / `kickfeed_upsert_motm_vote` (server clock vs stored kickoff; client timestamps ignored). Demo ids stay on-device. Live ranking reads Postgres; missing env uses the seeded local board.

Reports and blocks: authenticated users can insert/select their own `user_reports` and insert/select/delete their own `user_blocks`. They can also **select incoming blocks** (`blocked_id = auth.uid()`) so DMs can hide a thread when the other person blocked them. There is no admin inbox in the app. Demo ids never pass `auth.uid()` so they stay in AsyncStorage.

Direct messages: participants select/insert `direct_messages` when they are `sender_id` or `recipient_id` and neither person blocked the other. The insert trigger stamps `created_at := now()` (client clocks ignored) then enforces `slow_mode` (20s / thread + 8 / 2 min). Text 1–1000 chars.

Group chats use the same `direct_messages` table. A group row sets `group_id` and leaves `recipient_id` null. Membership lives in `dm_groups` / `dm_group_members`. `kickfeed_create_dm_group` inserts the group and every member in one transaction (a block rolls the whole create back). Direct inserts into those tables are revoked. Optional `share` jsonb is an in-app post card and must not include a `url`, `href`, or `link`. Mutual friends are checked in the app; Postgres has no friends graph. Demo ids stay in AsyncStorage.

Push tokens: `push_devices` is readable only by the signed-in owner (`auth.uid() = user_id`). Clients do not insert directly. `kickfeed_upsert_push_device` stores the Expo token, platform, kickoff/goal toggles, and up to 40 favorite team ids (already expanded to API-Football ids). A token moves to the account that just registered it, because the token is the device secret. `push_dispatch_state` and `push_fixture_cache` have RLS on and no policies for `authenticated` — the Edge Function uses the service role. `kickfeed_ack_push_fingerprints` lets the user append only fingerprints that start with their own id, so an alert already shown in the foreground is not sent again. `kickfeed_save_push_dispatch_state` refuses anything except `service_role`.

Fantasy mini-leagues: [`migrations/20260923180000_fantasy_leagues.sql`](migrations/20260923180000_fantasy_leagues.sql) — `fantasy_leagues`, `fantasy_members`, `fantasy_picks`. Members can read their leagues, the other members, and league-mates’ XIs. Direct inserts are revoked. `kickfeed_create_fantasy_league` / `kickfeed_join_fantasy_league` / `kickfeed_upsert_fantasy_pick` are the writes. One XI per user per Friday-UTC gameweek (1 GK, 4 DF, 4 MF, 2 FW). The upsert refuses a gameweek outside the current Friday window, and refuses when the client sends a deadline that `now()` has already passed. Points are not stored — the app counts goals from the catalog. Demo ids stay in AsyncStorage (`kickfeed.fantasy.v1`). Cap: 20 members, 10 leagues per account.

### Apply notes (Karol)

In the SQL editor, run migrations **in filename order**. If reports/blocks are already applied, run `20260919120000_direct_messages.sql`. If that file was already applied before the `created_at := now()` trigger fix, also run `20260919133000_dm_stamp_created_at.sql` (CREATE OR REPLACE; safe to re-run). Group chats: run `20260923120000_dm_groups.sql` after those. Remote match push: run `20260923140000_push_devices.sql` (safe to re-run), deploy `dispatch-favorite-push`, then optionally [`cron/dispatch-favorite-push.sql`](cron/dispatch-favorite-push.sql). Fantasy mini-leagues: run `20260923180000_fantasy_leagues.sql` (safe to re-run) after push devices. Greenfield: every migration file, in order. No secrets, no client env beyond the existing anon key. Do not put `FOOTBALL_API_KEY` or the service role key in Expo or CI.

Handles are `localpart_` + 8 hex chars of the user uuid (`fan@gmail.com` vs `fan@yahoo.com` do not collide).

Google / Apple OAuth is **not** in this batch.

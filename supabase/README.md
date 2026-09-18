# KickFeed Supabase (optional)

Email auth and **prediction leaderboards** use `@supabase/supabase-js`. **CI and first-run demo do not need a project.**

1. Create a project at [supabase.com](https://supabase.com).
2. Authentication → Providers → enable **Email**. For local demos, Authentication → Providers → Email → turn **Confirm email** off (or keep it on and click the link).
3. Project Settings → API → copy **Project URL** and **anon public** key into `.env` as `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`. Restart Expo.
4. SQL Editor (or `supabase db push`) → apply:
   - [`migrations/20260917120000_profiles.sql`](migrations/20260917120000_profiles.sql) — `profiles.id` = `auth.users.id`
   - [`migrations/20260917190000_prediction_leaderboards.sql`](migrations/20260917190000_prediction_leaderboards.sql) — `predictions` / `motm_votes`
   - [`migrations/20260917200000_leaderboard_write_lock.sql`](migrations/20260917200000_leaderboard_write_lock.sql) — kickoff lock RPCs; direct writes revoked

Identity is the same key as AsyncStorage social state: demo seed (`maya`) **or** `auth.users` uuid (`user_id text`). RLS only allows **reads** of `predictions` / `motm_votes` for signed-in users. Writes go through `kickfeed_upsert_prediction` / `kickfeed_upsert_motm_vote` (server clock vs stored kickoff; client timestamps ignored). Demo ids stay on-device. Live ranking reads Postgres; missing env uses the seeded local board.

Handles are `localpart_` + 8 hex chars of the user uuid (`fan@gmail.com` vs `fan@yahoo.com` do not collide).

Google / Apple OAuth is **not** in this batch.

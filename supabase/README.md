# KickFeed Supabase (optional)

Email auth is wired in the Expo app via `@supabase/supabase-js`. **CI and first-run demo do not need a project.** Apply this SQL only when you have created a free Supabase project and want the `profiles` row that later leaderboards will join.

1. Create a project at [supabase.com](https://supabase.com).
2. Authentication → Providers → enable **Email**. For local demos, Authentication → Providers → Email → turn **Confirm email** off (or keep it on and click the link).
3. Project Settings → API → copy **Project URL** and **anon public** key into `.env` as `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`. Restart Expo.
4. Optional: SQL Editor → paste [`migrations/20260917120000_profiles.sql`](migrations/20260917120000_profiles.sql). The app does not call this table yet; identity is `auth.users.id`.
   Handles are `localpart_` + 8 hex chars of the user uuid (`fan@gmail.com` vs `fan@yahoo.com` do not collide). Re-run the `kickfeed_handle_for_user` / `handle_new_user` functions if you applied an older draft of this file.

Google / Apple OAuth and prediction leaderboards are **not** in this batch. Next: leaderboards keyed by `profiles.id` (= `auth.users.id`).

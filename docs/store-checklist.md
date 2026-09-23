# KickFeed store checklist

This is the in-repo list for the first App Store and Play submission. The pull request that added it does **not** upload a build and does **not** call `eas submit`.

Fantasy, in-app purchases, and extra live leagues are out of scope.

## Already in this repo

- Display name **KickFeed**, slug `kickfeed`, iOS bundle and Android package `com.kickfeed.app`.
- Version `1.0.0`, iOS build number `1`, Android `versionCode` `1` (`eas.json` `appVersionSource` is `local`).
- Pitch-neon football icon, splash, favicon, and Android adaptive icons. They replace the Expo template mark. Swap them if a final brand system is commissioned.
- Photo-library purpose string: “KickFeed uses your photo library so you can attach a picture to a post.” Camera, microphone, and location permissions are blocked. Match alerts are opt-in from Profile; iOS uses the system notification prompt.
- `ITSAppUsesNonExemptEncryption` is `false` (standard HTTPS only). Confirm that with whoever files export compliance.
- Privacy Policy and Terms of Use open from **Profile** (Privacy / Terms) and from the sign-in and demo screens, including before an account exists.
- The same paragraphs are in [`landing/privacy.html`](../landing/privacy.html) and [`landing/terms.html`](../landing/terms.html).
- Score picks, Man of the Match, and the leaderboard say they are fan opinions, not betting. There are no stakes and no payouts.
- Report and block copy still distinguishes this device (demo) from KickFeed storage (email account). There is no public moderation inbox.
- Sign-in is email or a demo profile. There are no Apple or Google buttons. Calling the unused OAuth method tells the user those providers are not available.
- Preview and production EAS profiles set `EXPO_PUBLIC_APP_CHANNEL` and point `EXPO_PUBLIC_FOOTBALL_BFF_URL` at `https://kickfeed-football-bff.kaysi8805.workers.dev`. An EAS plaintext variable with the same name still overrides that. The old `<account>` placeholder is ignored and stays on mocks.
- On preview and production, Profile and the sign-in gate do not tell people to set `EXPO_PUBLIC_*` variables. Demo mode is still reachable. Local `expo start` keeps the developer hints.
- Live-mix and editorial-TV banners stay.
- Matches shows “Couldn’t load live scores” and Retry when the catalog fails or the fixture list throws. The match hub shows empty states for a missing lineup, missing stats (no invented possession), and a TV block that fails. Push registration failures stay on Profile and do not take down the screen.
- EAS project id `52a1ee7a-e7db-49c4-bc11-419d316ebd44` is already in `app.json`. It is public config, not a secret.

## Still outside the repo

Do these before a reviewer sees a binary. None of them are done by merging this checklist.

1. **Accounts** — Apple Developer Program and Google Play Console, under the name that will publish KickFeed.
2. **EAS credentials** — `eas login`, then `eas credentials`. iOS needs an APNs key. Android needs a keystore and FCM (`google-services.json`) for remote push. Do not commit those files, Expo access tokens, or the API-Football key.
3. **Build, don’t submit from this change** — `eas build --profile production --platform all` when credentials exist. `eas submit` is a later, separate step.
4. **Supabase on the store build** — set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` as EAS **plaintext** env vars for `preview` and `production`. Without them a production install opens on demo profiles only. Apply the SQL in [`supabase/migrations/`](../supabase/migrations/) and the push dispatcher in the root README. Never put the service role key in the app.
5. **Privacy URL** — deploy [`landing/`](../landing/) and cut DNS for `kickfeed.polsia.app` (see the README landing section). Store forms should use:
   - `https://kickfeed.polsia.app/privacy.html`
   - `https://kickfeed.polsia.app/terms.html`
   Until DNS is live, those URLs 404. The in-app pages still work offline. Do not submit the listing until the public privacy URL loads.
6. **BFF** — `curl -sS https://kickfeed-football-bff.kaysi8805.workers.dev/health` should return `"ok": true` and `"keyConfigured": true`. The API-Football key stays a Worker secret.
7. **Screenshots and listing copy** — capture them on a device or simulator. This repo does not include final marketing screenshots. Age rating, content rights, and the store description are filled in App Store Connect and Play Console.
8. **Account deletion** — Apple requires an in-app way to delete an account that the app lets people create (guideline 5.1.1). This build can sign out, and the privacy policy says how to ask for deletion, but it does **not** delete the email account from KickFeed storage. Do not submit until that path exists.
9. **Icons** — the committed mark is a pitch-green ring and a ball on `#050805`, drawn for this build so the Expo template icon is gone. Replace the PNGs in `assets/images/` if you want a different brand system. Keep them opaque on iOS.

## What a reviewer should see

- The name KickFeed and the dark pitch theme.
- Privacy and Terms without hunting through debug menus.
- No Sign in with Apple or Google.
- Predictions and MOTM labeled as not betting.
- The live banner: England, Slovakia & La Liga live · other leagues mock.
- TV labeled editorial, not a licensed guide.
- A down BFF: Matches shows an error and Retry, not a blank screen.
- A missing lineup: empty copy, not a guessed XI. Stats do not show made-up possession.
- The notification prompt only after **Enable device match alerts**.
- The photo prompt only when attaching a picture, with the KickFeed purpose string.

## Checks

```bash
npm run typecheck
npm test
```

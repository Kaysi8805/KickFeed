# Store submit checklist

One page for App Store Connect and Play Console. This repo does not submit the build.

## Listing fields

| Field | Value |
| --- | --- |
| App name | KickFeed |
| iOS subtitle | Football social & scores |
| SK subtitle | Futbalový feed a výsledky |
| Play short description | Football social feed and live scores. Fan picks, not betting. |
| Full description | See [`store/listing.md`](../store/listing.md) |
| Category | Sports |
| Bundle / package | `com.kickfeed.app` |
| Version | `1.0.0` (iOS build `1`, Android `versionCode` `1`, `runtimeVersion` `1.0.0`) |
| Privacy policy URL | https://kaysi8805.github.io/KickFeed/privacy.html |
| Terms URL | https://kaysi8805.github.io/KickFeed/terms.html |
| Support URL | https://kaysi8805.github.io/KickFeed/support.html |
| Support email | karolurban1@gmail.com |

`kickfeed.polsia.app` is a different page today. Do not use it for the privacy field until that host serves this repo. DNS cutover is separate work.

## Screenshots

Phone captures of the running app, Pitch Neon, for Karol to paste into the consoles:

- [`store/feed.png`](../store/feed.png) — Home feed
- [`store/match.png`](../store/match.png) — Match center
- [`store/messages.png`](../store/messages.png) — Messages
- [`store/matches.png`](../store/matches.png) — Matches date strip

Recapture notes are in [`store/listing.md`](../store/listing.md). These are not a finished marketing set.

## Age rating and content (fill the forms yourself)

- Category is sports. The subject is football.
- Users can post text and a photo, chat on a match, and send direct and group messages. That is user-generated content.
- Score picks and Man of the Match votes have no stakes and no payout. Do not mark the app as gambling.
- No ads, no in-app purchases, no location, no camera. Photos come from the library when someone attaches a picture.
- Not directed at children under 13.
- Account deletion inside the app is not built yet. Sign-out exists. Do not send the binary to review until people can delete an email account.

## Production build

`eas.json` production sets:

- `EXPO_PUBLIC_DEMO_MODE=0` (email sign-in; no demo picker)
- `EXPO_PUBLIC_FOOTBALL_BFF_URL` = the live worker (no client API-Football key, no localhost)
- `EXPO_PUBLIC_SUPABASE_URL` and the public anon key for project `wxgzmwzcxohvqywzdyam`

Preview keeps demo mode on and uses the same prod BFF and Supabase. Development uses loopback `127.0.0.1:8787` and demo mode on.

Push still uses `extra.eas.projectId` `52a1ee7a-e7db-49c4-bc11-419d316ebd44`. APNs and FCM stay in `eas credentials`. Do not commit those files.

```bash
eas build --profile production --platform all
```

Do not run `eas submit` from this change.

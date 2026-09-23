# KickFeed

KickFeed is a cross-platform iOS and Android app (one Expo / React Native codebase) that combines a Facebook-style social feed with FotMob / Flashscore-style football scores, standings, and worldwide league browsing.

v1 is **local-first**: seeded fan profiles for **demo mode**, optional **Supabase email auth**, mock social, and **mock football unless you add a free API-Football key or point the app at the in-repo BFF**. No paid API keys. The football BFF is optional (hides the key and shares the free-tier 100 req/day cache). Email auth is optional — without Supabase env vars the demo picker still works.

## Features

- **Auth** — email/password via **Supabase Auth** when `EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_ANON_KEY` are set. Without those (or tap **Continue with demo**), pick a seeded fan (Maya, Omar, Luca, …). Sign in with Apple or Google is not offered, and those buttons are not shown.
- **Profiles & favorites** — name, photo initials, bio, favorite clubs, competitions, and players. **TV country** (UK / SK / US) defaults from the device locale, else Slovakia. Favorites drive Home live scores and Following.
- **Social feed & follows** — follow demo users, post text (optional photo), optionally **attach a live/today/upcoming fixture**, like posts, see friends + own posts. Home and Following highlight match-attached posts and live matches for clubs/players you follow.
- **Global search** — dedicated Search screen from the Feed bar and tab headers. Query clubs, players, competitions, and demo fans; results open the existing entity pages.
- **Live scores & fixtures** — Live / Today / Upcoming. With a BFF URL or key, **England (PL + Championship), Slovakia Niké Liga, and Spain La Liga** from API-Football; without either, the mock worldwide catalog. Match pages with score, events, **lineups** (formation, XI, and bench when the free tier returns a team sheet), an empty stats state when possession is not cached, and **TV channels for the user’s country**.
- **TV / broadcast schedule** — FotMob-style listings for launch geos (**UK, Slovakia, United States**). Browse today’s and upcoming England kickoffs with channel chips; tap through to the match. Editorial/mock data — not a licensed rights guide.
- **Clubs & players** — Team pages (crest, league table context, fixtures, clickable squad, favorite) and player pages (mock season stats, recent appearances, follow/favorite, link back to club).
- **Worldwide leagues** — continents → countries → competitions. Live standings/scorers are England + Slovakia + La Liga; other geos stay on the mock tree. Featured PL, Championship, Niké Liga, and La Liga when live.
- **Match hub** — discussion thread, participants, empty states, feed posts attached to that match id, plus **score predictions** and **Man of the Match** voting. Composer can deep-link from the match page.
- **Predictions & MOTM** — before kickoff, pick a home/away score and see community aggregates (other demo fans are seeded). Picks lock at kickoff / once the match is live. During and after the match, vote once for MOTM from lineups (squad fallback). Not a betting product.
- **Prediction leaderboards** — global and per-league ranks by prediction points (optional MOTM bonus). Your rank + top 10. Demo board is this device + seeded fans; email sign-in writes picks to KickFeed Postgres. Honesty banners say which table you are on.
- **Notifications** — in-app center for match-chat replies, DMs, your prediction/MOTM confirmations, goals/kickoff alerts for fixtures you care about, follows, and friend posts. Device alerts are opt-in on Profile: **kickoff soon** (one reminder per favorite match) and **goals** when live scores tick up. Email sign-in stores an Expo push token so those alerts can arrive after you close the app. Without a token, the in-app center still works.
- **Direct messages** — 1:1 text between fans (demo seeds or Supabase uuids). Inbox + thread from Home, Profile, a fan page, or search. Blocks hide the thread both ways. No group chats, no media in v1.
- **Report, block, slow-mode** — report a post, profile, match-chat message, or **DM**. Block a fan to hide their posts, match-chat, DMs, and notifications on this account. Match hub discussion and 1:1 DMs have a 20s slow-mode (plus a short burst cap) so spam does not take over. Demo saves stay in AsyncStorage; email sessions also write `user_blocks` / `user_reports` / `direct_messages` in KickFeed Postgres. Not a moderation dashboard.

## Run

```bash
npm install
npx expo start
```

Then open:

- **Expo Go** on a phone (scan the QR)
- **iOS simulator** (`i` in the terminal, macOS)
- **Android emulator** (`a` in the terminal)
- **Web** (`w` in the terminal) for a quick desktop preview

Typecheck and unit tests:

```bash
npm run typecheck
npm test
```

CI runs `npm ci` → `typecheck` → `test` on pull requests (see `.github/workflows/ci.yml`). CI does **not** need an API-Football key or Supabase credentials; tests use mocks and JSON fixtures.

## Store checklist

Privacy, support, and terms links, production EAS settings, and the submit checklist are in [`docs/store-checklist.md`](docs/store-checklist.md). Listing copy and screenshots are in [`store/`](store/). This repo does not submit to the App Store or Play.

## Supabase email auth

Without `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`, KickFeed stays on the **demo profile picker** when demo mode is on. With both set, the gate is email sign-in / sign-up, and **Continue with demo** remains a fallback unless `EXPO_PUBLIC_DEMO_MODE=0` (the production EAS profile).

Karol — create a free project and paste keys (never commit `.env`):

1. Sign up at [supabase.com](https://supabase.com) and **New project**.
2. **Authentication → Providers → Email** — enable it. For local Expo demos, turn **Confirm email** off so sign-up returns a session immediately (or leave it on and click the mail link, then sign in).
3. **Project Settings → API** — copy **Project URL** and the **anon public** key.
4. Copy [`.env.example`](.env.example) to `.env` (gitignored) and set:

```
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

5. Restart Expo (`npx expo start`) so the public env vars are inlined. Expo Go is supported (`@supabase/supabase-js` + AsyncStorage session).
6. Optional: in the Supabase SQL editor, run the files in [`supabase/migrations/`](supabase/migrations/) (profiles, prediction tables, write-lock RPCs, **reports/blocks**, then **direct messages**). Profiles are the join key (`id` = `auth.users.id`). Live ranking writes go through kickoff-lock RPCs — not direct table upserts. Reports/blocks use RLS on `user_reports` / `user_blocks` (own rows + incoming blocks so DMs can hide). DMs use RLS on `direct_messages` (participants only; blocked pairs hidden). See [`supabase/README.md`](supabase/README.md).

Google / Apple sign-in is not in the app. Do not add those buttons until the providers actually complete a session.

**Identity:** demo seeds stay `maya` / `omar` / …; real accounts use `auth.users.id` (uuid). Favorites, predictions, MOTM, leaderboard rows, **blocks**, **reports**, and **DMs** all key off that same id. Social graph stays on local AsyncStorage; live ranking additionally upserts the signed-in user’s picks to Postgres; email sessions also upsert that user’s blocks/reports/DMs.

## EAS push (Karol)

Device match alerts are **opt-in** and part of the free core (Profile → Enable device match alerts). They are not behind a paywall.

Two paths:

- **While the app is open** — kickoff / goal banners are scheduled on the device from the same football catalog as Matches (no extra client polling).
- **While the app is closed** — an email session stores this phone’s Expo push token plus favorite club ids. A Supabase Edge Function sends through [Expo’s push service](https://docs.expo.dev/push-notifications/sending-notifications/). Demo mode stays on-device only.

The in-app notification center is unchanged.

`extra.eas.projectId` is already `52a1ee7a-e7db-49c4-bc11-419d316ebd44` (Expo owner `kaysi8805`, project KickFeed / `kickfeed`). That UUID is public config, not a secret. Never commit Expo access tokens, FCM keys, APNs keys, or `google-services.json`. CI does not need them, and it never receives `FOOTBALL_API_KEY`.

### What fires

- **Kickoff soon** — one alert per favorite match. Within 30 minutes of kickoff (or the first 10 minutes after it goes live) it sends. Further out (up to 6 hours) is remembered and delivered when that window opens.
- **Goals** — the first live score is a baseline (no dump). The next score tick for that favorite match sends `GOAL`. Closed-app copy is the scoreline; scorer names stay on the in-app path (event feeds are a separate request and are not polled for push).
- **Tap** — `matchId` in the payload opens the match hub, including a cold start. A remote test has no `matchId`, so a tap does not navigate.
- **Cap** — at most 3 banners per user per dispatch (same idea as `MAX_DEVICE_ALERTS_PER_SYNC`). A run stops at 60 Expo messages.
- **Closed-app delay** — the dispatcher refetches a live league about every 10 minutes and an idle league hourly, and only between 10:00 and 22:59 UTC, so the free API-Football budget (100 requests/day, shared with the BFF) is not burned. Goals can take a few minutes. The phone does not poll.

Favorite clubs are matched by the ids the app already resolves (`liv` and the API-Football team id, plus a favorite player’s club). Leagues outside England, Slovakia Niké Liga, and La Liga are not pushed.

### Device checklist

1. Supabase URL + anon key in `.env` (see [Supabase email auth](#supabase-email-auth)). Apply [`supabase/migrations/20260923140000_push_devices.sql`](supabase/migrations/20260923140000_push_devices.sql) after the earlier migrations. Restart Expo.
2. Deploy the function (once), from the repo root, after `supabase login` and `supabase link`:
   ```bash
   supabase functions deploy dispatch-favorite-push --no-verify-jwt
   supabase secrets set PUSH_DISPATCH_SECRET="$(openssl rand -hex 24)"
   supabase secrets set FOOTBALL_BFF_URL="https://kickfeed-football-bff.kaysi8805.workers.dev"
   ```
   `--no-verify-jwt` is required because cron authenticates with `PUSH_DISPATCH_SECRET`, not a user JWT. The function still rejects anonymous dispatch. Optional: `EXPO_ACCESS_TOKEN` if Expo push security is enabled on the project, and `FOOTBALL_SEASON=2026` only if the app pins `EXPO_PUBLIC_FOOTBALL_SEASON` (so both hit the same BFF cache key).
3. Enable `pg_cron` and `pg_net`, put `project_url` and the same `PUSH_DISPATCH_SECRET` in Vault, then run [`supabase/cron/dispatch-favorite-push.sql`](supabase/cron/dispatch-favorite-push.sql). Do not paste the service role key into that file.
4. On a **phone**, sign in with email (demo mode will not register a remote token). Favorite a live-coverage club (Premier League, Championship, Niké Liga, or La Liga). Profile → **Enable device match alerts** → allow notifications. Kickoff and goals default **on**.
5. **Send a test alert** is a 3-second local ping. **Send a remote test** calls the function with your session and should banner even if you then leave KickFeed.
6. For a real match: leave the app closed. Within about 10 minutes of a favorite kickoff (inside the 30-minute window) or a goal, the banner should arrive. Tap it — the match hub opens.
7. **Expo Go vs a dev build**
   - **iOS Expo Go** can register an Expo token once `projectId` is set.
   - **Android Expo Go** often cannot. Use a development build:
     ```bash
     eas login
     eas build --profile development --platform android
     ```
   - A standalone / dev build needs your own credentials before remote push is delivered: [EAS credentials](https://docs.expo.dev/app-signing/app-credentials/) — an APNs key for iOS and FCM v1 (`google-services.json`) for Android, uploaded with `eas credentials`. Expo’s push service uses those keys; KickFeed does not embed them.

**Resolution order for projectId:** `EXPO_PUBLIC_EAS_PROJECT_ID` → `Constants.easConfig.projectId` → `extra.eas.projectId`. Empty everywhere → no token, no crash, in-app center still works.

Web preview never shows device banners and never calls Expo’s push API.

## Public landing (Batch 0)

The football marketing site lives in-repo at [`landing/`](landing/) (plain HTML/CSS/JS plus Expo web captures of Feed and Matches). It is **not** part of the Expo TypeScript graph — `npm test` / `typecheck` ignore it.

Thesis: **Facebook-style social × FotMob-style scores — one pitch.** No App Store / Play Store download button; CTAs are a client-side waitlist stub and a link to [Run the Expo demo](#run).

Preview locally (no build step):

```bash
python3 -m http.server 4173 --directory landing
```

Then open http://localhost:4173 — or open `landing/index.html` in a browser.

### Deploy (static host)

`landing/` is a static root: `index.html`, `styles.css`, `app.js`, `images/`, `favicon.svg`, plus `CNAME` (`kickfeed.polsia.app`) and `.nojekyll` for GitHub Pages.

- **Cloudflare Pages** — connect this GitHub repo, production branch `main`, **output / root directory `landing`**, empty build command. Attach the custom domain when DNS is ready.
- **GitHub Pages** — GitHub’s branch publisher only serves `/` or `/docs`. Either copy `landing/` to `docs/` and set Pages → Deploy from branch → `/docs`, or add an Actions workflow that uploads the `landing/` folder as the Pages artifact. Keep `CNAME` at the published root.
- **Any other static host** — rsync / upload the contents of `landing/` as the site root.

### DNS cutover (Karol)

This PR does **not** change polsia.app DNS. When a static host is live:

1. Create `kickfeed.polsia.app` as a **CNAME** to the host (Cloudflare Pages `*.pages.dev`, GitHub Pages `kaysi8805.github.io`, etc.).
2. Add the same hostname in the host’s custom-domain settings (TLS).
3. Until that cutover, the recovered landing is only in this repo.

## Real live scores (England + Slovakia + La Liga, via BFF)

Without `EXPO_PUBLIC_FOOTBALL_BFF_URL` or `EXPO_PUBLIC_FOOTBALL_API_KEY`, KickFeed uses the mock catalog (demo still works offline).

With either set, Matches / standings / team + player pages hydrate:

| Country | Competition | API-Football id |
| --- | --- | --- |
| England | Premier League (primary) | 39 |
| England | EFL Championship | 40 |
| Slovakia | Niké Liga (Super Liga) | 332 |
| Spain | **La Liga** | 140 |

**La Liga, not Bundesliga:** KickFeed already has a featured La Liga mock tree (club colors + `rma`/`bar` aliases), and its weekend kickoffs complement England rather than stacking another Saturday 15:30 CET block. FA Cup and other cups are skipped so the free **100 requests/day** budget stays on these four league scores.

Social graph stays on local AsyncStorage. **Live screens show “England, Slovakia & La Liga live · other leagues mock.”** TV stays editorial.

**Prefer the BFF for demos** (server-side key, shared TTL cache — see [`bff/README.md`](bff/README.md)):

```
EXPO_PUBLIC_FOOTBALL_BFF_URL=http://127.0.0.1:8787
FOOTBALL_API_KEY=your_key_here   # BFF process only; never EXPO_PUBLIC_
```

Leave `EXPO_PUBLIC_FOOTBALL_API_KEY` empty when the BFF URL is set.

Solo local without the BFF: copy `.env.example` to `.env` (gitignored) and set `EXPO_PUBLIC_FOOTBALL_API_KEY`. Restart Expo so the public env var is inlined. That key is in the JS bundle — fine for one device, painful for multi-device demos.

Optional: `EXPO_PUBLIC_FOOTBALL_SEASON=2026` to pin the season start year (defaults to the current European season).

## Batch 1 prod checklist

Release builds talk only to the Cloudflare Worker. The API-Football key stays a Worker secret. Local `expo start` keeps `http://127.0.0.1:8787` when that line is set in `.env`. The worker cache is **in-memory per isolate** (free tier, no KV): a cold isolate is a cache miss. `eas.json` development uses the loopback URL. Preview and production inline `https://kickfeed-football-bff.kaysi8805.workers.dev`. An EAS plaintext env var with the same name overrides that. If the value is still the `<account>` placeholder, the app treats it as unset and stays on mocks.

From the repo root, on Karol’s Mac:

```bash
npx wrangler@latest login
npx wrangler@latest secret put FOOTBALL_API_KEY --config bff/wrangler.toml
npx wrangler@latest deploy --config bff/wrangler.toml
```

`secret put` prompts for the key. Do not commit it and do not put it in `EXPO_PUBLIC_*`. Deploy prints the origin. The committed release URL (no trailing slash) is:

```text
https://kickfeed-football-bff.kaysi8805.workers.dev
```

Set the same value as an EAS **plaintext** variable only if you need to override `eas.json` (it is inlined into the app; `secret` visibility never reaches the JS bundle). Leave `EXPO_PUBLIC_FOOTBALL_API_KEY` unset — when the BFF URL is set the live provider does not send a client key.

```bash
eas env:set --name EXPO_PUBLIC_FOOTBALL_BFF_URL --value https://kickfeed-football-bff.kaysi8805.workers.dev --environment production --visibility plaintext
eas env:set --name EXPO_PUBLIC_FOOTBALL_BFF_URL --value https://kickfeed-football-bff.kaysi8805.workers.dev --environment preview --visibility plaintext
```

Local `.env` (gitignored), same machine or simulator:

```bash
EXPO_PUBLIC_FOOTBALL_BFF_URL=http://127.0.0.1:8787
```

A phone cannot reach your computer’s `127.0.0.1`. Use the workers.dev URL above for a device build.

Check the worker, then Matches:

```bash
curl -sS https://kickfeed-football-bff.kaysi8805.workers.dev/health
```

Expect `"ok": true`, `"keyConfigured": true`, and coverage leagues `39`, `40`, `332`, `140`. `cache.scope` is `"isolate"`. `quota.remaining` stays `null` until that isolate has called API-Football, then it shows the last `x-ratelimit-requests-remaining`. Install a preview or production build (or Expo with the prod URL in `.env`) and open **Matches** — England, Slovakia, and La Liga scores, with no API key in the app.

Docs: [API-Football v3](https://www.api-football.com/documentation-v3). Direct client header: `x-apisports-key`. Client cache: fixtures ~45s if anything in that league window is live, else 5 min; standings 5 min; scorers 15 min; squads / match detail lazy; team statistics 24 h (one club, fetched when Overview opens). The BFF is stricter on origin: allowlisted leagues only, fixtures 45s if any row is live else 5 min, standings 15 min, scorers 30 min, player season 12 h, team statistics 24 h, and **429/5xx reuse stale cache**. Cold hydrate is 9 origin calls (4 leagues × fixtures+standings + PL scorers); team statistics are not in that burst. Extra devices HIT the BFF. If the free tier omits a squad, lineup, or season block, the team/match page still shows scores and says “Not in free-tier cache yet” instead of inventing shots, possession, or xG.

Mock club ids (`ars`, `liv`, `epl`, `slovan`, `laliga`) still resolve after hydrate so demo favorites and feed mentions keep working. Search prefers live coverage entities when the BFF/key is set.

## Demo mode

On first launch without Supabase env, choose a demo profile. With Supabase env, email sign-in is first; **Continue with demo** still opens the picker unless `EXPO_PUBLIC_DEMO_MODE=0`. Production drops a restored demo session and opens on email sign-in. State (favorites including players, follows, posts, comments, **score predictions**, **MOTM votes**, **blocks**, **reports**, **direct messages**, notification read flags) is persisted with AsyncStorage under `kickfeed.v1.state` (`schemaVersion` 2). Per-user maps (favorites, predictions, MOTM, likes, following, blocks, DM reads) are keyed by `currentUserId`: seeded ids like `maya` in demo mode, or the Supabase `auth.users` uuid when signed in with email. Demo and email data can coexist on one device. Post `matchId` values are kept as stored — live remapping is display-time only. Predictions and MOTM votes use the same related-id matching as match chat, so mock ids (`fx-liv-ars`) and live England ids stay one ballot when a key is set.

Corrupt JSON is discarded. A missing or newer `schemaVersion` still keeps valid slices (signed-in demo user or uuid, follows, posts, …) and stamps the current version. Unknown `currentUserId` values (not a demo id and not a uuid) are cleared. On boot, a live Supabase session wins; if the session is gone, a leftover uuid is dropped so demo restore still works.

Use **Profile → Switch demo user** / **Switch account** / **Sign out** to return to the gate. **Profile → Enable device match alerts** opts into kickoff-soon and goal banners for your clubs. Remote Expo push needs an EAS `projectId` and an email session (see [EAS push](#eas-push-karol)); without a token, local alerts still work on a phone after you grant permission, and web/demo never crash.

## Project layout

```
landing/             Public static marketing site (Batch 0; GitHub Pages / Cloudflare)
app/                 Expo Router screens (tabs + stack)
  team/[id]          Club detail (form, season stats, fixtures, squad, favorite)
  player/[id]        Player detail (stats, appearances, follow)
  match/[id]         Match hub (events, Predict, MOTM, discussion, TV)
  leaderboard        Global / per-league prediction ranking
  tv                 TV schedule by country (UK / SK / US)
  search             Global search (clubs, players, leagues, fans)
  messages           DM inbox + /messages/[peerId] 1:1 thread
components/          UI, feed cards, match rows, entity links, search entry, TV chips, leaderboard, report/block sheets, DM inbox button
lib/moderation.ts    Report/block helpers + match-chat slow-mode
lib/dms.ts           1:1 thread keys, inbox, DM slow-mode, block hiding
lib/matchSocial.ts   Attach/match-post helpers (live vs mock ids)
lib/favoritePush.ts  Kickoff-soon / goal device-alert planner
lib/remotePush.ts   Remote Expo push planner (shared with the Edge Function)
lib/easProject.ts    EXPO_PUBLIC_EAS_PROJECT_ID + Constants.easConfig / extra.eas
lib/engagement.ts    Prediction lock, MOTM ballot, community tallies
lib/leaderboard.ts   Prediction points, MOTM bonus, top-N + current rank
lib/tvCountry.ts     Locale → launch geo, kickoff labels in that timezone
lib/honesty.ts        Live-mix + TV editorial + demo/live ranking copy
lib/footballBff.ts    Allowlisted API-Football proxy + TTL cache (Worker/Node)
bff/                 Cloudflare Worker + local Node loopback (FOOTBALL_API_KEY server-side)
data/types.ts        Shared domain types
data/mocks/          Seeded users, teams, squads, leagues, fixtures, posts, TV, predictions/MOTM, DMs
supabase/             Optional SQL for `profiles`, predictions/MOTM, `user_blocks` / `user_reports`, and `direct_messages`; not used by CI
lib/userIdentity.ts  Demo id vs Supabase uuid helpers; profile → User
services/auth.ts     Email/password AuthProvider + demo list; OAuth rejected, no buttons
services/leaderboard.ts  Postgres fetch/upsert when Supabase is configured
services/moderation.ts   Postgres fetch/insert for blocks + reports (email session only)
services/dms.ts          Postgres fetch/insert for 1:1 DMs (email session only)
services/supabase.ts Expo client from EXPO_PUBLIC_SUPABASE_* (null without env)
services/football.ts     FootballProvider + mock + auto-select live adapter
services/footballLive.ts API-Football live adapter (England + SK + La Liga, in-memory TTL cache)
lib/footballCoverage.ts Live league ids / geo labels (BFF allowlist + adapter)
services/footballMap.ts  API entity → KickFeed types
services/tv.ts           TvProvider + editorial mock listings (licensed swap later)
services/notifications.ts  Expo Notifications: EAS projectId, local kickoff/goal alerts, opt-in store
services/AppProvider.tsx   App state (follows, favorites, posts, TV country, predictions, MOTM, blocks, reports, DMs)
theme/               Color, type, and spacing tokens
```

## Auth (demo + Supabase)

`services/auth.ts` exports an `AuthProvider` used by `AppProvider`:

- `listDemoUsers()` — staging fallback picker (always available).
- `signInWithEmail` / `signUpWithEmail` / `getSession` / `signOut` — real Supabase Auth when env is set; throw a clear error without it.
- `signInWithOAuth` — still throws. The UI does not offer Apple or Google sign-in.
- KickFeed `User.id` is the demo seed id or `auth.users.id` (uuid) so leaderboards can attach later without remapping.

The UI gates on `currentUser`. `AuthScreen` shows email when configured, otherwise the demo picker.

## Match-centric social (Batch 4)

Compose can attach a fixture from `FootballProvider` (live/today/upcoming). New posts persist that provider’s match id: **live API ids when a key is set**, mock ids (`fx-liv-ars`, …) otherwise. Match hub (`/match/[id]` → Hub) shows attached feed posts plus the discussion thread. Home/Following surface those posts next to live matches for clubs and players you follow.

Old mock-attached seed posts remap onto a live England fixture only through an explicit **deep-link board** (`resolveMatchDeepLink` in `lib/matchSocial.ts`):

- **exact** — the URL/stored id is in the active catalog (`getFixtures()`).
- **alias** — live catalog has **exactly one** fixture with the same clubs (via team aliases). Seed ids like `fx-liv-ars` then open that live match.
- **missing** — no unique pair (or the id is unknown). The live path does **not** render the mock fallback fixture, so deep links cannot show mock scores as if they were England live.

Hydrate never writes this mapping back to AsyncStorage.

In-app notifications cover match-chat replies and demo kickoff/goal alerts for fixtures tied to your favorites. Device alerts are opt-in (Profile) and stay local until Karol links an EAS `projectId` — see [EAS push](#eas-push-karol).

## Football data

`services/football.ts` exports `FootballProvider`. `football` is the mock provider unless `EXPO_PUBLIC_FOOTBALL_BFF_URL` or `EXPO_PUBLIC_FOOTBALL_API_KEY` is set, in which case `createLiveFootballProvider` loads England + Slovakia + La Liga (via the BFF when the URL is set, otherwise straight to API-Football) and falls back to mock for demo posts, other geos, and missing live records.

Keep `data/types.ts` stable so screens do not care whether data is seeded or remote.

`FootballProvider` also exposes `getPlayer`, `getPlayers`, `getSquad`, `getTeamCompetitions`, `getPlayerStats`, `getPlayerAppearances`, plus `hydrate` / `refresh` / `subscribe` for the live cache.

Mock fixtures use `SeedFixture.kickoffOffsetMin` relative to “now” when `hydrateFixture` runs (`services/football.ts`). Status windows (mock clock only):

- **Upcoming** — kickoff still in the future
- **Live 1st half** — 0–45 minutes after kickoff
- **HT** — 45–48 minutes (3-minute half-time window)
- **Live 2nd half** — 48–98 minutes (display minute is elapsed minus HT, capped at 90)
- **Finished** — 98+ minutes (90 + 3 HT + 5 stoppage)

A live API returns real statuses (`NS` / `1H` / `HT` / `2H` / `FT`, …) instead of this clock.

## TV schedules (Batch 5)

FotMob-style **where to watch**, for launch geos only: **United Kingdom, Slovakia, and the United States**. The country list is `tvCountries` in `data/mocks/tv.ts` — append a geo there, add editorial rows, and the match page + `/tv` screen pick it up.

`services/tv.ts` exports `TvProvider` (broadcasts by match id; listings by country + date). v1 is **editorial/mock** seeded for featured Premier League fixtures, with a PL / Championship league fallback so live England ids still resolve when a key is set. Listings key off mock fixture ids (`fx-liv-ars`) plus club pairs; `relatedIds` / `resolveMatchDeepLink` alias those onto live API ids. **Do not scrape FotMob, Flashscore, or broadcaster sites.**

Default country: Profile → Edit profile → TV country, else the device locale/timezone (`en-GB` → UK, `sk-SK` / `Europe/Bratislava` → SK, `en-US` → US), else **Slovakia**. Open a match to see channel chips; Matches header (TV icon) or Profile opens the schedule. Kickoff times render in that geo’s timezone.

### Swap in a licensed TV feed later

Keep `TvProvider` stable (`getBroadcastsByMatch`, `getListingsByCountry`, `getCountries`). Replace `createEditorialTvProvider` / `export const tv` with an adapter that talks to a licensed listings API. Do not put TV behind the football API key — API-Football’s free tier is scores-only, and KickFeed does not depend on a paid TV add-on. CI and first-run demo stay on the editorial path (no extra secrets).

## Roadmap

Karol’s batches:

- **Batch 0 — done.** Public football landing recovered in-repo at `landing/`. `kickfeed.polsia.app` still needs DNS cutover by Karol — this repo does not touch polsia DNS.
- **Batch 1 — done.** Teams, players, and competitions are first-class and clickable throughout the app.
- **Batch 2 — done.** Global search plus follow/favorite **players**.
- **Batch 3 — done.** Real scores for **England** (API-Football behind `FootballProvider`; demo auth/social still mock). BFF URL or public key → PL + Championship; otherwise mocks.
- **Batch 4 — done.** Match-centric social on real England fixtures (match hub, compose attach, feed surfacing, in-app match notifications). Attachments use live match ids when keyed and mock ids otherwise.
- **Batch 5 — done.** TV / broadcast schedules for launch geos (UK + SK + US) with editorial listings and a `TvProvider` swap path.
- **Batch 6 — done.** Score predictions (lock at kickoff) and Man of the Match voting on the match hub. Demo auth; works on the mock catalog and on live England match ids when a key is set.
- **Batch 7 — done.** UX polish: consistent empty / loading / error copy, clearer Predict-locked and MOTM-voted states, slightly larger tap targets.
- **Honesty + BFF — done.** Mix banners, thin API-Football BFF, leftover Batch 7 nits.
- **Auth — done.** Supabase email/password with demo profile picker as staging/dev fallback.
- **Leaderboards — done.** Prediction leaderboards (global + per-league) keyed by demo id or `auth.users` uuid.
- **Live geos — done.** Slovakia Niké Liga + La Liga on the existing BFF allowlist + quota TTLs.
- **Matchday Home — done.** Home pins live/next favorite (or featured live coverage) above the feed.
- **EAS push — done.** Favorite kickoff-soon + goal device alerts via Expo Notifications + EAS `projectId`. No extra football polling.
- **Pre-match lineups — done.** Match hub Lineups list for leagues 39, 40, 332, and 140. Formation, starting XI, and a collapsed bench from `GET /fixtures/lineups` through the BFF, fetched when the match screen opens (not during Matches hydrate). The same list is used before, during, and after the match. A miss says lineups usually land about 60–90 min before kickoff. No pitch diagram and no provisional/confirmed label unless a payload says so.
- **Report / block — done.** Demo = AsyncStorage; email session = Postgres RLS. Not a moderation dashboard.
- **This PR.** 1:1 DMs. Demo = AsyncStorage (Maya↔Omar seed); email session = Postgres RLS + slow-mode trigger. Not in this PR: group chats, media DMs, push for messages, moderation dashboard, licensed TV, Apple/Google polish, more geos. Not gambling.

## Honesty banners

When the live catalog is on (BFF URL or public API key), Feed / Matches / Leagues / Following show **England, Slovakia & La Liga live · other leagues mock**. TV schedule and the match TV card show **Editorial TV listings — not a licensed FotMob-style guide.** Mock-only demos hide the mix banner.

Leaderboards show **Demo ranking — this device and seeded fans** when Supabase env is missing (or you stayed on a demo profile), and **Live ranking — KickFeed Postgres** when signed in with email. The two tables are not mixed.

Reports and blocks show the same split: **this device in demo mode** vs **KickFeed Postgres for this email account**. There is no public moderation inbox in the app.

DMs use the same split: **this device in demo mode** vs **KickFeed Postgres for this email account**. Copy on the inbox says it is 1:1 text, not a group workspace.

## UX polish (Batch 7)

Copy and empty-state pass on Feed, Matches, Search, Following, and the match hub (Hub / Predict / MOTM / TV). Compact empty states sit inside lists; full empty states stay for true blank screens. Predict shows a locked pill after kickoff; MOTM shows “Voting hasn’t opened” before live and a **Voted** badge after you pick. Search no-results copy no longer says “matches” (fixtures). Tap targets on back, steppers, send, and country chips sit closer to 44pt. Tokens unchanged (`theme/index.ts`).

## Predictions & MOTM (Batch 6)

Match hub tabs **Predict** and **MOTM** sit next to Events / Lineups / Stats / Hub. TV stays a section on the board (Batch 5).

- **Predict** — upcoming fixtures only. Stepper for home/away (0–9). Upsert until kickoff; live / HT / FT (or kickoff time reached) lock the pick. Community average, most-common scoreline, and home/draw/away counts include other demo users (seeded mocks).
- **MOTM** — live, half-time, and finished. Ballot is `FootballProvider.getLineups`; if XIs are empty (free-tier skip), `getSquad` for both clubs. One vote per user per match (demo id or Supabase uuid; related mock/live ids count as one). Tallies persist with the rest of app state.
- Confirmations land in Notifications (“You predicted 2–1”, “You voted for Salah”). No odds, stakes, or third-party betting APIs.

## Pre-match lineups

The match hub **Lineups** tab is one list for upcoming, live, and full-time matches. Each club shows its formation when the payload has one, then shirt number, name, and position. The bench starts collapsed. A coach name is shown only when that same payload included one. The match screen does not call API-Football itself: `GET /fixtures/lineups?fixture=` goes through the in-repo BFF (`EXPO_PUBLIC_FOOTBALL_BFF_URL`). Leave `EXPO_PUBLIC_FOOTBALL_API_KEY` empty. Leagues stay **39, 40, 332, and 140**.

The free-tier body does not say provisional versus confirmed, so the list does not add that label. It also does not draw a pitch. If `startXI` is missing, the tab says **Lineups usually ~60–90 min before kickoff** and does not invent an XI, shots, possession, or xG.

Demo mode (no BFF URL and no client key) still shows a seeded 4-3-3 plus the rest of the mock squad on the bench. A row opens the player page only when the lineup player has an id. MOTM still ballots from the starting XI when one is present, and from both squads when it is empty.

**Quota.** Matches hydrate does not call `/fixtures/lineups`. Opening a match does, once per fixture. The BFF coalesces concurrent clients on that fixture. An empty answer is cached about **10 minutes**. A sheet is cached about **15 minutes** on the BFF (pre-match and live). The app keeps a full-time sheet for about **6 hours**. Opening five different matches is five reads, not a prefetch of every upcoming fixture. Cold hydrate is unchanged (fixtures, standings, Premier League scorers only).

**Try on a device**

1. In `.env` (never commit it), set `EXPO_PUBLIC_FOOTBALL_BFF_URL=https://kickfeed-football-bff.kaysi8805.workers.dev` and leave `EXPO_PUBLIC_FOOTBALL_API_KEY` empty.
2. `npx expo start` and open an upcoming Premier League, Championship, Niké Liga, or La Liga match.
3. Open **Lineups**. If the free tier has a sheet: formation, XI (`number · name · position`), coach when present, bench collapsed until you expand it. Tap a row that has a player id.
4. Open another covered match whose sheet is not out yet. You should see **Lineups usually ~60–90 min before kickoff**, not a guessed XI.
5. The same list is what you see if that match is live or full time and the payload exists.
6. Unset the BFF URL and restart Expo. The same tab shows the demo XI and bench with no key.

## Prediction leaderboards

Open **Matches → trophy**, **Profile → Leaderboard**, a league page, or **Rank** / **Prediction leaderboard →** on the match hub (`/leaderboard`, optional `?leagueId=`).

Points (finished matches only; live/upcoming wait):

- **Exact scoreline — 5**
- **Correct result (home / draw / away), wrong score — 2**
- **Unique community MOTM — +2** (tie for first awards nothing)
- Miss — 0

Rank: points, then exacts, results, MOTM hits, scored matches, handle. Top 10 plus the current user’s rank (demo id or Supabase uuid — same key as social state). Related mock/live match ids score once.

**Live** (Supabase env + email session): writes go through `kickfeed_upsert_prediction` / `kickfeed_upsert_motm_vote` (server `now()` + kickoff lock). Board reads Postgres. Direct table writes are revoked. **Demo** (env missing or Continue with demo): seeded AsyncStorage board only. Not gambling.

## Report, block, and match-chat slow-mode

Open a post (···), a fan profile, or a match-hub message:

- **Report** — pick a short reason (spam, harassment, impersonation, off-topic, or something else). One report per target per account. KickFeed stores it; there is no public moderation inbox.
- **Block** — unfollows that fan and hides their posts, match-chat messages, DMs, and notifications on this account. Unblock from their profile or **Profile → Blocked fans**.
- **Slow-mode** — match discussion allows one message every 20 seconds in that thread, and at most 5 messages across hubs in 2 minutes. **DMs** use the same 20s per thread, plus at most 8 messages across conversations in 2 minutes. The composer says how long to wait.

**Demo** (no Supabase env, or Continue with demo): blocks/reports/DMs stay in `kickfeed.v1.state`. **Live** (email session): the same lists also write to `user_blocks` / `user_reports` / `direct_messages` (RLS: participants / own rows). Karol applies [`supabase/migrations/20260918180000_reports_blocks.sql`](supabase/migrations/20260918180000_reports_blocks.sql), [`supabase/migrations/20260919120000_direct_messages.sql`](supabase/migrations/20260919120000_direct_messages.sql), then [`supabase/migrations/20260919133000_dm_stamp_created_at.sql`](supabase/migrations/20260919133000_dm_stamp_created_at.sql) if 19120000 was already applied without the `created_at := now()` trigger.

## Direct messages

1:1 text between KickFeed identities (demo seed `maya` / `omar` or a Supabase `auth.users` uuid). No groups, no attachments in this batch.

**Try (demo)**

1. `npm install` then `npx expo start` → **Continue with demo** → **Maya Chen**.
2. Home → chat icon (or **Profile → Messages**). Open the seeded thread with **Omar Haddad**.
3. Send a short reply. Slow-mode waits 20s before the next send in that thread.
4. **Profile → Switch demo user** → **Omar Haddad** → Messages. Maya’s reply is there (same device blob).
5. Block Maya from Omar’s profile (or Omar from Maya). The thread disappears from the inbox; **Message** is gone on that profile. Unblock restores it — messages were hidden, not deleted.
6. Search **Omar** (as Maya) and tap **Message** on the fan row, or open his profile and tap **Message**.
7. **···** on a received bubble reports the DM (same reasons as posts / match chat). There is no public moderation inbox.

**Try (email / live)**

1. Set `EXPO_PUBLIC_SUPABASE_*` (see [Supabase email auth](#supabase-email-auth)). Apply the SQL files, including `20260919120000_direct_messages.sql` (and `20260919133000_dm_stamp_created_at.sql` if that first DM file was already applied).
2. Sign in as two real accounts (two devices, or sign out / sign up). Identity is `auth.users.id`.
3. Open the other fan’s profile → **Message**. Sends write `direct_messages` under RLS. Honesty copy on the inbox says **KickFeed Postgres**.
4. Demo Maya↔Omar threads stay on-device; they do not mix into the live table.

Karol — apply notes are in [`supabase/README.md`](supabase/README.md). CI does not need a project or secrets.

## Theme

Pitch-green dark UI: forest backgrounds (`theme/colors`), lime accents, live red badges. Tokens live in `theme/index.ts`.

## License

MIT

# KickFeed

KickFeed is a cross-platform iOS and Android app (one Expo / React Native codebase) that combines a Facebook-style social feed with FotMob / Flashscore-style football scores, standings, and worldwide league browsing.

v1 is **local-first**: seeded fan profiles for **demo mode**, optional **Supabase email auth**, mock social, and **mock football unless you add a free API-Football key or point the app at the in-repo BFF**. No paid API keys. The football BFF is optional (hides the key and shares the free-tier 100 req/day cache). Email auth is optional — without Supabase env vars the demo picker still works.

## Features

- **Auth** — email/password via **Supabase Auth** when `EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_ANON_KEY` are set. Without those (or tap **Continue with demo**), pick a seeded fan (Maya, Omar, Luca, …). Apple/Google OAuth is stubbed for a later batch.
- **Profiles & favorites** — name, photo initials, bio, favorite clubs, competitions, and players. **TV country** (UK / SK / US) defaults from the device locale, else Slovakia. Favorites drive Home live scores and Following.
- **Social feed & follows** — follow demo users, post text (optional photo), optionally **attach a live/today/upcoming fixture**, like posts, see friends + own posts. Home and Following highlight match-attached posts and live matches for clubs/players you follow.
- **Global search** — dedicated Search screen from the Feed bar and tab headers. Query clubs, players, competitions, and demo fans; results open the existing entity pages.
- **Live scores & fixtures** — Live / Today / Upcoming. With a key, England Premier League + Championship from API-Football; without a key, the mock worldwide catalog. Match pages with score, events, lineups (when the free tier returns them), stats stubs, and **TV channels for the user’s country**.
- **TV / broadcast schedule** — FotMob-style listings for launch geos (**UK, Slovakia, United States**). Browse today’s and upcoming England kickoffs with channel chips; tap through to the match. Editorial/mock data — not a licensed rights guide.
- **Clubs & players** — Team pages (crest, league table context, fixtures, clickable squad, favorite) and player pages (mock season stats, recent appearances, follow/favorite, link back to club).
- **Worldwide leagues** — continents → countries → competitions. Batch 3 live standings/scorers are England-only; other geos stay on the mock tree. Featured Premier League (and Championship when live).
- **Match hub** — discussion thread, participants, empty states, feed posts attached to that match id, plus **score predictions** and **Man of the Match** voting. Composer can deep-link from the match page.
- **Predictions & MOTM** — before kickoff, pick a home/away score and see community aggregates (other demo fans are seeded). Picks lock at kickoff / once the match is live. During and after the match, vote once for MOTM from lineups (squad fallback). Not a betting product.
- **Prediction leaderboards** — global and per-league ranks by prediction points (optional MOTM bonus). Your rank + top 10. Demo board is this device + seeded fans; email sign-in writes picks to KickFeed Postgres. Honesty banners say which table you are on.
- **Notifications** — in-app center for match-chat replies, your prediction/MOTM confirmations, goals/kickoff demo alerts for fixtures you care about, follows, and friend posts. Expo Notifications wiring remains local/demo (no paid push).

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

## Supabase email auth

Without `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`, KickFeed stays on the **demo profile picker** (same as today). With both set, the gate is email sign-in / sign-up, and **Continue with demo** remains a staging fallback.

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
6. Optional: in the Supabase SQL editor, run the files in [`supabase/migrations/`](supabase/migrations/) (profiles, prediction tables, then write-lock RPCs). Profiles are the join key (`id` = `auth.users.id`). Live ranking writes go through kickoff-lock RPCs — not direct table upserts. See [`supabase/README.md`](supabase/README.md).

Google / Apple providers can be enabled in the same Auth settings later — OAuth stays a stub.

**Identity:** demo seeds stay `maya` / `omar` / …; real accounts use `auth.users.id` (uuid). Favorites, predictions, MOTM, and leaderboard rows all key off that same id. Social graph stays on local AsyncStorage; live ranking additionally upserts the signed-in user’s picks to Postgres.

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

## Real England scores (Batch 3 + BFF)

Without `EXPO_PUBLIC_FOOTBALL_BFF_URL` or `EXPO_PUBLIC_FOOTBALL_API_KEY`, KickFeed uses the mock catalog (demo still works).

With either set, Matches / standings / team + player pages hydrate **England — Premier League (primary) and EFL Championship**. FA Cup is skipped so the free **100 requests/day** budget stays on league scores. Social graph stays on local AsyncStorage. **Live screens show “England live · other leagues mock.”** TV stays editorial.

**Prefer the BFF for demos** (server-side key, shared TTL cache — see [`bff/README.md`](bff/README.md)):

```
EXPO_PUBLIC_FOOTBALL_BFF_URL=http://127.0.0.1:8787
FOOTBALL_API_KEY=your_key_here   # BFF process only; never EXPO_PUBLIC_
```

Leave `EXPO_PUBLIC_FOOTBALL_API_KEY` empty when the BFF URL is set.

Solo local without the BFF: copy `.env.example` to `.env` (gitignored) and set `EXPO_PUBLIC_FOOTBALL_API_KEY`. Restart Expo so the public env var is inlined. That key is in the JS bundle — fine for one device, painful for multi-device demos.

Optional: `EXPO_PUBLIC_FOOTBALL_SEASON=2026` to pin the season start year (defaults to the current European season).

Docs: [API-Football v3](https://www.api-football.com/documentation-v3). Direct client header: `x-apisports-key`. KickFeed caches fixtures (~45s if anything is live, else 5 min), standings (5 min), scorers (15 min), and squads / match detail (lazy, longer TTL) in memory so screens can re-read the existing sync `FootballProvider`. The BFF applies the same short TTLs in front of origin. If the free tier omits a squad or lineup, the team/match page still shows scores and degrades that section.

Mock club ids (`ars`, `liv`, `epl`) still resolve after hydrate so demo favorites and feed mentions keep working. Search prefers live England entities when the key is set.

## Demo mode

On first launch without Supabase env, choose a demo profile. With Supabase env, email sign-in is first; **Continue with demo** still opens the picker. State (favorites including players, follows, posts, comments, **score predictions**, **MOTM votes**, notification read flags) is persisted with AsyncStorage under `kickfeed.v1.state` (`schemaVersion` 2). Per-user maps (favorites, predictions, MOTM, likes, following) are keyed by `currentUserId`: seeded ids like `maya` in demo mode, or the Supabase `auth.users` uuid when signed in with email. Demo and email data can coexist on one device. Post `matchId` values are kept as stored — live remapping is display-time only. Predictions and MOTM votes use the same related-id matching as match chat, so mock ids (`fx-liv-ars`) and live England ids stay one ballot when a key is set.

Corrupt JSON is discarded. A missing or newer `schemaVersion` still keeps valid slices (signed-in demo user or uuid, follows, posts, …) and stamps the current version. Unknown `currentUserId` values (not a demo id and not a uuid) are cleared. On boot, a live Supabase session wins; if the session is gone, a leftover uuid is dropped so demo restore still works.

Use **Profile → Switch demo user** / **Switch account** / **Sign out** to return to the gate. **Profile → Enable device match alerts** opts into Expo push (no-op until an EAS `projectId` exists).

## Project layout

```
landing/             Public static marketing site (Batch 0; GitHub Pages / Cloudflare)
app/                 Expo Router screens (tabs + stack)
  team/[id]          Club detail (squad, fixtures, favorite)
  player/[id]        Player detail (stats, appearances, follow)
  match/[id]         Match hub (events, Predict, MOTM, discussion, TV)
  leaderboard        Global / per-league prediction ranking
  tv                 TV schedule by country (UK / SK / US)
  search             Global search (clubs, players, leagues, fans)
components/          UI, feed cards, match rows, entity links, search entry, TV chips, leaderboard
lib/matchSocial.ts   Attach/match-post helpers (live vs mock ids)
lib/engagement.ts    Prediction lock, MOTM ballot, community tallies
lib/leaderboard.ts   Prediction points, MOTM bonus, top-N + current rank
lib/tvCountry.ts     Locale → launch geo, kickoff labels in that timezone
lib/honesty.ts        Live-mix + TV editorial + demo/live ranking copy
lib/footballBff.ts    Allowlisted API-Football proxy + TTL cache (Worker/Node)
bff/                 Cloudflare Worker + local Node loopback (FOOTBALL_API_KEY server-side)
data/types.ts        Shared domain types
data/mocks/          Seeded users, teams, squads, leagues, fixtures, posts, TV, predictions/MOTM
supabase/             Optional SQL for `profiles` + `predictions` / `motm_votes`; not used by CI
lib/userIdentity.ts  Demo id vs Supabase uuid helpers; profile → User
services/auth.ts     Email/password AuthProvider + demo list; OAuth stub
services/leaderboard.ts  Postgres fetch/upsert when Supabase is configured
services/supabase.ts Expo client from EXPO_PUBLIC_SUPABASE_* (null without env)
services/football.ts     FootballProvider + mock + auto-select live adapter
services/footballLive.ts API-Football England adapter (in-memory TTL cache)
services/footballMap.ts  API entity → KickFeed types
services/tv.ts           TvProvider + editorial mock listings (licensed swap later)
services/notifications.ts  Expo Notifications register/schedule stubs
services/AppProvider.tsx   App state (follows, favorites, posts, TV country, predictions, MOTM)
theme/               Color, type, and spacing tokens
```

## Auth (demo + Supabase)

`services/auth.ts` exports an `AuthProvider` used by `AppProvider`:

- `listDemoUsers()` — staging fallback picker (always available).
- `signInWithEmail` / `signUpWithEmail` / `getSession` / `signOut` — real Supabase Auth when env is set; throw a clear error without it.
- `signInWithOAuth` — still throws (Apple/Google polish is a later batch).
- KickFeed `User.id` is the demo seed id or `auth.users.id` (uuid) so leaderboards can attach later without remapping.

The UI gates on `currentUser`. `AuthScreen` shows email when configured, otherwise the demo picker.

## Match-centric social (Batch 4)

Compose can attach a fixture from `FootballProvider` (live/today/upcoming). New posts persist that provider’s match id: **live API ids when a key is set**, mock ids (`fx-liv-ars`, …) otherwise. Match hub (`/match/[id]` → Hub) shows attached feed posts plus the discussion thread. Home/Following surface those posts next to live matches for clubs and players you follow.

Old mock-attached seed posts remap onto a live England fixture only through an explicit **deep-link board** (`resolveMatchDeepLink` in `lib/matchSocial.ts`):

- **exact** — the URL/stored id is in the active catalog (`getFixtures()`).
- **alias** — live catalog has **exactly one** fixture with the same clubs (via team aliases). Seed ids like `fx-liv-ars` then open that live match.
- **missing** — no unique pair (or the id is unknown). The live path does **not** render the mock fallback fixture, so deep links cannot show mock scores as if they were England live.

Hydrate never writes this mapping back to AsyncStorage.

In-app notifications cover match-chat replies and demo kickoff/goal alerts for fixtures tied to your favorites. Device push is still opt-in and no-op without an EAS `projectId`.

## Football data

`services/football.ts` exports `FootballProvider`. `football` is the mock provider unless `EXPO_PUBLIC_FOOTBALL_BFF_URL` or `EXPO_PUBLIC_FOOTBALL_API_KEY` is set, in which case `createLiveFootballProvider` loads England data (via the BFF when the URL is set, otherwise straight to API-Football) and falls back to mock for demo posts, non-England clubs, and missing live records.

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
- **This release.** Honesty banners (England live vs mock; editorial TV), thin API-Football BFF + client switch, leftover Batch 7 nits.
- **Auth — done.** Supabase email/password with demo profile picker as staging/dev fallback.
- **This PR.** Prediction leaderboards (global + per-league) keyed by demo id or `auth.users` uuid. Postgres when Supabase env is set; local demo board otherwise. Not in this PR: DMs, more live geos, licensed TV, Apple/Google polish. Not gambling.

## Honesty banners

When the live catalog is on (BFF URL or public API key), Feed / Matches / Leagues / Following show **England live · other leagues mock**. TV schedule and the match TV card show **Editorial TV listings — not a licensed FotMob-style guide.** Mock-only demos hide the mix banner.

Leaderboards show **Demo ranking — this device and seeded fans** when Supabase env is missing (or you stayed on a demo profile), and **Live ranking — KickFeed Postgres** when signed in with email. The two tables are not mixed.

## UX polish (Batch 7)

Copy and empty-state pass on Feed, Matches, Search, Following, and the match hub (Hub / Predict / MOTM / TV). Compact empty states sit inside lists; full empty states stay for true blank screens. Predict shows a locked pill after kickoff; MOTM shows “Voting hasn’t opened” before live and a **Voted** badge after you pick. Search no-results copy no longer says “matches” (fixtures). Tap targets on back, steppers, send, and country chips sit closer to 44pt. Tokens unchanged (`theme/index.ts`).

## Predictions & MOTM (Batch 6)

Match hub tabs **Predict** and **MOTM** sit next to Events / Lineups / Stats / Hub. TV stays a section on the board (Batch 5).

- **Predict** — upcoming fixtures only. Stepper for home/away (0–9). Upsert until kickoff; live / HT / FT (or kickoff time reached) lock the pick. Community average, most-common scoreline, and home/draw/away counts include other demo users (seeded mocks).
- **MOTM** — live, half-time, and finished. Ballot is `FootballProvider.getLineups`; if XIs are empty (free-tier skip), `getSquad` for both clubs. One vote per user per match (demo id or Supabase uuid; related mock/live ids count as one). Tallies persist with the rest of app state.
- Confirmations land in Notifications (“You predicted 2–1”, “You voted for Salah”). No odds, stakes, or third-party betting APIs.

## Prediction leaderboards

Open **Matches → trophy**, **Profile → Leaderboard**, a league page, or **Rank** / **Prediction leaderboard →** on the match hub (`/leaderboard`, optional `?leagueId=`).

Points (finished matches only; live/upcoming wait):

- **Exact scoreline — 5**
- **Correct result (home / draw / away), wrong score — 2**
- **Unique community MOTM — +2** (tie for first awards nothing)
- Miss — 0

Rank: points, then exacts, results, MOTM hits, scored matches, handle. Top 10 plus the current user’s rank (demo id or Supabase uuid — same key as social state). Related mock/live match ids score once.

**Live** (Supabase env + email session): writes go through `kickfeed_upsert_prediction` / `kickfeed_upsert_motm_vote` (server `now()` + kickoff lock). Board reads Postgres. Direct table writes are revoked. **Demo** (env missing or Continue with demo): seeded AsyncStorage board only. Not gambling.

## Theme

Pitch-green dark UI: forest backgrounds (`theme/colors`), lime accents, live red badges. Tokens live in `theme/index.ts`.

## License

MIT

# KickFeed

KickFeed is a cross-platform iOS and Android app (one Expo / React Native codebase) that combines a Facebook-style social feed with FotMob / Flashscore-style football scores, standings, and worldwide league browsing.

v1 is **fully local**: demo profiles, mock football data, and in-app notifications. No paid API keys and no backend.

## Features

- **Demo auth** — pick a seeded fan profile (Maya, Omar, Luca, …). No email/password or OAuth yet.
- **Profiles & favorites** — name, photo initials, bio, favorite clubs and competitions. Favorites drive Home live scores and Following.
- **Social feed & follows** — follow demo users, post text (optional photo), like posts, see friends + own posts.
- **Live scores & fixtures** — Live / Today / Upcoming, grouped by league. Match pages with score, events, lineups, and stats stubs. Team crests/names and player events/lineups are tappable.
- **Clubs & players** — Team pages (crest, league table context, fixtures, clickable squad, favorite) and player pages (mock season stats, recent appearances, link back to club).
- **Worldwide leagues** — continents → countries → competitions, plus featured Premier League, Champions League, La Liga, Serie A, and Bundesliga standings, form, and top scorers. Standings rows and scorers open team/player pages.
- **Match discussions** — threaded comments on a match.
- **Notifications** — in-app center for goals, kickoff, follows, and friend posts, plus Expo Notifications wiring for local demo alerts.

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

CI runs `npm ci` → `typecheck` → `test` on pull requests (see `.github/workflows/ci.yml`).

## Demo mode

On first launch, choose a demo profile. State (favorites, follows, posts, comments, notification read flags) is persisted with AsyncStorage under `kickfeed.v1.state`.

Corrupt JSON is discarded. A missing or newer `schemaVersion` still keeps valid slices (signed-in demo user, follows, posts, …) and stamps the current version. Unknown `currentUserId` values are cleared.

Use **Profile → Switch demo user** to pick another seeded fan. **Profile → Enable device match alerts** opts into Expo push (no-op until an EAS `projectId` exists). Real credentials are intentionally not collected.

## Project layout

```
app/                 Expo Router screens (tabs + stack)
  team/[id]          Club detail (squad, fixtures, favorite)
  player/[id]        Player detail (stats, appearances)
components/          UI, feed cards, match rows, entity links
data/types.ts        Shared domain types
data/mocks/          Seeded users, teams, squads, leagues, fixtures, posts
services/auth.ts     Demo auth + stubs for email/OAuth
services/football.ts FootballProvider interface + mock implementation
services/notifications.ts  Expo Notifications register/schedule stubs
services/AppProvider.tsx   App state (follows, favorites, posts)
theme/               Color, type, and spacing tokens
```

## Swap in real auth later

`services/auth.ts` exports an `AuthProvider`:

- Keep `listDemoUsers()` for a staging fallback if you want.
- Implement `signInWithEmail` / `signInWithOAuth` (they currently throw).
- Point `AppProvider.signInDemo` at a session token and load the user from your API.
- The UI already gates on `currentUser`; you can replace `DemoLogin` with a real login screen without rewriting tabs.

## Swap in a real football API later

`services/football.ts` exports `FootballProvider` and `export const football = mockFootballProvider`.

Replace the mock with an adapter (FotMob-style, API-Football, Opta, etc.) that implements the same methods: continents, countries, leagues, teams, fixtures, standings, scorers, lineups.

Keep `data/types.ts` stable so screens do not care whether data is seeded or remote.

`FootballProvider` now also exposes `getPlayer`, `getSquad`, `getTeamCompetitions`, `getPlayerStats`, and `getPlayerAppearances`. A live adapter should fill those from the same IDs used on fixtures, lineups, and scorers.

Mock fixtures use `SeedFixture.kickoffOffsetMin` relative to “now” when `hydrateFixture` runs (`services/football.ts`). Status windows:

- **Upcoming** — kickoff still in the future
- **Live 1st half** — 0–45 minutes after kickoff
- **HT** — 45–48 minutes (3-minute half-time window)
- **Live 2nd half** — 48–98 minutes (display minute is elapsed minus HT, capped at 90)
- **Finished** — 98+ minutes (90 + 3 HT + 5 stoppage)

A live API would return real statuses instead of this clock.

## Roadmap

Karol’s batches (still mock/demo-first unless noted):

- **Batch 0 — deferred.** Public landing / kickfeed.polsia.app sneaker page. Explicitly skipped for now.
- **Batch 1 — done.** Teams, players, and competitions are first-class and clickable throughout the app (this release).
- **Batch 2 — next.** Global search and follow/favorite **players** (Following should include people *and* footballers).
- Later: live scores from a real football API, TV schedules, real auth, DMs, predictions.

## Theme

Pitch-green dark UI: forest backgrounds (`theme/colors`), lime accents, live red badges. Tokens live in `theme/index.ts`.

## License

MIT

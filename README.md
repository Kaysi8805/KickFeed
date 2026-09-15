# KickFeed

KickFeed is a cross-platform iOS and Android app (one Expo / React Native codebase) that combines a Facebook-style social feed with FotMob / Flashscore-style football scores, standings, and worldwide league browsing.

v1 is **fully local**: demo profiles, mock football data, and in-app notifications. No paid API keys and no backend.

## Features

- **Demo auth** — pick a seeded fan profile (Maya, Omar, Luca, …). No email/password or OAuth yet.
- **Profiles & favorites** — name, photo initials, bio, favorite clubs and competitions. Favorites drive Home live scores and Following.
- **Social feed & follows** — follow demo users, post text (optional photo), like posts, see friends + own posts.
- **Live scores & fixtures** — Live / Today / Upcoming, grouped by league. Match pages with score, events, lineup placeholders, and stats stubs.
- **Worldwide leagues** — continents → countries → competitions, plus featured Premier League, Champions League, La Liga, Serie A, and Bundesliga standings, form, and top scorers.
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

Use **Profile → Switch demo user** to pick another seeded fan. Real credentials are intentionally not collected.

## Project layout

```
app/                 Expo Router screens (tabs + stack)
components/          UI, feed cards, match rows
data/types.ts        Shared domain types
data/mocks/          Seeded users, teams, leagues, fixtures, posts
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

Mock fixtures use `SeedFixture.kickoffOffsetMin` relative to “now” when `hydrateFixture` runs (`services/football.ts`). Status windows:

- **Upcoming** — kickoff still in the future
- **Live 1st half** — 0–45 minutes after kickoff
- **HT** — 45–48 minutes (3-minute half-time window)
- **Live 2nd half** — 48–98 minutes (display minute is elapsed minus HT, capped at 90)
- **Finished** — 98+ minutes (90 + 3 HT + 5 stoppage)

A live API would return real statuses instead of this clock.

## Theme

Pitch-green dark UI: forest backgrounds (`theme/colors`), lime accents, live red badges. Tokens live in `theme/index.ts`.

## License

MIT

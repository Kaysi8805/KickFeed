# KickFeed football BFF

Thin GET proxy in front of [API-Football](https://www.api-football.com/documentation-v3) so Expo clients (and multi-device demos) share one **100 req/day** budget.

The worker keeps the key on the server (`FOOTBALL_API_KEY`), allowlists the paths KickFeed already calls, **allowlists live coverage leagues**, and caches fixtures / standings / scorers / squads / events / lineups in memory with a quota-aware TTL. 429 / 5xx responses reuse **stale cache** when one exists.

The Expo app does **not** need this running for CI or mock-catalog demos. Point the client at it only when you want live England / Slovakia / La Liga scores without putting the key in `EXPO_PUBLIC_*`.

## Live coverage (origin allowlist)

| League id | Competition | Country |
| --- | --- | --- |
| `39` | Premier League | England |
| `40` | Championship | England |
| `332` | Niké Liga (Super Liga) | Slovakia |
| `140` | La Liga | Spain |

`GET /fixtures`, `/standings`, `/players/topscorers`, and `/teams/statistics` **require** `?league=` in that set. UCL (`2`), Bundesliga (`78`), and anything else is `400` and never hits origin. FA Cup is skipped on purpose.

`GET /teams/statistics` also requires `season` (four-digit year) and a numeric `team`. A `date` override, a second team, or any other query key is `400` — those would multiply the one-club-per-day budget. `/coachs`, `/teams`, and `/fixtures/statistics` are not allowlisted.

**La Liga vs Bundesliga:** La Liga is the extra top-5 EU league because KickFeed already has a featured Spanish mock tree (aliases for Real Madrid / Barcelona) and its kickoff spread complements England. Bundesliga would stack another Saturday 15:30 CET block for the same quota cost.

## Endpoints

| Path | Upstream | Origin TTL |
| --- | --- | --- |
| `GET /health` | none | — (lists coverage, TTLs, cache size, quota note) |
| `GET /fixtures?league=` | `/fixtures` | **45s if any row is live, else 5 min** |
| `GET /standings?league=` | `/standings` | 15 min |
| `GET /players/topscorers?league=` | `/players/topscorers` | 30 min |
| `GET /players?id=&season=` | `/players` | 12 h |
| `GET /players/squads` | `/players/squads` | 30 min |
| `GET /teams/statistics?league=&season=&team=` | `/teams/statistics` | **24 h** |
| `GET /fixtures/events` | `/fixtures/events` | 60s |
| `GET /fixtures/lineups` | `/fixtures/lineups` | 60s |

Anything else is `404`. `POST` is `405`. CORS is `*` for Expo web. Responses are the **API-Football JSON envelope** (same as talking to `v3.football.api-sports.io` directly). Cache status is `X-KickFeed-Cache: HIT \| MISS \| STALE \| BYPASS`.

### Quota math (~100 req/day)

Cold hydrate from the app is **9 origin calls** when the BFF cache is empty: 4 leagues × (fixtures + standings) + Premier League scorers. Squads, events, lineups, player seasons, and team statistics stay lazy. Opening a club Overview adds **at most one** `/teams/statistics` origin call for that club’s primary covered league, then the BFF and the app cache it for 24 hours and coalesce in-flight misses. Another device the same day is a HIT. Shots, possession, and coach are not on that payload; KickFeed does not fan out `/fixtures/statistics` or `/coachs` to fill them.

If a league window has a live match, that fixtures key refreshes every 45s **per BFF process**, not per device. Idle leagues stay at 5 minutes. Do not poll extra competitions — the allowlist is the budget.

## Env (never commit secrets)

**Server (BFF)**

```
FOOTBALL_API_KEY=your_api_football_key
```

**Client (Expo)** — `.env` at the repo root:

```
EXPO_PUBLIC_FOOTBALL_BFF_URL=http://127.0.0.1:8787
```

Leave `EXPO_PUBLIC_FOOTBALL_API_KEY` empty when the BFF URL is set. The live `FootballProvider` prefers the BFF and still falls back to mock when neither BFF nor a public key is set.

## Run locally

From the repo root (Node 22):

```bash
FOOTBALL_API_KEY=your_key_here npm run bff
```

Health check: `curl http://127.0.0.1:8787/health`

Try a covered league (needs a key):

```bash
curl http://127.0.0.1:8787/fixtures?league=332
curl http://127.0.0.1:8787/fixtures?league=140
```

Uncovered leagues should 400 without an origin call: `curl http://127.0.0.1:8787/fixtures?league=2`

## Deploy (Cloudflare Worker, free tier)

```bash
cd bff
npx wrangler@latest login
npx wrangler@latest secret put FOOTBALL_API_KEY --config wrangler.toml
npx wrangler@latest deploy --config wrangler.toml
```

Then set the client to the `*.workers.dev` URL (no trailing slash):

```
EXPO_PUBLIC_FOOTBALL_BFF_URL=https://kickfeed-football-bff.<account>.workers.dev
```

Local Wrangler (uses `bff/.dev.vars`, gitignored):

```bash
cp bff/.dev.vars.example bff/.dev.vars
# edit FOOTBALL_API_KEY
npx wrangler@latest dev --config bff/wrangler.toml
```

The Fetch handler in `lib/footballBff.ts` is host-agnostic. Dropping it onto Vercel Edge / another serverless runtime is a thin `export default function` wrapper — this repo ships the Cloudflare Worker + Node loopback as the supported paths.

## CI

Unit tests mock `fetch` and never need a live key (`lib/__tests__/footballBff.test.ts`). Do not add `FOOTBALL_API_KEY` to GitHub Actions.

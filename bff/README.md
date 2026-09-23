# KickFeed football BFF

Thin GET proxy in front of [API-Football](https://www.api-football.com/documentation-v3) so Expo clients (and multi-device demos) share one **100 req/day** budget.

The worker keeps the key on the server (`FOOTBALL_API_KEY`), allowlists the paths KickFeed already calls, **allowlists live coverage leagues**, and caches fixtures / standings / scorers / squads / events / lineups in memory with a quota-aware TTL. 429 / 5xx responses reuse **stale cache** when one exists (up to 6 hours after expiry).

The cache is **in-memory per Cloudflare isolate** (one Node process when you run `npm run bff`). Isolates do not share it. There is no KV namespace — a cold isolate is a cache miss and spends origin quota. The map is capped (128 entries) so a long-lived isolate stays inside the free-tier memory limit. Eviction drops stale rows first, then long-lived fresh rows, so a 45s live fixtures entry outranks a 24h team-stats blob.

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
| `GET /health` | none | — (`no-store`; `keyConfigured`, coverage, TTLs, per-isolate cache size, last rate-limit headers) |
| `GET /fixtures?league=` | `/fixtures` | **45s if any row is live, else 5 min** |
| `GET /standings?league=` | `/standings` | 15 min |
| `GET /players/topscorers?league=` | `/players/topscorers` | 30 min |
| `GET /players?id=&season=` | `/players` | 12 h |
| `GET /players/squads` | `/players/squads` | 30 min |
| `GET /teams/statistics?league=&season=&team=` | `/teams/statistics` | **24 h** |
| `GET /fixtures/events` | `/fixtures/events` | 60s |
| `GET /fixtures/lineups` | `/fixtures/lineups` | 60s |

Anything else is `404`. `POST` is `405`. CORS is `*` for Expo web: GET and OPTIONS only, allowed request headers are `Accept` and `Content-Type` (not `x-apisports-key`), and `Access-Control-Allow-Credentials` is never set. Responses are the **API-Football JSON envelope** (same as talking to `v3.football.api-sports.io` directly).

Cache headers:

| `X-KickFeed-Cache` | `Cache-Control` |
| --- | --- |
| `HIT` / `MISS` | `public, max-age=` remaining freshness in seconds |
| `STALE` | `no-store` (browser must come back; the worker may still be serving a 429 fallback) |
| `BYPASS` | `no-store` |

`/health` is `Cache-Control: no-store`. `quota.remaining` is the last `x-ratelimit-requests-remaining` **this isolate** saw. It stays `null` until that isolate has called API-Football. It is not a global counter.

### Quota math (~100 req/day)

Cold hydrate from the app is **9 origin calls** when the BFF cache is empty: 4 leagues × (fixtures + standings) + Premier League scorers. Squads, events, lineups, player seasons, and team statistics stay lazy. Opening a club Overview adds **at most one** `/teams/statistics` origin call for that club’s primary covered league, then the BFF and the app cache it for 24 hours and coalesce in-flight misses. Another device the same day is a HIT. Shots and possession are not on that payload; KickFeed does not fan out `/fixtures/statistics` to fill them. A coach name is mapped when the statistics body includes one, and Overview can also show a coach already stored on a cached lineup. `/coachs` stays off the allowlist.

If a league window has a live match, that fixtures key refreshes every 45s **per isolate**, not per device. Idle leagues stay at 5 minutes. Do not poll extra competitions — the allowlist is the budget. Two isolates can both miss and both spend a request.

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

From the **repo root** (do not commit the key):

```bash
npx wrangler@latest login
npx wrangler@latest secret put FOOTBALL_API_KEY --config bff/wrangler.toml
npx wrangler@latest deploy --config bff/wrangler.toml
```

Deploy prints the origin. Paste it with no trailing slash (replace `<account>`):

```text
https://kickfeed-football-bff.<account>.workers.dev
```

Release builds read that URL from EAS, not from a client API key. Full paste commands, curl, and the Matches check are in the root README under **Batch 1 prod checklist**. `eas.json` already points preview/production at the `<account>` placeholder; an EAS plaintext env var with the same name overrides it. The app treats the unreplaced placeholder as unset and stays on mocks.

Local Wrangler (uses `bff/.dev.vars`, gitignored):

```bash
cp bff/.dev.vars.example bff/.dev.vars
# edit FOOTBALL_API_KEY
npx wrangler@latest dev --config bff/wrangler.toml
```

The Fetch handler in `lib/footballBff.ts` is host-agnostic. Dropping it onto Vercel Edge / another serverless runtime is a thin `export default function` wrapper — this repo ships the Cloudflare Worker + Node loopback as the supported paths.

## CI

Unit tests mock `fetch` and never need a live key (`lib/__tests__/footballBff.test.ts`). Do not add `FOOTBALL_API_KEY` to GitHub Actions.

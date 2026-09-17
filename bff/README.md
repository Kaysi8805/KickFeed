# KickFeed football BFF

Thin GET proxy in front of [API-Football](https://www.api-football.com/documentation-v3) so Expo clients (and multi-device demos) share one **100 req/day** budget.

The worker keeps the key on the server (`FOOTBALL_API_KEY`), allowlists the paths KickFeed already calls, and caches fixtures / standings / scorers / squads / events / lineups in memory with a short TTL.

The Expo app does **not** need this running for CI or mock-catalog demos. Point the client at it only when you want live England scores without putting the key in `EXPO_PUBLIC_*`.

## Endpoints

| Path | Upstream | TTL |
| --- | --- | --- |
| `GET /health` | none | — |
| `GET /fixtures` | `/fixtures` | 45s |
| `GET /standings` | `/standings` | 5 min |
| `GET /players/topscorers` | `/players/topscorers` | 15 min |
| `GET /players/squads` | `/players/squads` | 30 min |
| `GET /fixtures/events` | `/fixtures/events` | 45s |
| `GET /fixtures/lineups` | `/fixtures/lineups` | 45s |

Anything else is `404`. `POST` is `405`. CORS is `*` for Expo web. Responses are the **API-Football JSON envelope** (same as talking to `v3.football.api-sports.io` directly).

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

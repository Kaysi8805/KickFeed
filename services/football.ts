import type {
  Fixture,
  League,
  Lineup,
  MatchEvent,
  MatchStatus,
  Player,
  PlayerAppearance,
  PlayerPosition,
  PlayerStats,
  SeedFixture,
} from '@/data/types';
import { continents, countries, leagues, leagueRosters, teams } from '@/data/mocks/catalog';
import { seedFixtures } from '@/data/mocks/fixtures';
import { allPlayers, findPlayerById, findPlayerByName, foldName, squadFor } from '@/data/mocks/players';
import { scorersFor, standingsFor } from '@/data/mocks/stats';
import { teamStatsFor } from '@/data/mocks/teamStats';
import { createApiFootballHttp, footballApiKeyFromEnv, footballBffUrlFromEnv } from '@/services/footballApi';
import { createLiveFootballProvider } from '@/services/footballLive';
import type { FootballProvider } from '@/services/footballTypes';
import { MOCK_FOOTBALL_STATUS, noopAsync } from '@/services/footballTypes';

const teamMap = new Map(teams.map((t) => [t.id, t]));
const leagueMap = new Map(leagues.map((l) => [l.id, l]));
const countryMap = new Map(countries.map((c) => [c.id, c]));

function scoreFromEvents(events: SeedFixture['events'], teamId: string): number {
  return events.filter((e) => e.type === 'goal' && e.teamId === teamId).length;
}

function fallbackFinishedScore(id: string): { home: number; away: number } {
  let n = 0;
  for (let i = 0; i < id.length; i += 1) n = (n * 31 + id.charCodeAt(i)) >>> 0;
  const home = n % 4;
  const away = (n >>> 8) % 4;
  if (home === 0 && away === 0) return { home: 1, away: 0 };
  return { home, away };
}

function hash(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i += 1) n = (n * 31 + s.charCodeAt(i)) >>> 0;
  return n;
}

function withPlayerId(event: MatchEvent): MatchEvent {
  if (event.playerId) return event;
  const player = findPlayerByName(event.teamId, event.playerName);
  return player ? { ...event, playerId: player.id } : event;
}

function takePos(squad: Player[], pos: PlayerPosition, n: number, used: Set<string>): Player[] {
  const picked = squad.filter((p) => p.pos === pos && !used.has(p.id)).slice(0, n);
  picked.forEach((p) => used.add(p.id));
  return picked;
}

/** 4-3-3 grid: goalkeeper, then each outfield row. Index follows `demoLineup` order. */
function demoGrid(index: number): { row: number; col: number } {
  const rows = [1, 4, 3, 3];
  let cursor = index;
  for (let row = 0; row < rows.length; row += 1) {
    const size = rows[row]!;
    if (cursor < size) return { row: row + 1, col: cursor + 1 };
    cursor -= size;
  }
  return { row: 1, col: 1 };
}

function demoLineup(teamId: string): Lineup {
  const squad = squadFor(teamId);
  const used = new Set<string>();
  const xi = [
    ...takePos(squad, 'GK', 1, used),
    ...takePos(squad, 'DF', 4, used),
    ...takePos(squad, 'MF', 3, used),
    ...takePos(squad, 'FW', 3, used),
  ];
  for (const p of squad) {
    if (xi.length >= 11) break;
    if (!used.has(p.id)) {
      xi.push(p);
      used.add(p.id);
    }
  }
  const bench = squad.filter((p) => !used.has(p.id));
  return {
    formation: '4-3-3',
    source: 'demo',
    players: xi.map((p, index) => ({
      name: p.name,
      number: p.number,
      pos: p.pos,
      playerId: p.id,
      grid: demoGrid(index),
    })),
    bench: bench.map((p) => ({ name: p.name, number: p.number, pos: p.pos, playerId: p.id })),
  };
}

/**
 * Mock match clock, in minutes after kickoff (`elapsed`).
 * `SeedFixture.kickoffOffsetMin` is applied against `now` at hydrate time so the
 * catalog always contains live / today / upcoming fixtures without a live API.
 *
 * | elapsed t (min) | status    | display minute                         |
 * |-----------------|-----------|----------------------------------------|
 * | t < 0           | upcoming  | —                                      |
 * | 0 ≤ t < 45      | live      | max(1, floor(t))  (1st half)           |
 * | 45 ≤ t < 48     | ht        | 45  (3-minute half-time window)        |
 * | 48 ≤ t < 98     | live      | min(90, max(46, floor(t − 3)))         |
 * | t ≥ 98          | finished  | —  (90 + 3 HT + 5 stoppage)            |
 */
export const MOCK_FIRST_HALF_END = 45;
export const MOCK_HT_END = 48;
export const MOCK_FULL_TIME = 98;

export function hydrateFixture(seed: SeedFixture, now = Date.now()): Fixture {
  const kickoff = new Date(now + seed.kickoffOffsetMin * 60_000).toISOString();
  const elapsed = (now - Date.parse(kickoff)) / 60_000;
  let status: MatchStatus = 'upcoming';
  let minute: number | undefined;
  let homeScore = 0;
  let awayScore = 0;

  if (seed.finishedHome != null && seed.finishedAway != null && elapsed >= MOCK_FULL_TIME) {
    status = 'finished';
    homeScore = seed.finishedHome;
    awayScore = seed.finishedAway;
  } else if (elapsed >= MOCK_FULL_TIME) {
    status = 'finished';
    homeScore = seed.finishedHome ?? scoreFromEvents(seed.events, seed.homeTeamId);
    awayScore = seed.finishedAway ?? scoreFromEvents(seed.events, seed.awayTeamId);
    if (!seed.events.length && seed.finishedHome == null) {
      const score = fallbackFinishedScore(seed.id);
      homeScore = score.home;
      awayScore = score.away;
    }
  } else if (elapsed >= 0) {
    if (elapsed >= MOCK_FIRST_HALF_END && elapsed < MOCK_HT_END) {
      status = 'ht';
      minute = MOCK_FIRST_HALF_END;
    } else if (elapsed < MOCK_FIRST_HALF_END) {
      status = 'live';
      minute = Math.max(1, Math.floor(elapsed));
    } else {
      status = 'live';
      minute = Math.min(90, Math.max(MOCK_FIRST_HALF_END + 1, Math.floor(elapsed - (MOCK_HT_END - MOCK_FIRST_HALF_END))));
    }
    const visible = seed.events.filter((e) => e.minute <= (minute ?? MOCK_FIRST_HALF_END));
    homeScore = scoreFromEvents(visible, seed.homeTeamId);
    awayScore = scoreFromEvents(visible, seed.awayTeamId);
  }

  const visibleEvents =
    status === 'upcoming'
      ? []
      : seed.events.filter((e) => status === 'finished' || e.minute <= (minute ?? 99));

  return {
    id: seed.id,
    leagueId: seed.leagueId,
    homeTeamId: seed.homeTeamId,
    awayTeamId: seed.awayTeamId,
    kickoff,
    status,
    minute,
    homeScore,
    awayScore,
    events: visibleEvents.map(withPlayerId),
    venue: seed.venue,
  };
}

export function teamCompetitions(teamId: string): League[] {
  return leagues.filter((l) => (leagueRosters[l.id] ?? []).includes(teamId));
}

export function primaryLeague(teamId: string): League | undefined {
  return primaryLeagueFrom(football, teamId);
}

function appearancesFor(player: Player, now = Date.now()): PlayerAppearance[] {
  const fixtures = seedFixtures
    .map((s) => hydrateFixture(s, now))
    .filter((f) => f.homeTeamId === player.teamId || f.awayTeamId === player.teamId)
    .filter((f) => f.status !== 'upcoming')
    .sort((a, b) => Date.parse(b.kickoff) - Date.parse(a.kickoff));

  const out: PlayerAppearance[] = [];
  for (const f of fixtures) {
    const starter = demoLineup(player.teamId).players.some((p) => p.playerId === player.id);
    const events = f.events.filter(
      (e) => e.playerId === player.id || (e.teamId === player.teamId && foldName(e.playerName) === foldName(player.shortName)),
    );
    if (!starter && events.length === 0) continue;
    const h = hash(`${player.id}:${f.id}`);
    const goals = events.filter((e) => e.type === 'goal').length;
    out.push({
      fixtureId: f.id,
      starter,
      minutes: starter ? Math.min(90, 78 + (h % 13)) : 12 + (h % 28),
      goals,
      assists: events.some((e) => /assist/i.test(e.detail ?? '')) ? 1 : 0,
      rating: Number((6.3 + (h % 24) / 10 + goals * 0.35).toFixed(1)),
    });
    if (out.length >= 6) break;
  }
  return out;
}

function statsFor(player: Player): PlayerStats {
  const apps = appearancesFor(player);
  const h = hash(player.id);
  let goals = apps.reduce((n, a) => n + a.goals, 0);
  let assists = apps.reduce((n, a) => n + a.assists, 0);
  for (const league of teamCompetitions(player.teamId)) {
    const row = scorersFor(league.id).find(
      (s) => s.playerId === player.id || (s.teamId === player.teamId && foldName(s.playerName) === foldName(player.shortName)),
    );
    if (row) {
      goals = Math.max(goals, row.goals);
      assists = Math.max(assists, row.assists);
    }
  }
  if (goals === 0 && player.pos === 'FW') goals = 1 + (h % 6);
  if (assists === 0 && (player.pos === 'MF' || player.pos === 'FW')) assists = h % 5;
  const appearances = Math.max(apps.length, player.pos === 'GK' ? 8 + (h % 4) : 6 + (h % 8));
  return {
    appearances,
    goals,
    assists,
    minutes: appearances * (82 + (h % 8)),
    yellows: h % 5,
    reds: h % 17 === 0 ? 1 : 0,
    rating: Number((6.4 + (h % 22) / 10).toFixed(1)),
  };
}

export type { FootballEntityKind, FootballProvider, FootballSource, FootballStatus } from '@/services/footballTypes';

export const mockFootballProvider: FootballProvider = {
  getContinents: () => continents,
  getContinent: (id) => continents.find((c) => c.id === id),
  getCountries: (continentId) =>
    continentId ? countries.filter((c) => c.continentId === continentId) : countries,
  getCountry: (id) => countryMap.get(id),
  getLeagues: (countryId) => (countryId ? leagues.filter((l) => l.countryId === countryId) : leagues),
  getFeaturedLeagues: () => leagues.filter((l) => l.featured),
  getLeague: (id) => leagueMap.get(id),
  getTeams: (leagueId) => {
    if (!leagueId) return teams;
    const ids = new Set(leagueRosters[leagueId] ?? []);
    return teams.filter((t) => ids.has(t.id));
  },
  getTeam: (id) => teamMap.get(id),
  getPlayer: (id) => findPlayerById(id),
  getPlayers: () => allPlayers(),
  getSquad: (teamId) => squadFor(teamId),
  getTeamCompetitions: (teamId) => teamCompetitions(teamId),
  getPlayerStats: (playerId) => {
    const player = findPlayerById(playerId);
    return player ? statsFor(player) : undefined;
  },
  getTeamStats: (teamId) => teamStatsFor(teamId),
  getPlayerAppearances: (playerId) => {
    const player = findPlayerById(playerId);
    return player ? appearancesFor(player) : [];
  },
  getFixtures: (opts) => {
    const now = Date.now();
    return seedFixtures
      .map((s) => hydrateFixture(s, now))
      .filter((f) => {
        if (opts?.leagueId && f.leagueId !== opts.leagueId) return false;
        if (opts?.teamId && f.homeTeamId !== opts.teamId && f.awayTeamId !== opts.teamId) return false;
        return true;
      })
      .sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff));
  },
  getFixture: (id) => {
    const seed = seedFixtures.find((s) => s.id === id);
    return seed ? hydrateFixture(seed) : undefined;
  },
  getStandings: (leagueId) => standingsFor(leagueId),
  getTopScorers: (leagueId) => scorersFor(leagueId),
  getLineups: (fixture) => ({
    home: demoLineup(fixture.homeTeamId),
    away: demoLineup(fixture.awayTeamId),
  }),
  getCachedLiveLineups: () => undefined,
  getStatus: () => MOCK_FOOTBALL_STATUS,
  hydrate: noopAsync,
  refresh: noopAsync,
  subscribe: () => () => undefined,
  ensureSquad: noopAsync,
  ensureMatchDetail: noopAsync,
  ensureLineups: async () => 'ready',
  ensureScorers: noopAsync,
  ensurePlayerSeason: noopAsync,
  ensureTeamStats: noopAsync,
  relatedIds: (_kind, id) => [id],
};

export function selectFootballProvider(
  apiKey = footballApiKeyFromEnv(),
  fallback: FootballProvider = mockFootballProvider,
  bffUrl = footballBffUrlFromEnv(),
): FootballProvider {
  if (bffUrl) {
    // BFF owns the key. A client EXPO_PUBLIC_FOOTBALL_API_KEY is ignored and not sent.
    return createLiveFootballProvider({ http: createApiFootballHttp({ bffUrl }), fallback });
  }
  if (!apiKey) return fallback;
  return createLiveFootballProvider({ apiKey, fallback });
}

/** Mock unless a BFF URL or `EXPO_PUBLIC_FOOTBALL_API_KEY` is set. TV listings are a separate `TvProvider` (`services/tv.ts`). */
export const football: FootballProvider = selectFootballProvider();

export function primaryLeagueFrom(provider: FootballProvider, teamId: string): League | undefined {
  const comps = provider.getTeamCompetitions(teamId);
  return comps.find((l) => l.featured) ?? comps[0];
}

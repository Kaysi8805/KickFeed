import type {
  Fixture,
  League,
  Lineup,
  Player,
  PlayerAppearance,
  PlayerStats,
  Scorer,
  StandingRow,
  Team,
  TeamSeasonStats,
} from '@/data/types';
import { foldName } from '@/data/mocks/players';
import { FOOTBALL_TTL, TtlCache, fixturesTtlMs } from '@/lib/ttlCache';
import type { FootballHttp } from '@/services/footballApi';
import {
  LIVE_LEAGUE_IDS as LIVE_LEAGUE_ID_LIST,
  LIVE_GEO_LABEL,
  MOCK_IDS_HIDDEN_WHEN_LIVE,
  PREMIER_LEAGUE_ID,
  isLiveCountryId,
  liveLeagueName,
} from '@/lib/footballCoverage';
import {
  createApiFootballHttp,
  fixtureDateWindow,
  footballSeasonFromEnv,
} from '@/services/footballApi';
import type { FootballProvider, FootballStatus } from '@/services/footballTypes';
import {
  LIVE_LEAGUES,
  canonicalLeagueId,
  emptyLineup,
  hasLiveFixture,
  isLiveLeague,
  leagueAliases,
  liveCountryIdForLeague,
  mapFixture,
  mapLineup,
  mapMatchEvent,
  mapPlayerSeason,
  mapPlayerStats,
  mapScorer,
  mapSquadPlayer,
  mapStandingRow,
  mapTeam,
  mapTeamStatistics,
  mockClubStyle,
} from '@/services/footballMap';
import type {
  ApiEvent,
  ApiFixture,
  ApiLineup,
  ApiPlayerSeason,
  ApiScorer,
  ApiSquadResponse,
  ApiStandingRow,
} from '@/services/footballApi';

const LIVE_LEAGUE_IDS = new Set<string>(LIVE_LEAGUE_ID_LIST);
const MOCK_LEAGUE_IDS = new Set<string>(MOCK_IDS_HIDDEN_WHEN_LIVE);

type LineupPair = { home: Lineup; away: Lineup };

interface LiveSnapshot {
  teams: Map<string, Team>;
  players: Map<string, Player>;
  squads: Map<string, Player[]>;
  fixtures: Map<string, Fixture>;
  standings: Map<string, StandingRow[]>;
  scorers: Map<string, Scorer[]>;
  stats: Map<string, PlayerStats>;
  teamStats: Map<string, TeamSeasonStats>;
  lineups: Map<string, LineupPair>;
  teamLeagueIds: Map<string, Set<string>>;
  teamAliases: Map<string, string>;
  playerAliases: Map<string, string>;
  fixtureAliases: Map<string, string>;
}

function emptySnapshot(): LiveSnapshot {
  return {
    teams: new Map(),
    players: new Map(),
    squads: new Map(),
    fixtures: new Map(),
    standings: new Map(),
    scorers: new Map(),
    stats: new Map(),
    teamStats: new Map(),
    lineups: new Map(),
    teamLeagueIds: new Map(),
    teamAliases: new Map(),
    playerAliases: new Map(),
    fixtureAliases: new Map(),
  };
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function numericPlayerId(id: string | undefined): string | undefined {
  if (id && /^[1-9]\d*$/.test(id)) return id;
  return undefined;
}

function rememberTeam(snap: LiveSnapshot, team: Team, leagueId?: string) {
  snap.teams.set(team.id, team);
  const style = mockClubStyle(team.name, team.code);
  if (style.mockId) snap.teamAliases.set(style.mockId, team.id);
  snap.teamAliases.set(team.id, team.id);
  if (leagueId) {
    const set = snap.teamLeagueIds.get(team.id) ?? new Set<string>();
    set.add(leagueId);
    snap.teamLeagueIds.set(team.id, set);
  }
}

function rememberPlayer(snap: LiveSnapshot, player: Player) {
  snap.players.set(player.id, player);
  const alias = `p-${player.teamId}-${player.number}`;
  snap.playerAliases.set(alias, player.id);
  const mockTeam = [...snap.teamAliases.entries()].find(([, liveId]) => liveId === player.teamId)?.[0];
  if (mockTeam) snap.playerAliases.set(`p-${mockTeam}-${player.number}`, player.id);
}

function fixturePairKey(homeTeamId: string, awayTeamId: string, leagueId: string): string {
  return `${canonicalLeagueId(leagueId) ?? leagueId}|${homeTeamId}|${awayTeamId}`;
}

function reindexFixtureAliases(snap: LiveSnapshot, fallback: FootballProvider) {
  snap.fixtureAliases.clear();
  const groups = new Map<string, { lives: string[]; mocks: string[] }>();
  const touch = (key: string) => {
    const group = groups.get(key) ?? { lives: [], mocks: [] };
    groups.set(key, group);
    return group;
  };
  for (const liveFx of snap.fixtures.values()) {
    touch(fixturePairKey(liveFx.homeTeamId, liveFx.awayTeamId, liveFx.leagueId)).lives.push(liveFx.id);
  }
  for (const mock of fallback.getFixtures()) {
    const home = snap.teamAliases.get(mock.homeTeamId) ?? mock.homeTeamId;
    const away = snap.teamAliases.get(mock.awayTeamId) ?? mock.awayTeamId;
    const group = groups.get(fixturePairKey(home, away, mock.leagueId));
    if (!group) continue;
    group.mocks.push(mock.id);
  }
  for (const group of groups.values()) {
    if (group.lives.length !== 1 || group.mocks.length !== 1) continue;
    const liveId = group.lives[0]!;
    const mockId = group.mocks[0]!;
    snap.fixtureAliases.set(mockId, liveId);
    snap.fixtureAliases.set(liveId, liveId);
  }
}

function isAliasedMockFixture(snap: LiveSnapshot, mockId: string): boolean {
  const liveId = snap.fixtureAliases.get(mockId);
  return !!liveId && liveId !== mockId;
}

export function createLiveFootballProvider(opts: {
  fallback: FootballProvider;
  http?: FootballHttp;
  apiKey?: string;
  season?: number;
  now?: () => number;
}): FootballProvider {
  const fallback = opts.fallback;
  const http = opts.http ?? createApiFootballHttp(opts.apiKey ?? '');
  const now = opts.now ?? Date.now;
  const cache = new TtlCache<unknown>();
  const snap = emptySnapshot();
  /** Clubs whose `/teams/statistics` ensure finished (hit or miss). Avoids flashing mock as live. */
  const teamStatsAttempted = new Set<string>();
  const listeners = new Set<() => void>();
  const inflight = new Map<string, Promise<unknown>>();
  let hydratePromise: Promise<void> | null = null;
  let status: FootballStatus = {
    source: 'live',
    ready: false,
    loading: false,
    error: null,
    lastSyncedAt: null,
    geoLabel: LIVE_GEO_LABEL,
  };

  const emit = () => {
    for (const listener of listeners) listener();
  };

  const setStatus = (patch: Partial<FootballStatus>) => {
    status = { ...status, ...patch };
    emit();
  };

  const load = async <T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> => {
    const fresh = cache.get(key, now()) as T | undefined;
    if (fresh !== undefined) return fresh;
    const pending = inflight.get(key) as Promise<T> | undefined;
    if (pending) return pending;
    const task = loader()
      .then((value) => {
        cache.set(key, value, ttlMs, now());
        inflight.delete(key);
        return value;
      })
      .catch((err) => {
        inflight.delete(key);
        const stale = cache.peek(key) as T | undefined;
        if (stale !== undefined) return stale;
        throw err;
      });
    inflight.set(key, task);
    return task;
  };

  const ingestTeamsFromFixtures = (rows: ApiFixture[]) => {
    for (const row of rows) {
      const leagueId = String(row.league.id);
      const countryId = liveCountryIdForLeague(leagueId);
      rememberTeam(snap, mapTeam(row.teams.home, countryId), leagueId);
      rememberTeam(snap, mapTeam(row.teams.away, countryId), leagueId);
    }
  };

  const ingestFixtures = (rows: ApiFixture[]) => {
    ingestTeamsFromFixtures(rows);
    for (const row of rows) {
      const mapped = mapFixture(row);
      if (!mapped) continue;
      const prev = snap.fixtures.get(mapped.id);
      snap.fixtures.set(mapped.id, prev ? { ...mapped, events: prev.events } : mapped);
    }
  };

  const ingestStandings = (leagueId: string, rows: ApiStandingRow[]) => {
    snap.standings.set(leagueId, rows.map(mapStandingRow));
    const countryId = liveCountryIdForLeague(leagueId);
    for (const row of rows) rememberTeam(snap, mapTeam(row.team, countryId), leagueId);
  };

  const ingestScorers = (leagueId: string, rows: ApiScorer[]) => {
    const scorers: Scorer[] = [];
    rows.forEach((row, i) => {
      const mapped = mapScorer(row, i);
      if (!mapped) return;
      scorers.push(mapped);
      const stats = mapPlayerStats(row);
      if (stats) snap.stats.set(mapped.playerId ?? String(row.player.id), stats);
      const existing = snap.players.get(String(row.player.id));
      if (!existing) {
        rememberPlayer(
          snap,
          {
            id: String(row.player.id),
            name: row.player.name,
            shortName: row.player.name.split(/\s+/).slice(-1)[0] ?? row.player.name,
            teamId: mapped.teamId,
            number: 0,
            pos: 'FW',
            nationality: row.player.nationality ?? 'ENG',
            age: 0,
          },
        );
      }
    });
    snap.scorers.set(leagueId, scorers);
  };

  const windowParams = () => {
    const season = opts.season ?? footballSeasonFromEnv();
    const { from, to } = fixtureDateWindow(new Date(now()));
    return { season, from, to };
  };

  const fetchLeagueFixtures = async (leagueId: string) => {
    const { season, from, to } = windowParams();
    const key = `fixtures:${leagueId}:${season}:${from}:${to}`;
    const rows = await load(key, FOOTBALL_TTL.fixturesIdleMs, () =>
      http('/fixtures', { league: leagueId, season, from, to }).then((r) => asArray<ApiFixture>(r)),
    );
    ingestFixtures(rows);
    reindexFixtureAliases(snap, fallback);
    const mapped = [...snap.fixtures.values()];
    cache.set(key, rows, fixturesTtlMs(hasLiveFixture(mapped)), now());
  };

  const fetchLeagueStandings = async (leagueId: string) => {
    const season = opts.season ?? footballSeasonFromEnv();
    const key = `standings:${leagueId}:${season}`;
    const payload = await load(key, FOOTBALL_TTL.standingsMs, () => http('/standings', { league: leagueId, season }));
    const groups = asArray<{ league?: { standings?: ApiStandingRow[][] } }>(payload);
    const table = groups[0]?.league?.standings?.[0] ?? [];
    ingestStandings(leagueId, table);
  };

  const fetchLeagueScorers = async (leagueId: string) => {
    const season = opts.season ?? footballSeasonFromEnv();
    const key = `scorers:${leagueId}:${season}`;
    const rows = await load(key, FOOTBALL_TTL.scorersMs, () =>
      http('/players/topscorers', { league: leagueId, season }).then((r) => asArray<ApiScorer>(r)),
    );
    ingestScorers(leagueId, rows);
  };

  const resolveTeamId = (id: string): string => snap.teamAliases.get(id) ?? (snap.teams.has(id) ? id : id);
  const resolvePlayerId = (id: string): string => snap.playerAliases.get(id) ?? id;
  const resolveLeagueId = (id: string): string => canonicalLeagueId(id) ?? id;

  const liveTeam = (id: string): Team | undefined => snap.teams.get(resolveTeamId(id));
  const livePlayer = (id: string): Player | undefined => {
    const canonical = resolvePlayerId(id);
    const hit = snap.players.get(canonical);
    if (hit) return hit;
    const byName = fallback.getPlayer(id);
    if (!byName) return undefined;
    const teamLive = liveTeam(byName.teamId);
    if (!teamLive) return undefined;
    const squad = snap.squads.get(teamLive.id) ?? [];
    const q = foldName(byName.name);
    const match = squad.find((p) => foldName(p.name) === q || foldName(p.shortName) === q);
    if (match) {
      snap.playerAliases.set(id, match.id);
      return match;
    }
    return { ...byName, teamId: teamLive.id };
  };

  const relatedTeamIds = (id: string): string[] => {
    const canonical = liveTeam(id)?.id ?? id;
    const out = new Set<string>([id, canonical]);
    for (const [alias, liveId] of snap.teamAliases) {
      if (liveId === canonical) out.add(alias);
    }
    return [...out];
  };

  /** Mock catalog id for a live coverage club (e.g. `liv` for API id `40`). */
  const mockAliasForTeam = (team: Team): string | undefined => {
    for (const [alias, liveId] of snap.teamAliases) {
      if (liveId === team.id && alias !== liveId && fallback.getTeam(alias)) return alias;
    }
    const style = mockClubStyle(team.name, team.code);
    if (style.mockId && fallback.getTeam(style.mockId)) return style.mockId;
    return undefined;
  };

  const relatedPlayerIds = (id: string): string[] => {
    const player = livePlayer(id) ?? fallback.getPlayer(id);
    const canonical = player?.id ?? id;
    const out = new Set<string>([id, canonical]);
    for (const [alias, liveId] of snap.playerAliases) {
      if (liveId === canonical) out.add(alias);
    }
    return [...out];
  };

  const relatedLeagueIds = (id: string): string[] => {
    const canonical = resolveLeagueId(id);
    if (!LIVE_LEAGUE_IDS.has(canonical)) return [id];
    return leagueAliases(canonical);
  };

  const relatedMatchIds = (id: string): string[] => {
    const canonical = snap.fixtureAliases.get(id) ?? (snap.fixtures.has(id) ? id : undefined);
    const out = new Set<string>([id]);
    if (!canonical) return [...out];
    out.add(canonical);
    for (const [alias, liveId] of snap.fixtureAliases) {
      if (liveId === canonical) out.add(alias);
    }
    return [...out];
  };

  async function hydrate(force = false): Promise<void> {
    if (hydratePromise && !force) return hydratePromise;
    const params = windowParams();
    const fixturesFresh = LIVE_LEAGUE_ID_LIST.every((id) =>
      cache.hasFresh(`fixtures:${id}:${params.season}:${params.from}:${params.to}`, now()),
    );
    if (status.ready && !force && !status.error && fixturesFresh) {
      return Promise.resolve();
    }
    setStatus({ loading: true, error: null });
    hydratePromise = (async () => {
      const errors: string[] = [];
      const tasks: Array<[string, () => Promise<void>]> = [];
      for (const id of LIVE_LEAGUE_ID_LIST) {
        const name = liveLeagueName(id);
        tasks.push([`${name} fixtures`, () => fetchLeagueFixtures(id)]);
        tasks.push([`${name} standings`, () => fetchLeagueStandings(id)]);
      }
      tasks.push(['PL scorers', () => fetchLeagueScorers(PREMIER_LEAGUE_ID)]);
      for (const [label, task] of tasks) {
        try {
          await task();
        } catch (err) {
          errors.push(`${label}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      setStatus({
        loading: false,
        ready: true,
        lastSyncedAt: snap.fixtures.size || snap.standings.size ? now() : status.lastSyncedAt,
        error: errors.length ? errors[0]! : null,
      });
    })().finally(() => {
      hydratePromise = null;
    });
    return hydratePromise;
  }

  const allLiveFixtures = (): Fixture[] =>
    [...snap.fixtures.values()].sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff));

  const provider: FootballProvider = {
    getStatus: () => status,
    hydrate: () => hydrate(false),
    refresh: () => {
      const params = windowParams();
      for (const id of LIVE_LEAGUE_ID_LIST) {
        cache.delete(`fixtures:${id}:${params.season}:${params.from}:${params.to}`);
      }
      return hydrate(true);
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    relatedIds: (kind, id) => {
      if (kind === 'team') return relatedTeamIds(id);
      if (kind === 'player') return relatedPlayerIds(id);
      if (kind === 'match') return relatedMatchIds(id);
      return relatedLeagueIds(id);
    },
    ensureSquad: async (teamId) => {
      const team = liveTeam(teamId);
      if (!team) return;
      if (snap.squads.has(team.id) && cache.hasFresh(`squad:${team.id}`, now())) return;
      try {
        const rows = await load(`squad:${team.id}`, FOOTBALL_TTL.squadMs, () =>
          http('/players/squads', { team: team.id }).then((r) => asArray<ApiSquadResponse>(r)),
        );
        const players = (rows[0]?.players ?? []).map((p) => mapSquadPlayer(p, team.id));
        snap.squads.set(team.id, players);
        for (const p of players) rememberPlayer(snap, p);
        emit();
      } catch (err) {
        setStatus({ error: err instanceof Error ? err.message : String(err) });
      }
    },
    ensureMatchDetail: async (fixtureId) => {
      const fixture = snap.fixtures.get(fixtureId) ?? fallback.getFixture(fixtureId);
      if (!fixture || !snap.fixtures.has(fixture.id)) return;
      const live = fixture.status === 'live' || fixture.status === 'ht';
      const ttl = live ? FOOTBALL_TTL.matchLiveMs : FOOTBALL_TTL.matchDoneMs;
      try {
        const events = await load(`events:${fixture.id}`, ttl, () =>
          http('/fixtures/events', { fixture: fixture.id }).then((r) => asArray<ApiEvent>(r)),
        );
        const mappedEvents = events.map(mapMatchEvent).filter((e): e is NonNullable<typeof e> => !!e);
        const current = snap.fixtures.get(fixture.id);
        if (current) snap.fixtures.set(fixture.id, { ...current, events: mappedEvents });
        const lineups = await load(`lineups:${fixture.id}`, ttl, () =>
          http('/fixtures/lineups', { fixture: fixture.id }).then((r) => asArray<ApiLineup>(r)),
        );
        if (lineups.length) {
          const home = lineups.find((l) => String(l.team.id) === fixture.homeTeamId);
          const away = lineups.find((l) => String(l.team.id) === fixture.awayTeamId);
          snap.lineups.set(fixture.id, {
            home: home ? mapLineup(home) : emptyLineup(),
            away: away ? mapLineup(away) : emptyLineup(),
          });
        }
        emit();
      } catch (err) {
        setStatus({ error: err instanceof Error ? err.message : String(err) });
      }
    },
    ensureScorers: async (leagueId) => {
      const canonical = resolveLeagueId(leagueId);
      if (!LIVE_LEAGUE_IDS.has(canonical)) return;
      if (snap.scorers.has(canonical) && cache.hasFresh(`scorers:${canonical}:${windowParams().season}`, now())) return;
      try {
        await fetchLeagueScorers(canonical);
        emit();
      } catch (err) {
        setStatus({ error: err instanceof Error ? err.message : String(err) });
      }
    },
    ensurePlayerSeason: async (playerId) => {
      const player = livePlayer(playerId);
      const canonical = numericPlayerId(player?.id) ?? numericPlayerId(resolvePlayerId(playerId)) ?? numericPlayerId(playerId);
      if (!canonical) return;
      const season = opts.season ?? footballSeasonFromEnv();
      const key = `player:${canonical}:${season}`;
      if (cache.hasFresh(key, now()) && snap.stats.has(canonical)) return;
      try {
        const rows = await load(key, FOOTBALL_TTL.playerSeasonMs, () =>
          http('/players', { id: canonical, season }).then((r) => asArray<ApiPlayerSeason>(r)),
        );
        const stats = mapPlayerSeason(rows[0]);
        if (!stats) return;
        snap.stats.set(canonical, stats);
        emit();
      } catch (err) {
        setStatus({ error: err instanceof Error ? err.message : String(err) });
      }
    },
    ensureTeamStats: async (teamId) => {
      const team = liveTeam(teamId);
      const canonical = team && /^[1-9]\d*$/.test(team.id) ? team.id : undefined;
      if (!canonical) return;
      const leagueId = LIVE_LEAGUE_ID_LIST.find((id) => snap.teamLeagueIds.get(canonical)?.has(id));
      if (!leagueId) {
        teamStatsAttempted.add(canonical);
        return;
      }
      const season = opts.season ?? footballSeasonFromEnv();
      const key = `team-stats:${canonical}:${leagueId}:${season}`;
      if (cache.hasFresh(key, now()) && snap.teamStats.has(canonical)) {
        teamStatsAttempted.add(canonical);
        return;
      }
      try {
        const payload = await load(key, FOOTBALL_TTL.teamStatsMs, () =>
          http('/teams/statistics', { league: leagueId, season, team: canonical }),
        );
        const mapped = mapTeamStatistics(payload, { teamId: canonical, leagueId, season });
        teamStatsAttempted.add(canonical);
        if (!mapped) {
          emit();
          return;
        }
        snap.teamStats.set(canonical, mapped);
        emit();
      } catch (err) {
        teamStatsAttempted.add(canonical);
        setStatus({ error: err instanceof Error ? err.message : String(err) });
        emit();
      }
    },
    getContinents: () => fallback.getContinents(),
    getContinent: (id) => fallback.getContinent(id),
    getCountries: (continentId) => fallback.getCountries(continentId),
    getCountry: (id) => fallback.getCountry(id),
    getLeagues: (countryId) => {
      if (countryId && isLiveCountryId(countryId)) {
        return LIVE_LEAGUES.filter((l) => l.countryId === countryId);
      }
      if (countryId) return fallback.getLeagues(countryId).filter((l) => !MOCK_LEAGUE_IDS.has(l.id));
      const rest = fallback.getLeagues().filter((l) => !isLiveCountryId(l.countryId) && !MOCK_LEAGUE_IDS.has(l.id));
      return [...LIVE_LEAGUES, ...rest];
    },
    getFeaturedLeagues: () => LIVE_LEAGUES,
    getLeague: (id) => LIVE_LEAGUES.find((l) => relatedLeagueIds(id).includes(l.id)) ?? fallback.getLeague(id),
    getTeams: (leagueId) => {
      if (!leagueId) {
        const live = [...snap.teams.values()];
        const liveNames = new Set(live.map((t) => foldName(t.name)));
        const rest = fallback.getTeams().filter((t) => !isLiveCountryId(t.countryId) && !liveNames.has(foldName(t.name)));
        return [...live, ...rest];
      }
      const canonical = resolveLeagueId(leagueId);
      if (LIVE_LEAGUE_IDS.has(canonical)) {
        return [...snap.teams.values()].filter((t) => snap.teamLeagueIds.get(t.id)?.has(canonical));
      }
      return fallback.getTeams(leagueId);
    },
    getTeam: (id) => liveTeam(id) ?? fallback.getTeam(id),
    getPlayer: (id) => livePlayer(id) ?? fallback.getPlayer(id),
    getPlayers: () => {
      const live = [...snap.players.values()];
      const liveNames = new Set(live.map((p) => foldName(p.name)));
      const rest = fallback.getPlayers().filter((p) => {
        if (liveNames.has(foldName(p.name))) return false;
        return !liveTeam(p.teamId);
      });
      return [...live, ...rest];
    },
    getSquad: (teamId) => {
      const team = liveTeam(teamId);
      if (team) return snap.squads.get(team.id) ?? [];
      return fallback.getSquad(teamId);
    },
    getTeamCompetitions: (teamId) => {
      const team = liveTeam(teamId);
      if (team) {
        const ids = snap.teamLeagueIds.get(team.id) ?? new Set();
        const live = LIVE_LEAGUES.filter((l) => ids.has(l.id));
        if (live.length) return live;
        const byCountry = LIVE_LEAGUES.filter((l) => l.countryId === team.countryId);
        return byCountry.length ? byCountry : LIVE_LEAGUES.filter((l) => l.id === PREMIER_LEAGUE_ID);
      }
      return fallback.getTeamCompetitions(teamId);
    },
    getPlayerStats: (playerId) => {
      const player = livePlayer(playerId);
      const keys = [player?.id, resolvePlayerId(playerId), playerId];
      for (const key of keys) {
        if (key && snap.stats.has(key)) return snap.stats.get(key);
      }
      if (player && liveTeam(player.teamId)) return undefined;
      return fallback.getPlayerStats(playerId);
    },
    getTeamStats: (teamId) => {
      const team = liveTeam(teamId);
      if (team) {
        const live = snap.teamStats.get(team.id);
        if (live) return live;
        // Prefer live; only densify after ensure finished with a miss for an aliased mock club.
        if (!teamStatsAttempted.has(team.id)) return undefined;
        const mockId = mockAliasForTeam(team);
        return mockId ? fallback.getTeamStats(mockId) : undefined;
      }
      const mockTeam = fallback.getTeam(teamId);
      if (!mockTeam) return undefined;
      // Coverage clubs wait for `/teams/statistics` so mock blues don't flash as live.
      if (isLiveCountryId(mockTeam.countryId) && fallback.getTeamCompetitions(teamId).some((league) => isLiveLeague(league.id))) {
        return undefined;
      }
      return fallback.getTeamStats(teamId);
    },
    getPlayerAppearances: (playerId) => {
      const player = livePlayer(playerId);
      if (!player || !liveTeam(player.teamId)) return fallback.getPlayerAppearances(playerId);
      const out: PlayerAppearance[] = [];
      for (const f of allLiveFixtures()
        .filter((fx) => fx.homeTeamId === player.teamId || fx.awayTeamId === player.teamId)
        .filter((fx) => fx.status !== 'upcoming')
        .sort((a, b) => Date.parse(b.kickoff) - Date.parse(a.kickoff))) {
        const lineup = snap.lineups.get(f.id);
        const starter = lineup
          ? [...lineup.home.players, ...lineup.away.players].some((p) => p.playerId === player.id)
          : false;
        const events = f.events.filter((e) => e.playerId === player.id);
        if (!starter && events.length === 0) continue;
        out.push({
          fixtureId: f.id,
          starter,
          minutes: starter ? Math.min(90, f.minute ?? 90) : events.length ? 20 : 0,
          goals: events.filter((e) => e.type === 'goal').length,
          assists: events.filter((e) => /assist/i.test(e.detail ?? '')).length,
          rating: 0,
        });
        if (out.length >= 6) break;
      }
      return out;
    },
    getFixtures: (filter) => {
      const live = allLiveFixtures().filter((f) => {
        if (filter?.leagueId && !relatedLeagueIds(filter.leagueId).includes(f.leagueId)) return false;
        if (filter?.teamId) {
          const ids = relatedTeamIds(filter.teamId);
          if (!ids.includes(f.homeTeamId) && !ids.includes(f.awayTeamId)) return false;
        }
        return true;
      });
      if (filter?.teamId && !liveTeam(filter.teamId)) return fallback.getFixtures(filter);
      if (filter?.leagueId && !isLiveLeague(filter.leagueId)) return fallback.getFixtures(filter);
      if (filter) return live;
      const rest = fallback.getFixtures().filter((f) => {
        if (isAliasedMockFixture(snap, f.id)) return false;
        if (isLiveLeague(f.leagueId)) return false;
        const countryId = fallback.getLeague(f.leagueId)?.countryId;
        if (countryId && isLiveCountryId(countryId)) return false;
        return true;
      });
      return [...live, ...rest].sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff));
    },
    getFixture: (id) => snap.fixtures.get(id) ?? fallback.getFixture(id),
    getStandings: (leagueId) => {
      const canonical = resolveLeagueId(leagueId);
      if (LIVE_LEAGUE_IDS.has(canonical)) return snap.standings.get(canonical) ?? [];
      return fallback.getStandings(leagueId);
    },
    getTopScorers: (leagueId) => {
      const canonical = resolveLeagueId(leagueId);
      if (LIVE_LEAGUE_IDS.has(canonical)) return snap.scorers.get(canonical) ?? [];
      return fallback.getTopScorers(leagueId);
    },
    getCachedLiveLineups: (fixture) => {
      const canonical = snap.fixtureAliases.get(fixture.id) ?? fixture.id;
      return snap.lineups.get(canonical) ?? snap.lineups.get(fixture.id);
    },
    getLineups: (fixture) => {
      const cached = snap.lineups.get(fixture.id);
      if (cached) return cached;
      if (!snap.fixtures.has(fixture.id)) return fallback.getLineups(fixture);
      return { home: emptyLineup(), away: emptyLineup() };
    },
  };

  return provider;
}

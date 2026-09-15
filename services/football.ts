import type {
  Continent,
  Country,
  Fixture,
  League,
  Lineup,
  MatchStatus,
  SeedFixture,
  StandingRow,
  Scorer,
  Team,
} from '@/data/types';
import { continents, countries, leagues, leagueRosters, teams } from '@/data/mocks/catalog';
import { seedFixtures } from '@/data/mocks/fixtures';
import { scorersFor, standingsFor } from '@/data/mocks/stats';

const teamMap = new Map(teams.map((t) => [t.id, t]));
const leagueMap = new Map(leagues.map((l) => [l.id, l]));
const countryMap = new Map(countries.map((c) => [c.id, c]));

function scoreFromEvents(events: SeedFixture['events'], teamId: string): number {
  return events.filter((e) => e.type === 'goal' && e.teamId === teamId).length;
}

function fallbackScore(id: string, slot: 0 | 1): number {
  let n = 0;
  for (let i = 0; i < id.length; i += 1) n = (n * 31 + id.charCodeAt(i) + slot) >>> 0;
  return n % 4;
}

export function hydrateFixture(seed: SeedFixture, now = Date.now()): Fixture {
  const kickoff = new Date(now + seed.kickoffOffsetMin * 60_000).toISOString();
  const elapsed = (now - Date.parse(kickoff)) / 60_000;
  let status: MatchStatus = 'upcoming';
  let minute: number | undefined;
  let homeScore = 0;
  let awayScore = 0;

  if (seed.finishedHome != null && seed.finishedAway != null && elapsed >= 98) {
    status = 'finished';
    homeScore = seed.finishedHome;
    awayScore = seed.finishedAway;
  } else if (elapsed >= 98) {
    status = 'finished';
    homeScore = seed.finishedHome ?? scoreFromEvents(seed.events, seed.homeTeamId);
    awayScore = seed.finishedAway ?? scoreFromEvents(seed.events, seed.awayTeamId);
    if (!seed.events.length && seed.finishedHome == null) {
      homeScore = fallbackScore(seed.id, 0);
      awayScore = fallbackScore(seed.id, 1);
    }
  } else if (elapsed >= 0) {
    if (elapsed >= 45 && elapsed < 48) {
      status = 'ht';
      minute = 45;
    } else if (elapsed < 45) {
      status = 'live';
      minute = Math.max(1, Math.floor(elapsed));
    } else {
      status = 'live';
      minute = Math.min(90, Math.max(46, Math.floor(elapsed - 3)));
    }
    const visible = seed.events.filter((e) => e.minute <= (minute ?? 45));
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
    events: visibleEvents,
    venue: seed.venue,
  };
}

const FIRST = ['Alex', 'Marco', 'Luis', 'Yuki', 'Ibrahim', 'Theo', 'Rafa', 'Nico', 'Owen', 'Kai'];
const LAST = ['Santos', 'Berg', 'Okoye', 'Nakamura', 'Rossi', 'Hughes', 'Kovac', 'Duarte', 'Nwosu', 'Lind'];

function lineupFor(_teamId: string, seed: number): Lineup {
  const players = [
    { name: `${FIRST[seed % FIRST.length]} ${LAST[seed % LAST.length]}`, number: 1, pos: 'GK' as const },
    ...Array.from({ length: 10 }, (_, i) => {
      const n = seed + i + 1;
      const pos = i < 4 ? 'DF' : i < 7 ? 'MF' : 'FW';
      return {
        name: `${FIRST[n % FIRST.length]} ${LAST[(n + 3) % LAST.length]}`,
        number: [23, 4, 5, 2, 3, 8, 6, 10, 7, 9][i],
        pos: pos as Lineup['players'][number]['pos'],
      };
    }),
  ];
  return { formation: '4-3-3', players };
}

/**
 * Football data access. v1 is mock-only.
 * Swap `football` for a REST/GraphQL adapter that implements this shape.
 */
export interface FootballProvider {
  getContinents(): Continent[];
  getContinent(id: string): Continent | undefined;
  getCountries(continentId?: string): Country[];
  getCountry(id: string): Country | undefined;
  getLeagues(countryId?: string): League[];
  getFeaturedLeagues(): League[];
  getLeague(id: string): League | undefined;
  getTeams(leagueId?: string): Team[];
  getTeam(id: string): Team | undefined;
  getFixtures(opts?: { leagueId?: string; teamId?: string }): Fixture[];
  getFixture(id: string): Fixture | undefined;
  getStandings(leagueId: string): StandingRow[];
  getTopScorers(leagueId: string): Scorer[];
  getLineups(fixture: Fixture): { home: Lineup; away: Lineup };
}

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
    home: lineupFor(fixture.homeTeamId, fixture.homeTeamId.length),
    away: lineupFor(fixture.awayTeamId, fixture.awayTeamId.length + 4),
  }),
};

export const football: FootballProvider = mockFootballProvider;

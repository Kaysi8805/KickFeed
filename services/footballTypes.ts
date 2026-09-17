import type {
  Continent,
  Country,
  Fixture,
  League,
  Lineup,
  Player,
  PlayerAppearance,
  PlayerStats,
  Scorer,
  StandingRow,
  Team,
} from '@/data/types';

export type FootballSource = 'mock' | 'live';

export interface FootballStatus {
  source: FootballSource;
  ready: boolean;
  loading: boolean;
  error: string | null;
  lastSyncedAt: number | null;
  geoLabel: string;
}

export type FootballEntityKind = 'team' | 'player' | 'league' | 'match';

/**
 * Football data access.
 * v1 mock is sync; the live adapter hydrates into memory and the same getters read the cache.
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
  getPlayer(id: string): Player | undefined;
  getPlayers(): Player[];
  getSquad(teamId: string): Player[];
  getTeamCompetitions(teamId: string): League[];
  getPlayerStats(playerId: string): PlayerStats | undefined;
  getPlayerAppearances(playerId: string): PlayerAppearance[];
  getFixtures(opts?: { leagueId?: string; teamId?: string }): Fixture[];
  getFixture(id: string): Fixture | undefined;
  getStandings(leagueId: string): StandingRow[];
  getTopScorers(leagueId: string): Scorer[];
  getLineups(fixture: Fixture): { home: Lineup; away: Lineup };
  getStatus(): FootballStatus;
  hydrate(): Promise<void>;
  refresh(): Promise<void>;
  subscribe(listener: () => void): () => void;
  ensureSquad(teamId: string): Promise<void>;
  ensureMatchDetail(fixtureId: string): Promise<void>;
  ensureScorers(leagueId: string): Promise<void>;
  relatedIds(kind: FootballEntityKind, id: string): string[];
}

export const MOCK_FOOTBALL_STATUS: FootballStatus = {
  source: 'mock',
  ready: true,
  loading: false,
  error: null,
  lastSyncedAt: null,
  geoLabel: 'Worldwide (mock)',
};

export async function noopAsync(): Promise<void> {}

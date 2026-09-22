import { mockFootballProvider } from '@/services/football';
import { createLiveFootballProvider } from '@/services/footballLive';
import { footballApiKeyFromEnv, footballBffUrlFromEnv } from '@/services/footballApi';
import { selectFootballProvider } from '@/services/football';
import type { ApiFixture, ApiScorer, FootballHttp } from '@/services/footballApi';
import { describe, expect, it, vi } from 'vitest';

const livArs: ApiFixture = {
  fixture: {
    id: 9001,
    date: '2026-09-16T19:00:00+00:00',
    venue: { name: 'Anfield', city: 'Liverpool' },
    status: { short: 'FT', elapsed: 90 },
  },
  league: { id: 39, name: 'Premier League' },
  teams: {
    home: { id: 40, name: 'Liverpool' },
    away: { id: 42, name: 'Arsenal' },
  },
  goals: { home: 2, away: 1 },
};

const standing = {
  rank: 1,
  team: { id: 40, name: 'Liverpool' },
  points: 12,
  form: 'WWW',
  all: { played: 4, win: 4, draw: 0, lose: 0, goals: { for: 10, against: 2 } },
};

const scorer: ApiScorer = {
  player: { id: 306, name: 'Mohamed Salah' },
  statistics: [{ team: { id: 40, name: 'Liverpool' }, goals: { total: 5, assists: 2 } }],
};

const slovanDac: ApiFixture = {
  fixture: {
    id: 9101,
    date: '2026-09-16T16:00:00+00:00',
    venue: { name: 'Tehelné pole', city: 'Bratislava' },
    status: { short: '1H', elapsed: 22 },
  },
  league: { id: 332, name: 'Super Liga' },
  teams: {
    home: { id: 636, name: 'Slovan Bratislava' },
    away: { id: 637, name: 'DAC' },
  },
  goals: { home: 1, away: 0 },
};

const rmaBar: ApiFixture = {
  fixture: {
    id: 9201,
    date: '2026-09-16T19:00:00+00:00',
    venue: { name: 'Santiago Bernabéu', city: 'Madrid' },
    status: { short: 'NS' },
  },
  league: { id: 140, name: 'La Liga' },
  teams: {
    home: { id: 541, name: 'Real Madrid' },
    away: { id: 529, name: 'Barcelona' },
  },
  goals: { home: null, away: null },
};

function fakeHttp(): FootballHttp {
  return vi.fn(async (path, params) => {
    if (path === '/fixtures') {
      if (params?.league === 40 || params?.league === '40') return [];
      if (params?.league === 332 || params?.league === '332') return [slovanDac];
      if (params?.league === 140 || params?.league === '140') return [rmaBar];
      return [livArs];
    }
    if (path === '/standings') {
      return [{ league: { id: Number(params?.league), standings: [[standing]] } }];
    }
    if (path === '/players/topscorers') return [scorer];
    if (path === '/players/squads') {
      return [{
        team: { id: 40, name: 'Liverpool' },
        players: [{ id: 306, name: 'Mohamed Salah', number: 11, position: 'Attacker', age: 33 }],
      }];
    }
    if (path === '/fixtures/events') {
      return [{
        time: { elapsed: 12, extra: null },
        team: { id: 40, name: 'Liverpool' },
        player: { id: 306, name: 'Salah' },
        type: 'Goal',
        detail: 'Normal Goal',
      }];
    }
    if (path === '/fixtures/lineups') {
      return [{
        team: { id: 40, name: 'Liverpool' },
        formation: '4-3-3',
        startXI: [{ player: { id: 306, name: 'Salah', number: 11, pos: 'F' } }],
      }];
    }
    return [];
  });
}

describe('live football provider', () => {
  it('stays on mock when no API key is present', () => {
    expect(footballApiKeyFromEnv({ EXPO_PUBLIC_FOOTBALL_API_KEY: undefined })).toBeUndefined();
    expect(selectFootballProvider(undefined, mockFootballProvider)).toBe(mockFootballProvider);
    expect(mockFootballProvider.getStatus().source).toBe('mock');
    expect(mockFootballProvider.getTeam('liv')?.name).toBe('Liverpool');
  });

  it('uses the live adapter when a BFF URL is set even without a client key', () => {
    expect(footballBffUrlFromEnv({ EXPO_PUBLIC_FOOTBALL_BFF_URL: ' https://bff.example/ ' })).toBe(
      'https://bff.example',
    );
    const live = selectFootballProvider(undefined, mockFootballProvider, 'https://bff.example');
    expect(live).not.toBe(mockFootballProvider);
    expect(live.getStatus().source).toBe('live');
  });

  it('hydrates PL fixtures/standings and aliases mock club ids', async () => {
    const http = fakeHttp();
    const live = createLiveFootballProvider({
      fallback: mockFootballProvider,
      http,
      season: 2026,
      now: () => Date.parse('2026-09-16T12:00:00.000Z'),
    });
    await live.hydrate();
    expect(live.getStatus().source).toBe('live');
    expect(live.getFixture('9001')?.homeScore).toBe(2);
    expect(live.getTeam('liv')?.id).toBe('40');
    expect(live.getTeam('40')?.name).toBe('Liverpool');
    expect(live.relatedIds('team', 'liv')).toContain('40');
    expect(live.getLeague('epl')?.id).toBe('39');
    expect(live.getStandings('epl')[0]?.teamId).toBe('40');
    expect(live.getFixtures({ leagueId: 'epl' })).toHaveLength(1);
    expect(live.getTopScorers('39')[0]?.playerName).toMatch(/Salah/);
    expect(live.getFixture('fx-liv-ars')?.id).toBe('fx-liv-ars');
    expect(live.getTeam('rma')?.name).toBe('Real Madrid');
    expect(live.getStatus().geoLabel).toMatch(/Slovakia/);
    expect(live.getLeague('nikeliga')?.id).toBe('332');
    expect(live.getFixtures({ leagueId: 'nikeliga' })[0]?.id).toBe('9101');
    expect(live.getTeam('slovan')?.id).toBe('636');
    expect(live.getLeague('laliga')?.id).toBe('140');
    expect(live.getFixtures({ leagueId: '140' })[0]?.homeTeamId).toBe('541');
    expect(live.getLeagues('svk').some((l) => l.id === '332')).toBe(true);
    expect(live.getLeagues('esp').some((l) => l.id === '140')).toBe(true);
    const all = live.getFixtures();
    expect(all.some((f) => f.id === '9001')).toBe(true);
    expect(all.some((f) => f.id === '9101')).toBe(true);
    expect(all.some((f) => f.id === '9201')).toBe(true);
    expect(all.some((f) => f.id === 'fx-rma-bar')).toBe(false);
    expect(all.some((f) => f.id === 'fx-liv-ars')).toBe(false);
    expect(all.some((f) => f.id === 'fx-int-mil')).toBe(true);
    expect(live.relatedIds('match', '9001')).toEqual(expect.arrayContaining(['9001', 'fx-liv-ars']));
    expect(live.relatedIds('match', 'fx-liv-ars')).toContain('9001');
    expect(live.relatedIds('match', '9001')).not.toContain('fx-facup-liv-ars');
    expect(live.relatedIds('match', '9201')).toEqual(expect.arrayContaining(['9201', 'fx-rma-bar']));
  });

  it('reuses the in-memory cache on a second hydrate within ttl', async () => {
    const http = fakeHttp();
    let t = Date.parse('2026-09-16T12:00:00.000Z');
    const live = createLiveFootballProvider({
      fallback: mockFootballProvider,
      http,
      season: 2026,
      now: () => t,
    });
    await live.hydrate();
    const calls = (http as ReturnType<typeof vi.fn>).mock.calls.length;
    t += 1_000;
    await live.hydrate();
    expect((http as ReturnType<typeof vi.fn>).mock.calls.length).toBe(calls);
  });

  it('loads squads and match detail lazily without blocking hydrate', async () => {
    const http = fakeHttp();
    const live = createLiveFootballProvider({
      fallback: mockFootballProvider,
      http,
      season: 2026,
      now: () => Date.parse('2026-09-16T12:00:00.000Z'),
    });
    await live.hydrate();
    expect(live.getSquad('liv')).toEqual([]);
    await live.ensureSquad('liv');
    expect(live.getSquad('40')[0]?.name).toMatch(/Salah/);
    expect(live.getPlayer('p-liv-11')?.id).toBe('306');
    await live.ensureMatchDetail('9001');
    expect(live.getFixture('9001')?.events[0]?.type).toBe('goal');
    expect(live.getLineups(live.getFixture('9001')!).home.players[0]?.playerId).toBe('306');
  });

  it('hydrates one player season and does not fan out /players for a squad', async () => {
    const base = fakeHttp();
    const http = vi.fn(async (path: string, params?: Record<string, string | number | undefined>) => {
      if (path === '/players') {
        return [{
          player: { id: 306, name: 'Mohamed Salah' },
          statistics: [
            {
              team: { id: 40, name: 'Liverpool' },
              games: { appearences: 10, minutes: 800, rating: '7.50' },
              goals: { total: 8, assists: 3 },
              cards: { yellow: 2, red: 0 },
            },
            {
              team: { id: 40, name: 'Liverpool' },
              games: { appearences: 2, minutes: 120, rating: '8.00' },
              goals: { total: 1, assists: 0 },
              cards: { yellow: 0, red: 1 },
            },
          ],
        }];
      }
      if (path === '/players/squads') {
        return [{
          team: { id: 40, name: 'Liverpool' },
          players: [
            { id: 306, name: 'Mohamed Salah', number: 11, position: 'Attacker', age: 33 },
            { id: 999, name: 'Bench Player', number: 99, position: 'Midfielder', age: 20 },
          ],
        }];
      }
      return base(path, params);
    });
    const live = createLiveFootballProvider({
      fallback: mockFootballProvider,
      http,
      season: 2026,
      now: () => Date.parse('2026-09-16T12:00:00.000Z'),
    });
    await live.hydrate();
    await live.ensureSquad('liv');
    await live.ensureScorers('epl');
    const playerCalls = () => http.mock.calls.filter((call) => call[0] === '/players');
    expect(playerCalls()).toHaveLength(0);
    await Promise.all([live.ensurePlayerSeason('p-liv-11'), live.ensurePlayerSeason('306')]);
    expect(playerCalls()).toHaveLength(1);
    expect(playerCalls()[0]?.[1]).toMatchObject({ id: '306', season: 2026 });
    expect(live.getPlayerStats('p-liv-11')).toEqual({
      appearances: 12,
      goals: 9,
      assists: 3,
      minutes: 920,
      yellows: 2,
      reds: 1,
      rating: 7.6,
    });
    await live.ensurePlayerSeason('306');
    expect(playerCalls()).toHaveLength(1);
    await live.ensureMatchDetail('9001');
    expect(live.getPlayerAppearances('306').length).toBeGreaterThan(0);
    expect(live.getPlayerAppearances('999')).toEqual([]);
  });

  it('loads team statistics once per club per day and skips uncovered clubs', async () => {
    const base = fakeHttp();
    let t = Date.parse('2026-09-16T12:00:00.000Z');
    const http = vi.fn(async (path: string, params?: Record<string, string | number | undefined>) => {
      if (path === '/teams/statistics') {
        if (String(params?.team) === '999') return [];
        return {
          league: { id: 39, season: 2026 },
          team: { id: 40, name: 'Liverpool' },
          form: 'WWDLW',
          fixtures: {
            played: { home: 3, away: 2, total: 5 },
            wins: { home: 2, away: 1, total: 3 },
            draws: { home: 1, away: 0, total: 1 },
            loses: { home: 0, away: 1, total: 1 },
          },
          goals: {
            for: { total: { total: 9 }, average: { total: '1.8' } },
            against: { total: { total: 4 }, average: { total: '0.8' } },
          },
          clean_sheet: { home: 2, away: 0, total: 2 },
          failed_to_score: { total: 1 },
          lineups: [{ formation: '4-3-3', played: 5 }],
        };
      }
      return base(path, params);
    });
    const live = createLiveFootballProvider({
      fallback: mockFootballProvider,
      http,
      season: 2026,
      now: () => t,
    });
    const statCalls = () => http.mock.calls.filter((call) => call[0] === '/teams/statistics');
    await live.hydrate();
    await live.ensureSquad('liv');
    expect(statCalls()).toHaveLength(0);
    expect(http.mock.calls.some((call) => call[0] === '/coachs' || call[0] === '/fixtures/statistics' || call[0] === '/teams')).toBe(
      false,
    );
    expect(live.getTeamStats('liv')).toBeUndefined();
    expect(live.getTeamStats('bay')?.venue).toBe('Allianz Arena');

    await Promise.all([live.ensureTeamStats('liv'), live.ensureTeamStats('40')]);
    expect(statCalls()).toHaveLength(1);
    expect(statCalls()[0]?.[1]).toMatchObject({ league: '39', season: 2026, team: '40' });
    expect(live.getTeamStats('liv')).toMatchObject({
      teamId: '40',
      leagueId: '39',
      season: 2026,
      form: ['W', 'W', 'D', 'L', 'W'],
      cleanSheets: { total: 2 },
      goalsForAverage: { total: 1.8 },
      goalsAgainstAverage: { total: 0.8 },
      failedToScore: { total: 1 },
      formation: '4-3-3',
      wins: { home: 2, away: 1, total: 3 },
    });
    expect(live.getTeamStats('40')?.venue).toBeUndefined();

    t += 60_000;
    await live.ensureTeamStats('40');
    expect(statCalls()).toHaveLength(1);

    t += 24 * 60 * 60_000;
    await live.ensureTeamStats('40');
    expect(statCalls()).toHaveLength(2);

    await live.ensureTeamStats('bay');
    expect(statCalls()).toHaveLength(2);
  });
});

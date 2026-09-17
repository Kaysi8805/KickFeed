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

function fakeHttp(): FootballHttp {
  return vi.fn(async (path, params) => {
    if (path === '/fixtures') return params?.league === 40 || params?.league === '40' ? [] : [livArs];
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
    const all = live.getFixtures();
    expect(all.some((f) => f.id === '9001')).toBe(true);
    expect(all.some((f) => f.id === 'fx-rma-bar')).toBe(true);
    expect(all.some((f) => f.id === 'fx-liv-ars')).toBe(false);
    expect(live.relatedIds('match', '9001')).toEqual(expect.arrayContaining(['9001', 'fx-liv-ars']));
    expect(live.relatedIds('match', 'fx-liv-ars')).toContain('9001');
    expect(live.relatedIds('match', '9001')).not.toContain('fx-facup-liv-ars');
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
});

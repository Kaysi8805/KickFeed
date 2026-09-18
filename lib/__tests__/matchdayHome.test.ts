import type { Fixture, Player } from '@/data/types';
import {
  MATCHDAY_JUST_FINISHED_MS,
  MATCHDAY_MATCH_LENGTH_MS,
  defaultHomePane,
  featuredLeaguePriority,
  matchdayPhase,
  matchdayWhyLabel,
  pickMatchdayHome,
  type MatchdayCatalog,
} from '@/lib/matchdayHome';
import { mockFootballProvider } from '@/services/football';
import { createLiveFootballProvider } from '@/services/footballLive';
import type { ApiFixture, FootballHttp } from '@/services/footballApi';
import { MOCK_FOOTBALL_STATUS } from '@/services/footballTypes';
import { describe, expect, it, vi } from 'vitest';

const NOW = Date.parse('2026-09-16T18:00:00.000Z');

function iso(offsetMs: number): string {
  return new Date(NOW + offsetMs).toISOString();
}

function fx(partial: Partial<Fixture> & Pick<Fixture, 'id'>): Fixture {
  return {
    leagueId: 'epl',
    homeTeamId: 'liv',
    awayTeamId: 'ars',
    kickoff: iso(0),
    status: 'live',
    minute: 34,
    homeScore: 1,
    awayScore: 0,
    events: [],
    venue: 'Anfield',
    ...partial,
  };
}

function catalog(
  fixtures: Fixture[],
  opts?: { related?: Record<string, string[]>; players?: Record<string, Player> },
): MatchdayCatalog {
  return {
    getFixtures: () => fixtures,
    getFixture: (id) => fixtures.find((f) => f.id === id),
    getTeam: () => undefined,
    getPlayer: (id) => opts?.players?.[id],
    relatedIds: (kind, id) => opts?.related?.[`${kind}:${id}`] ?? [id],
    getStatus: () => MOCK_FOOTBALL_STATUS,
  };
}

describe('matchdayPhase', () => {
  it('treats live and HT as matchday-live', () => {
    expect(matchdayPhase(fx({ id: 'live', status: 'live' }), NOW)).toBe('live');
    expect(matchdayPhase(fx({ id: 'ht', status: 'ht' }), NOW)).toBe('live');
  });

  it('treats kickoff within 90 minutes as soon, and later fixtures as off-matchday', () => {
    expect(matchdayPhase(fx({ id: 'soon', status: 'upcoming', kickoff: iso(40 * 60_000) }), NOW)).toBe('soon');
    expect(matchdayPhase(fx({ id: 'later', status: 'upcoming', kickoff: iso(120 * 60_000) }), NOW)).toBeNull();
  });

  it('treats a freshly finished match as matchday, not yesterday’s result', () => {
    const justFt = fx({
      id: 'ft',
      status: 'finished',
      kickoff: iso(-(MATCHDAY_MATCH_LENGTH_MS + 10 * 60_000)),
    });
    const old = fx({
      id: 'old',
      status: 'finished',
      kickoff: iso(-(MATCHDAY_MATCH_LENGTH_MS + MATCHDAY_JUST_FINISHED_MS + 5 * 60_000)),
    });
    expect(matchdayPhase(justFt, NOW)).toBe('finished');
    expect(matchdayPhase(old, NOW)).toBeNull();
  });
});

describe('pickMatchdayHome', () => {
  const plLive = fx({ id: 'pl-live', leagueId: 'epl', homeTeamId: 'mci', awayTeamId: 'che', homeScore: 1, awayScore: 1 });
  const favoriteLive = fx({ id: 'fav-live', leagueId: 'epl', homeTeamId: 'liv', awayTeamId: 'ars', homeScore: 2, awayScore: 1 });
  const nikeLive = fx({
    id: 'nike-live',
    leagueId: 'nikeliga',
    homeTeamId: 'slovan',
    awayTeamId: 'dac',
    homeScore: 1,
    awayScore: 0,
  });
  const ligaLive = fx({
    id: 'liga-live',
    leagueId: 'laliga',
    homeTeamId: 'rma',
    awayTeamId: 'bar',
    homeScore: 3,
    awayScore: 1,
  });
  const serieLive = fx({
    id: 'serie-live',
    leagueId: 'seriea',
    homeTeamId: 'int',
    awayTeamId: 'mil',
  });

  it('prefers a favorite club live match over a featured live match', () => {
    const home = pickMatchdayHome(catalog([nikeLive, ligaLive, favoriteLive]), {
      teamIds: ['liv'],
      leagueIds: [],
      now: NOW,
    });
    expect(home.hero?.fixture.id).toBe('fav-live');
    expect(home.hero?.why).toBe('favorite-live');
    expect(home.also.map((p) => p.fixture.id)).not.toContain('nike-live');
  });

  it('prefers a favorite-league live match over featured when no club is playing', () => {
    const home = pickMatchdayHome(catalog([nikeLive, plLive]), {
      teamIds: ['bay'],
      leagueIds: ['epl'],
      now: NOW,
    });
    expect(home.hero?.fixture.id).toBe('pl-live');
    expect(home.hero?.why).toBe('league-live');
  });

  it('pins kickoff-soon favorites when nothing is live', () => {
    const soon = fx({
      id: 'fav-soon',
      status: 'upcoming',
      kickoff: iso(25 * 60_000),
      homeTeamId: 'ars',
      awayTeamId: 'mun',
    });
    const later = fx({
      id: 'later',
      status: 'upcoming',
      kickoff: iso(200 * 60_000),
      homeTeamId: 'liv',
      awayTeamId: 'che',
    });
    const home = pickMatchdayHome(catalog([later, soon]), {
      teamIds: ['ars'],
      leagueIds: ['epl'],
      now: NOW,
    });
    expect(home.hero?.fixture.id).toBe('fav-soon');
    expect(home.hero?.why).toBe('favorite-soon');
  });

  it('pins a just-finished favorite, not a stale result', () => {
    const fresh = fx({
      id: 'fresh-ft',
      status: 'finished',
      kickoff: iso(-(90 * 60_000)),
      homeScore: 2,
      awayScore: 0,
    });
    const stale = fx({
      id: 'stale-ft',
      status: 'finished',
      kickoff: iso(-(6 * 60 * 60_000)),
      homeTeamId: 'liv',
      awayTeamId: 'mun',
    });
    const home = pickMatchdayHome(catalog([stale, fresh]), {
      teamIds: ['liv'],
      leagueIds: [],
      now: NOW,
    });
    expect(home.hero?.fixture.id).toBe('fresh-ft');
    expect(home.hero?.why).toBe('favorite-finished');
  });

  it('falls back to Premier League live before Niké Liga and La Liga when there are no favorites', () => {
    const home = pickMatchdayHome(catalog([ligaLive, nikeLive, plLive]), {
      teamIds: [],
      leagueIds: [],
      now: NOW,
    });
    expect(home.hasFavorites).toBe(false);
    expect(home.hero?.fixture.id).toBe('pl-live');
    expect(home.hero?.why).toBe('featured-live');
    expect(home.also.map((p) => p.fixture.id)).toEqual(['nike-live', 'liga-live']);
  });

  it('falls back to Niké Liga live when Premier League is idle', () => {
    const home = pickMatchdayHome(catalog([ligaLive, nikeLive]), {
      teamIds: [],
      leagueIds: [],
      now: NOW,
    });
    expect(home.hero?.fixture.id).toBe('nike-live');
    expect(featuredLeaguePriority(catalog([nikeLive]), nikeLive)).toBe(1);
  });

  it('does not treat empty favorites as “every live match”', () => {
    const home = pickMatchdayHome(catalog([serieLive]), {
      teamIds: [],
      leagueIds: [],
      now: NOW,
    });
    expect(home.hero).toBeUndefined();
    expect(home.also).toEqual([]);
    expect(defaultHomePane(home)).toBe('feed');
  });

  it('uses a featured live match when the user’s club is not in a matchday window', () => {
    const home = pickMatchdayHome(catalog([nikeLive, serieLive]), {
      teamIds: ['bay'],
      leagueIds: ['bundesliga'],
      now: NOW,
    });
    expect(home.hasFavorites).toBe(true);
    expect(home.hero?.fixture.id).toBe('nike-live');
    expect(home.hero?.why).toBe('featured-live');
  });

  it('follows a favorite player’s club onto the hero', () => {
    const player: Player = {
      id: 'p-liv-11',
      name: 'Mohamed Salah',
      shortName: 'Salah',
      teamId: 'liv',
      number: 11,
      pos: 'FW',
      nationality: 'EGY',
      age: 33,
    };
    const home = pickMatchdayHome(
      catalog([favoriteLive, nikeLive], { players: { 'p-liv-11': player } }),
      { teamIds: [], leagueIds: [], playerIds: ['p-liv-11'], now: NOW },
    );
    expect(home.hero?.fixture.id).toBe('fav-live');
    expect(home.hero?.care).toBe('club');
  });

  it('resolves mock league favorites onto live ids via relatedIds', () => {
    const livePl = fx({ id: '9001', leagueId: '39', homeTeamId: '40', awayTeamId: '42' });
    const provider = catalog([livePl, nikeLive], {
      related: {
        'league:epl': ['epl', '39'],
        'league:39': ['39', 'epl'],
        'league:nikeliga': ['nikeliga', '332'],
      },
    });
    const home = pickMatchdayHome(provider, {
      teamIds: [],
      leagueIds: ['epl'],
      now: NOW,
    });
    expect(home.hero?.fixture.id).toBe('9001');
    expect(home.hero?.why).toBe('league-live');
  });

  it('picks Maya’s mock Liverpool–Arsenal as the demo hero', () => {
    const home = pickMatchdayHome(mockFootballProvider, {
      teamIds: ['ars', 'liv'],
      leagueIds: ['epl', 'ucl'],
    });
    expect(home.hero?.fixture.id).toBe('fx-liv-ars');
    expect(home.hero?.why).toBe('favorite-live');
    expect(defaultHomePane(home)).toBe('matchday');
  });
});

describe('matchdayWhyLabel', () => {
  it('keeps hero kicker copy short and pitch-honest', () => {
    expect(matchdayWhyLabel('favorite-live')).toMatch(/Your club/);
    expect(matchdayWhyLabel('featured-live')).toMatch(/Featured/);
    expect(matchdayWhyLabel('league-soon')).toMatch(/kickoff soon/);
  });
});

describe('live catalog matchday fallback', () => {
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
  const livArsFt: ApiFixture = {
    fixture: {
      id: 9001,
      date: '2026-09-16T12:00:00+00:00',
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

  it('features Niké Liga live when England is finished outside the just-finished window and the user has no favorites', async () => {
    const http: FootballHttp = vi.fn(async (path, params) => {
      if (path === '/fixtures') {
        if (params?.league === '332' || params?.league === 332) return [slovanDac];
        if (params?.league === '39' || params?.league === 39) return [livArsFt];
        return [];
      }
      if (path === '/standings') return [];
      if (path === '/players/topscorers') return [];
      return [];
    });
    const live = createLiveFootballProvider({
      fallback: mockFootballProvider,
      http,
      season: 2026,
      now: () => Date.parse('2026-09-16T18:00:00.000Z'),
    });
    await live.hydrate();
    const home = pickMatchdayHome(live, {
      teamIds: [],
      leagueIds: [],
      now: Date.parse('2026-09-16T18:00:00.000Z'),
    });
    expect(home.hero?.fixture.id).toBe('9101');
    expect(home.hero?.why).toBe('featured-live');
  });
});

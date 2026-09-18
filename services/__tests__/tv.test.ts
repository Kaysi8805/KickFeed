import type { Fixture } from '@/data/types';
import { localeRegion, resolveTvCountryId, tvCountryFromDevice } from '@/lib/tvCountry';
import { mockFootballProvider } from '@/services/football';
import { createLiveFootballProvider } from '@/services/footballLive';
import type { ApiFixture, FootballHttp } from '@/services/footballApi';
import {
  broadcastsByMatch,
  createEditorialTvProvider,
  isEnglandCompetition,
  listingsByCountry,
  resolveAiringsForFixture,
  sameEnglandLeague,
} from '@/services/tv';
import { describe, expect, it, vi } from 'vitest';

const NOW = Date.parse('2026-09-16T12:00:00.000Z');

const livArs: ApiFixture = {
  fixture: {
    id: 9001,
    date: '2026-09-16T19:00:00+00:00',
    venue: { name: 'Anfield', city: 'Liverpool' },
    status: { short: '1H', elapsed: 34 },
  },
  league: { id: 39, name: 'Premier League' },
  teams: {
    home: { id: 40, name: 'Liverpool' },
    away: { id: 42, name: 'Arsenal' },
  },
  goals: { home: 2, away: 1 },
};

const champ: ApiFixture = {
  fixture: {
    id: 9100,
    date: '2026-09-17T18:45:00+00:00',
    venue: { name: 'Elland Road', city: 'Leeds' },
    status: { short: 'NS' },
  },
  league: { id: 40, name: 'Championship' },
  teams: {
    home: { id: 63, name: 'Leeds' },
    away: { id: 54, name: 'Birmingham' },
  },
  goals: { home: null, away: null },
};

function fakeHttp(): FootballHttp {
  return vi.fn(async (path, params) => {
    if (path === '/fixtures') return params?.league === 40 || params?.league === '40' ? [champ] : [livArs];
    if (path === '/standings') return [];
    if (path === '/players/topscorers') return [];
    return [];
  });
}

function names(matchId: string, countryId: string): string[] {
  return broadcastsByMatch(mockFootballProvider, matchId, countryId).flatMap((row) =>
    row.airings.map((a) => a.channel.shortName),
  );
}

describe('editorial TV lookup (mock catalog)', () => {
  it('returns UK / SK / US channels for a featured PL fixture', () => {
    expect(names('fx-liv-ars', 'gbr')).toEqual(expect.arrayContaining(['Sky ME', 'Sky PL', 'NOW']));
    expect(names('fx-liv-ars', 'svk')).toEqual(expect.arrayContaining(['Premier Sport 1', 'Voyo']));
    expect(names('fx-liv-ars', 'usa')).toEqual(expect.arrayContaining(['USA', 'Peacock']));
  });

  it('uses a different UK package for another featured fixture', () => {
    expect(names('fx-mci-che', 'gbr')).toEqual(expect.arrayContaining(['TNT 1', 'discovery+']));
    expect(names('fx-mci-che', 'gbr')).not.toContain('Sky ME');
  });

  it('falls back to the league package for other England fixtures', () => {
    const generated = mockFootballProvider.getFixtures({ leagueId: 'epl' }).find((f) => f.id.startsWith('fx-epl-'));
    expect(generated).toBeTruthy();
    const resolved = resolveAiringsForFixture(mockFootballProvider, generated!, 'gbr');
    expect(resolved.via).toBe('league');
    expect(resolved.airings.map((a) => a.channel.id)).toEqual(expect.arrayContaining(['sky-pl', 'now']));
  });

  it('does not invent listings for non-England matches', () => {
    expect(names('fx-rma-bar', 'gbr')).toEqual([]);
    expect(broadcastsByMatch(mockFootballProvider, 'fx-does-not-exist', 'gbr')).toEqual([]);
  });

  it('lists every launch geo when country is omitted', () => {
    const rows = broadcastsByMatch(mockFootballProvider, 'fx-liv-ars');
    expect(rows.map((r) => r.country.id).sort()).toEqual(['gbr', 'svk', 'usa']);
  });
});

describe('England league mapping', () => {
  it('treats mock epl ids and live 39/40 ids as England competitions', () => {
    expect(isEnglandCompetition('epl')).toBe(true);
    expect(isEnglandCompetition('39')).toBe(true);
    expect(isEnglandCompetition('elc')).toBe(true);
    expect(isEnglandCompetition('40')).toBe(true);
    expect(isEnglandCompetition('laliga')).toBe(false);
    expect(isEnglandCompetition('nikeliga')).toBe(false);
    expect(isEnglandCompetition('332')).toBe(false);
    expect(sameEnglandLeague('epl', '39')).toBe(true);
    expect(sameEnglandLeague('elc', '40')).toBe(true);
    expect(sameEnglandLeague('epl', '40')).toBe(false);
  });
});

describe('TV listings by country + date', () => {
  it('groups today vs upcoming using the geo timezone', () => {
    const todayFx: Fixture = {
      id: 'fx-liv-ars',
      leagueId: 'epl',
      homeTeamId: 'liv',
      awayTeamId: 'ars',
      kickoff: '2026-09-16T19:00:00.000Z',
      status: 'live',
      minute: 34,
      homeScore: 2,
      awayScore: 1,
      events: [],
      venue: 'Anfield',
    };
    const tomorrowFx: Fixture = {
      ...todayFx,
      id: 'fx-bha-mun',
      homeTeamId: 'bha',
      awayTeamId: 'mun',
      kickoff: '2026-09-17T18:00:00.000Z',
      status: 'upcoming',
      minute: undefined,
      homeScore: 0,
      awayScore: 0,
    };
    const catalog = {
      ...mockFootballProvider,
      getFixtures: () => [todayFx, tomorrowFx],
      getFixture: (id: string) => [todayFx, tomorrowFx].find((f) => f.id === id),
    };
    const today = listingsByCountry(catalog, 'gbr', { window: 'today', now: NOW });
    const upcoming = listingsByCountry(catalog, 'gbr', { window: 'upcoming', now: NOW });
    expect(today.map((r) => r.fixture.id)).toEqual(['fx-liv-ars']);
    expect(upcoming.map((r) => r.fixture.id)).toEqual(['fx-bha-mun']);
    expect(today[0]?.airings.length).toBeGreaterThan(0);
  });
});

describe('live match ids alias onto editorial listings', () => {
  it('maps a live PL id onto the mock LIV–ARS package and Championship onto the league fallback', async () => {
    const live = createLiveFootballProvider({
      fallback: mockFootballProvider,
      http: fakeHttp(),
      season: 2026,
      now: () => NOW,
    });
    await live.hydrate();
    const tvLive = createEditorialTvProvider(live);
    const uk = tvLive.getBroadcastsByMatch('9001', 'gbr');
    expect(uk[0]?.airings.map((a) => a.channel.shortName)).toEqual(
      expect.arrayContaining(['Sky ME', 'Sky PL', 'NOW']),
    );
    expect(resolveAiringsForFixture(live, live.getFixture('9001')!, 'svk').via).toBe('match');

    const elc = tvLive.getBroadcastsByMatch('9100', 'gbr');
    expect(elc[0]?.airings.map((a) => a.channel.id)).toEqual(expect.arrayContaining(['sky-football', 'now']));
    expect(resolveAiringsForFixture(live, live.getFixture('9100')!, 'usa').via).toBe('league');
  });
});

describe('TV country from locale', () => {
  it('maps GB / SK / US and defaults to Slovakia', () => {
    expect(localeRegion('en-GB')).toBe('GB');
    expect(localeRegion('sk-SK')).toBe('SK');
    expect(localeRegion('sk')).toBe('SK');
    expect(localeRegion('en_US')).toBe('US');
    expect(tvCountryFromDevice({ locale: 'en-GB' })).toBe('gbr');
    expect(tvCountryFromDevice({ locale: 'sk-SK' })).toBe('svk');
    expect(tvCountryFromDevice({ locale: 'en-US' })).toBe('usa');
    expect(tvCountryFromDevice({ timeZone: 'Europe/London' })).toBe('gbr');
    expect(tvCountryFromDevice({ timeZone: 'Europe/Bratislava' })).toBe('svk');
    expect(tvCountryFromDevice({ timeZone: 'America/Los_Angeles' })).toBe('usa');
    expect(tvCountryFromDevice({ locale: 'ja-JP', timeZone: 'Asia/Tokyo' })).toBe('svk');
    expect(resolveTvCountryId('gbr', { locale: 'sk-SK' })).toBe('gbr');
    expect(resolveTvCountryId('xx', { locale: 'en-GB' })).toBe('gbr');
    expect(resolveTvCountryId(undefined, {})).toBe('svk');
  });
});

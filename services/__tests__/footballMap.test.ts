import {
  emptyLineup,
  mapEventType,
  mapFixture,
  mapForm,
  mapMatchEvent,
  mapMatchStatus,
  mapLineup,
  mapPlayerSeason,
  mapPlayerStats,
  mapSeasonForm,
  mapTeamStatistics,
  mapPosition,
  mapScorer,
  mapSquadPlayer,
  mapStandingRow,
  mapTeam,
  canonicalLeagueId,
  leagueAliases,
  mockClubStyle,
  isLiveLeague,
} from '@/services/footballMap';
import {
  createApiFootballHttp,
  describeApiErrors,
  europeanSeasonYear,
  fixtureDateWindow,
  footballApiKeyFromEnv,
  footballBffUrlFromEnv,
} from '@/services/footballApi';
import { teams } from '@/data/mocks/catalog';
import { describe, expect, it, vi } from 'vitest';

describe('football mappers', () => {
  it('maps API-Football status codes onto KickFeed match status', () => {
    expect(mapMatchStatus('NS')).toBe('upcoming');
    expect(mapMatchStatus('1H')).toBe('live');
    expect(mapMatchStatus('HT')).toBe('ht');
    expect(mapMatchStatus('2H')).toBe('live');
    expect(mapMatchStatus('FT')).toBe('finished');
    expect(mapMatchStatus('CANC')).toBe('skip');
  });

  it('maps a live Premier League fixture including delayed/live minute', () => {
    const fx = mapFixture({
      fixture: {
        id: 123,
        date: '2026-09-16T19:00:00+00:00',
        venue: { name: 'Anfield', city: 'Liverpool' },
        status: { short: '2H', elapsed: 67 },
      },
      league: { id: 39, name: 'Premier League' },
      teams: {
        home: { id: 40, name: 'Liverpool' },
        away: { id: 42, name: 'Arsenal' },
      },
      goals: { home: 2, away: 1 },
    });
    expect(fx).toMatchObject({
      id: '123',
      leagueId: '39',
      homeTeamId: '40',
      awayTeamId: '42',
      status: 'live',
      minute: 67,
      homeScore: 2,
      awayScore: 1,
      venue: 'Anfield, Liverpool',
    });
  });

  it('drops cancelled fixtures', () => {
    expect(
      mapFixture({
        fixture: { id: 1, date: '2026-01-01T00:00:00Z', status: { short: 'CANC' } },
        league: { id: 39, name: 'Premier League' },
        teams: { home: { id: 1, name: 'A' }, away: { id: 2, name: 'B' } },
        goals: { home: null, away: null },
      }),
    ).toBeUndefined();
  });

  it('maps standings form, squad positions, and scorers', () => {
    const row = mapStandingRow({
      rank: 1,
      team: { id: 42, name: 'Arsenal' },
      points: 20,
      form: 'WWDLw',
      all: { played: 8, win: 6, draw: 2, lose: 0, goals: { for: 18, against: 5 } },
    });
    expect(row.teamId).toBe('42');
    expect(row.form).toEqual(['W', 'W', 'D', 'L', 'W']);
    expect(mapForm('')).toEqual([]);
    expect(mapPosition('Goalkeeper')).toBe('GK');
    expect(mapPosition('D')).toBe('DF');
    expect(mapSquadPlayer({ id: 99, name: 'Bukayo Saka', age: 24, number: 7, position: 'Attacker' }, '42')).toMatchObject({
      id: '99',
      teamId: '42',
      pos: 'FW',
      shortName: 'Saka',
    });
    const scorer = mapScorer(
      {
        player: { id: 306, name: 'Mohamed Salah' },
        statistics: [{ team: { id: 40, name: 'Liverpool' }, goals: { total: 12, assists: 4 } }],
      },
      0,
    );
    expect(scorer?.playerId).toBe('306');
    expect(scorer?.goals).toBe(12);
    expect(mapPlayerStats({
      player: { id: 306, name: 'Mohamed Salah' },
      statistics: [{
        team: { id: 40, name: 'Liverpool' },
        goals: { total: 12, assists: 4 },
        games: { appearences: 8, minutes: 720, rating: '7.45' },
        cards: { yellow: 1, red: 0 },
      }],
    })?.rating).toBe(7.5);
  });

  it('sums a player season across competitions and refuses an empty payload', () => {
    expect(mapPlayerSeason(undefined)).toBeUndefined();
    expect(mapPlayerSeason({ statistics: [] })).toBeUndefined();
    expect(mapPlayerSeason({
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
          goals: { total: 1, assists: null },
          cards: { yellow: 0, red: 1 },
        },
      ],
    })).toEqual({
      appearances: 12,
      goals: 9,
      assists: 3,
      minutes: 920,
      yellows: 2,
      reds: 1,
      rating: 7.6,
    });
    expect(mapPlayerSeason({
      statistics: [{
        team: { id: 40, name: 'Liverpool' },
        games: { appearences: 0, minutes: 0, rating: null },
        goals: { total: null, assists: null },
        cards: { yellow: null, red: null },
      }],
    })).toBeUndefined();
    expect(mapPlayerSeason({
      statistics: [{
        team: { id: 40, name: 'Liverpool' },
        games: { appearences: null, minutes: null, rating: null },
        goals: { total: null, assists: null },
        cards: { yellow: null, red: null },
      }],
    })).toBeUndefined();
  });

  it('maps team statistics and refuses an empty or mismatched payload', () => {
    expect(mapTeamStatistics([], { teamId: '40', leagueId: '39', season: 2026 })).toBeUndefined();
    expect(mapTeamStatistics(null, { teamId: '40', leagueId: '39', season: 2026 })).toBeUndefined();
    expect(
      mapTeamStatistics(
        {
          team: { id: 40 },
          league: { id: 39 },
          form: null,
          fixtures: { played: { home: null, away: null, total: null } },
          clean_sheet: { total: null },
          goals: { for: { average: { total: null } } },
        },
        { teamId: '40', leagueId: '39', season: 2026 },
      ),
    ).toBeUndefined();
    expect(
      mapTeamStatistics(
        { team: { id: 42 }, league: { id: 39 }, form: 'WWW' },
        { teamId: '40', leagueId: '39', season: 2026 },
      ),
    ).toBeUndefined();

    const mapped = mapTeamStatistics(
      {
        league: { id: 39, season: 2026 },
        team: { id: 40, name: 'Liverpool', venue: { name: 'Anfield', city: 'Liverpool' } },
        form: 'WDLWWDLWWD',
        fixtures: {
          played: { home: 10, away: 9, total: 19 },
          wins: { home: 7, away: 4, total: 11 },
          draws: { home: 2, away: 3, total: 5 },
          loses: { home: 1, away: 2, total: 3 },
        },
        goals: {
          for: {
            total: { home: 22, away: 12, total: 34 },
            average: { home: '2.2', away: '1.3', total: '1.8' },
          },
          against: {
            total: { home: 8, away: 11, total: 19 },
            average: { home: '0.8', away: '1.2', total: '1.0' },
          },
        },
        clean_sheet: { home: 5, away: 2, total: 7 },
        failed_to_score: { home: 1, away: 3, total: 4 },
        lineups: [
          { formation: '4-2-3-1', played: 4 },
          { formation: '4-3-3', played: 15 },
        ],
        shots: { total: 99 },
        possession: '61%',
      },
      { teamId: '40', leagueId: '39', season: 2026 },
    );
    expect(mapped).toEqual({
      teamId: '40',
      leagueId: '39',
      season: 2026,
      form: mapSeasonForm('WDLWWDLWWD'),
      played: { home: 10, away: 9, total: 19 },
      wins: { home: 7, away: 4, total: 11 },
      draws: { home: 2, away: 3, total: 5 },
      losses: { home: 1, away: 2, total: 3 },
      goalsFor: { home: 22, away: 12, total: 34 },
      goalsAgainst: { home: 8, away: 11, total: 19 },
      goalsForAverage: { home: 2.2, away: 1.3, total: 1.8 },
      goalsAgainstAverage: { home: 0.8, away: 1.2, total: 1 },
      cleanSheets: { home: 5, away: 2, total: 7 },
      failedToScore: { home: 1, away: 3, total: 4 },
      formation: '4-3-3',
      venue: 'Anfield, Liverpool',
    });
    expect(mapped).not.toHaveProperty('shots');
    expect(mapped).not.toHaveProperty('possession');
    expect(mapped?.coach).toBeUndefined();
    expect(
      mapTeamStatistics(
        {
          team: { id: 40 },
          league: { id: 39 },
          form: 'W',
          coach: { id: 1, name: ' Arne Slot ' },
        },
        { teamId: '40', leagueId: '39', season: 2026 },
      )?.coach,
    ).toBe('Arne Slot');
    const coachOnly = mapLineup({
      team: { id: 40, name: 'Liverpool' },
      formation: '4-3-3',
      coach: { id: 1, name: ' Arne Slot ' },
      startXI: [],
    });
    expect(coachOnly.coach).toBe('Arne Slot');
    expect(coachOnly.source).toBeUndefined();
    expect(coachOnly.players).toEqual([]);
    const sheet = mapLineup({
      team: { id: 40, name: 'Liverpool' },
      formation: ' 4-3-3 ',
      startXI: [{ player: { id: 306, name: 'Salah', number: 11, pos: 'F', grid: '4:2' } }],
      substitutes: [{ player: { id: 999, name: 'Jones', number: 17, pos: 'M', grid: null } }],
    });
    expect(sheet).toMatchObject({
      formation: '4-3-3',
      source: 'sheet',
      players: [{ playerId: '306', grid: { row: 4, col: 2 }, pos: 'FW' }],
      bench: [{ playerId: '999', pos: 'MF' }],
    });
    expect(sheet.bench?.[0]?.grid).toBeUndefined();
    expect(mapLineup({ team: { id: 40, name: 'Liverpool' }, startXI: [{ player: { id: 1, name: 'A', number: 1, pos: 'G' } }] }).formation).toBe('—');
  });

  it('maps goals, cards, and subs from events', () => {
    expect(mapEventType('Goal', 'Normal Goal')).toBe('goal');
    expect(mapEventType('Card', 'Yellow Card')).toBe('yellow');
    expect(mapEventType('Card', 'Red Card')).toBe('red');
    const ev = mapMatchEvent(
      {
        time: { elapsed: 12, extra: null },
        team: { id: 40, name: 'Liverpool' },
        player: { id: 306, name: 'Salah' },
        assist: { id: 1, name: 'Mac Allister' },
        type: 'Goal',
        detail: 'Normal Goal',
      },
      0,
    );
    expect(ev).toMatchObject({ type: 'goal', playerId: '306', detail: 'Assist: Mac Allister' });
  });

  it('aliases Premier League, Niké Liga, and La Liga mock ids and reuses mock Arsenal colors', () => {
    expect(canonicalLeagueId('epl')).toBe('39');
    expect(leagueAliases('39')).toContain('epl');
    expect(canonicalLeagueId('nikeliga')).toBe('332');
    expect(canonicalLeagueId('laliga')).toBe('140');
    expect(isLiveLeague('nikeliga')).toBe(true);
    expect(isLiveLeague('78')).toBe(false);
    expect(mockClubStyle('Arsenal').mockId).toBe('ars');
    expect(mapTeam({ id: 42, name: 'Arsenal' }).color).toBe('#EF0107');
    expect(mapTeam({ id: 541, name: 'Real Madrid' }, 'esp').countryId).toBe('esp');
    expect(emptyLineup().players).toEqual([]);
  });

  it('keeps API crest urls and seeds mock club badges', () => {
    expect(
      mapTeam({ id: 42, name: 'Arsenal', logo: 'https://media.api-sports.io/football/teams/42.png' }).logoUrl,
    ).toBe('https://media.api-sports.io/football/teams/42.png');
    expect(mapTeam({ id: 40, name: 'Liverpool', logo: '  ' }).logoUrl).toBe(
      'https://media.api-sports.io/football/teams/40.png',
    );
    expect(mapTeam({ id: 40, name: 'Liverpool' }).logoUrl).toContain('/teams/40.png');
    expect(teams.find((t) => t.id === 'ars')?.logoUrl).toBe('https://media.api-sports.io/football/teams/42.png');
    expect(teams.find((t) => t.id === 'liv')?.logoUrl).toBe('https://media.api-sports.io/football/teams/40.png');
    expect(teams.find((t) => t.id === 'slovan')?.logoUrl).toContain('/teams/656.png');
    expect(teams.find((t) => t.id === 'rma')?.logoUrl).toContain('/teams/541.png');
  });
});

describe('API-Football helpers', () => {
  it('reads the public env key and ignores blanks', () => {
    expect(footballApiKeyFromEnv({ EXPO_PUBLIC_FOOTBALL_API_KEY: '  abc  ' })).toBe('abc');
    expect(footballApiKeyFromEnv({ EXPO_PUBLIC_FOOTBALL_API_KEY: '   ' })).toBeUndefined();
    expect(footballBffUrlFromEnv({ EXPO_PUBLIC_FOOTBALL_BFF_URL: 'https://bff.test/' })).toBe('https://bff.test');
    expect(footballBffUrlFromEnv({ EXPO_PUBLIC_FOOTBALL_BFF_URL: '  ' })).toBeUndefined();
    expect(
      footballBffUrlFromEnv({ EXPO_PUBLIC_FOOTBALL_BFF_URL: 'https://kickfeed-football-bff.<account>.workers.dev' }),
    ).toBeUndefined();
  });

  it('calls the BFF without sending a client API key', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ response: [{ ok: true }] }), { status: 200 }));
    const http = createApiFootballHttp({ bffUrl: 'https://bff.example/', apiKey: 'should-not-leave-the-client' }, fetchImpl);
    await expect(http('/fixtures', { league: 39 })).resolves.toEqual([{ ok: true }]);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://bff.example/fixtures?league=39',
      expect.objectContaining({
        headers: expect.not.objectContaining({ 'x-apisports-key': expect.anything() }),
      }),
    );
  });

  it('labels the European season from July and formats a fixture window', () => {
    expect(europeanSeasonYear(new Date('2026-09-16T00:00:00Z'))).toBe(2026);
    expect(europeanSeasonYear(new Date('2026-03-01T00:00:00Z'))).toBe(2025);
    expect(fixtureDateWindow(new Date('2026-09-16T00:00:00Z'))).toEqual({ from: '2026-09-02', to: '2026-10-07' });
  });

  it('flattens API error objects and empty arrays', () => {
    expect(describeApiErrors([])).toBeNull();
    expect(describeApiErrors({ token: 'Invalid API Key' })).toBe('Invalid API Key');
  });
});

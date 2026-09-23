import { describe, expect, it, vi } from 'vitest';

import type { Fixture } from '@/data/types';
import { DEMO_DENSIFY_BANNER } from '@/lib/honesty';
import { lastCachedXi } from '@/lib/teamPhaseA';
import {
  buildTeamOverviewDensify,
  densifyIsActive,
  overviewLastXi,
  resolveMockTeamAlias,
} from '@/lib/teamOverviewDensify';
import { mockFootballProvider } from '@/services/football';
import { createLiveFootballProvider } from '@/services/footballLive';
import type { FootballHttp } from '@/services/footballApi';

/** Finished mock seed. `getLineups` builds a full XI from the mock squad. */
const finishedMockLiv: Fixture = {
  id: 'fx-densify-mock-liv',
  leagueId: 'epl',
  homeTeamId: 'liv',
  awayTeamId: 'ars',
  kickoff: '2026-08-01T15:00:00.000Z',
  status: 'finished',
  homeScore: 2,
  awayScore: 0,
  events: [],
  venue: 'Anfield',
};

function liveHttp(): FootballHttp {
  return vi.fn(async (path) => {
    if (path === '/fixtures') {
      return [{
        fixture: {
          id: 9001,
          date: '2026-09-01T15:00:00+00:00',
          venue: { name: 'Anfield', city: 'Liverpool' },
          status: { short: 'FT', elapsed: 90 },
        },
        league: { id: 39, name: 'Premier League' },
        teams: {
          home: { id: 40, name: 'Liverpool' },
          away: { id: 42, name: 'Arsenal' },
        },
        goals: { home: 2, away: 1 },
      }];
    }
    if (path === '/standings') return [{ league: { id: 39, standings: [[{ rank: 1, team: { id: 40, name: 'Liverpool' }, points: 3, all: { played: 1, win: 1, draw: 0, lose: 0, goals: { for: 2, against: 1 } } }]] } }];
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

describe('teamOverviewDensify', () => {
  it('resolves an aliased mock id next to a live numeric id', () => {
    expect(resolveMockTeamAlias(['40', 'liv'], (id) => mockFootballProvider.getTeam(id))).toBe('liv');
    expect(resolveMockTeamAlias(['40'], (id) => mockFootballProvider.getTeam(id))).toBeUndefined();
    expect(resolveMockTeamAlias(['bay'], (id) => mockFootballProvider.getTeam(id))).toBe('bay');
  });

  it('builds mock densify for Liverpool with season, scorers, stats, and form letters', () => {
    const densify = buildTeamOverviewDensify('liv', '40', mockFootballProvider);
    expect(densify.mockTeamId).toBe('liv');
    expect(densify.formLetters.length).toBeGreaterThan(0);
    expect(densify.standing).toMatchObject({ teamId: '40', played: 10 });
    expect(densify.scorers.some((row) => /Salah/i.test(row.playerName))).toBe(true);
    expect(densify.stats?.venue).toBe('Anfield');
    expect(densify.stats?.teamId).toBe('liv');
    expect(densify.stats?.formation).toBeTruthy();
  });

  it('keeps Last XI empty when live lineup cache is empty even if getLineups would invent a mock XI', async () => {
    const live = createLiveFootballProvider({
      fallback: mockFootballProvider,
      http: liveHttp(),
      season: 2026,
      now: () => Date.parse('2026-09-16T12:00:00.000Z'),
    });
    await live.hydrate();

    const invented = lastCachedXi([finishedMockLiv], 'liv', (fixture) => live.getLineups(fixture));
    expect(invented?.players.length).toBeGreaterThan(0);
    expect(live.getCachedLiveLineups(finishedMockLiv)).toBeUndefined();

    const densify = buildTeamOverviewDensify('liv', '40', mockFootballProvider);
    expect(densify.scorers.length).toBeGreaterThan(0);
    expect('xi' in densify).toBe(false);

    expect(overviewLastXi('live', [finishedMockLiv], 'liv', live)).toBeUndefined();
    const window = live.getFixtures({ teamId: '40' });
    expect(window.some((fixture) => fixture.id === '9001' && fixture.status === 'finished')).toBe(true);
    expect(overviewLastXi('live', [...window, finishedMockLiv], '40', live)).toBeUndefined();
    expect(overviewLastXi('live', [...window, finishedMockLiv], 'liv', live)).toBeUndefined();

    await live.ensureLineups('9001');
    const cached = live.getFixture('9001');
    expect(cached).toBeTruthy();
    const shown = overviewLastXi('live', [cached!, finishedMockLiv], '40', live);
    expect(shown?.fixtureId).toBe('9001');
    expect(shown?.players[0]?.playerId).toBe('306');
    expect(overviewLastXi('live', [finishedMockLiv], 'liv', live)).toBeUndefined();
  });

  it('marks densify active only for blocks that actually fell back', () => {
    expect(
      densifyIsActive({
        liveFormEmpty: true,
        densifyForm: true,
        liveSeasonMissing: true,
        densifySeason: false,
        liveStatsMissing: true,
        densifyStats: false,
        liveScorersEmpty: true,
        densifyScorers: false,
      }),
    ).toBe(true);
    expect(
      densifyIsActive({
        liveFormEmpty: false,
        densifyForm: true,
        liveSeasonMissing: false,
        densifySeason: true,
        liveStatsMissing: false,
        densifyStats: true,
        liveScorersEmpty: false,
        densifyScorers: true,
      }),
    ).toBe(false);
  });

  it('keeps honesty copy clear that densify is not live free-tier', () => {
    expect(DEMO_DENSIFY_BANNER).toMatch(/demo densify/i);
    expect(DEMO_DENSIFY_BANNER).toMatch(/not live free-tier/i);
  });
});

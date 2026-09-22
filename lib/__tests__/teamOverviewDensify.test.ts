import { describe, expect, it } from 'vitest';

import { DEMO_DENSIFY_BANNER } from '@/lib/honesty';
import { lastCachedXi } from '@/lib/teamPhaseA';
import {
  buildTeamOverviewDensify,
  densifyIsActive,
  overviewLastXi,
  resolveMockTeamAlias,
} from '@/lib/teamOverviewDensify';
import { mockFootballProvider } from '@/services/football';

describe('teamOverviewDensify', () => {
  it('resolves an aliased mock id next to a live numeric id', () => {
    expect(resolveMockTeamAlias(['40', 'liv'], (id) => mockFootballProvider.getTeam(id))).toBe('liv');
    expect(resolveMockTeamAlias(['40'], (id) => mockFootballProvider.getTeam(id))).toBeUndefined();
    expect(resolveMockTeamAlias(['bay'], (id) => mockFootballProvider.getTeam(id))).toBe('bay');
  });

  it('builds mock densify for Liverpool with season, scorers, stats, and form letters', () => {
    const densify = buildTeamOverviewDensify('liv', '40', mockFootballProvider);
    expect(densify.mockTeamId).toBe('liv');
    // Featured LIV–ARS sits in the live mock window, so fixture form may be empty —
    // densify still fills season letters, table, scorers, and teamStatsFor.
    expect(densify.formLetters.length).toBeGreaterThan(0);
    expect(densify.standing).toMatchObject({ teamId: '40', played: 10 });
    expect(densify.scorers.some((row) => /Salah/i.test(row.playerName))).toBe(true);
    expect(densify.stats?.venue).toBe('Anfield');
    expect(densify.stats?.teamId).toBe('liv');
    expect(densify.stats?.formation).toBeTruthy();
  });

  it('keeps Last XI empty without a cached live lineup even when mock densify is active', () => {
    const densify = buildTeamOverviewDensify('liv', '40', mockFootballProvider);
    expect(densify.formLetters.length).toBeGreaterThan(0);
    expect(densify.scorers.length).toBeGreaterThan(0);
    expect(densify.stats).toBeTruthy();
    expect('xi' in densify).toBe(false);

    // Mock getLineups can invent a starting XI for finished seeds — Overview must not use it.
    const mockInventedXi = lastCachedXi(
      mockFootballProvider.getFixtures({ teamId: 'ars' }),
      'ars',
      (fixture) => mockFootballProvider.getLineups(fixture),
    );
    expect(overviewLastXi(undefined)).toBeUndefined();
    expect(overviewLastXi(undefined) ?? (densify as { xi?: unknown }).xi).toBeUndefined();
    // Sanity: mock path can still build an XI; live Overview simply never falls back to it.
    if (mockInventedXi) {
      expect(mockInventedXi.players.length).toBeGreaterThan(0);
    }
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

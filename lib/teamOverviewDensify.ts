/**
 * When live free-tier cache misses for an aliased coverage club, Overview can densify
 * from the mock catalog — preferred live data still wins whenever it exists.
 *
 * Last XI is never densified. Live Overview only shows a lineup already stored from
 * `/fixtures/lineups`. `getLineups` is not used there: it falls through to mock
 * starting XIs when the live cache misses.
 */
import type { Fixture, FormResult, Lineup, Scorer, StandingRow, Team, TeamSeasonStats } from '@/data/types';
import type { CachedXi, TeamFormChip } from '@/lib/teamPhaseA';
import { lastCachedXi, recentTeamForm, teamChart } from '@/lib/teamPhaseA';
import type { FootballProvider, FootballSource } from '@/services/footballTypes';

const EMPTY_LINEUP: Lineup = { formation: '—', players: [] };
const EMPTY_LINEUP_PAIR = { home: EMPTY_LINEUP, away: EMPTY_LINEUP };

/**
 * Overview Last XI.
 * Live: cached `/fixtures/lineups` only. Passing mock `getLineups` cannot fill this.
 * Mock catalog: seeded lineups are the source of truth.
 */
export function overviewLastXi(
  source: FootballSource,
  fixtures: Fixture[],
  teamId: string,
  lineups: Pick<FootballProvider, 'getLineups' | 'getCachedLiveLineups'>,
): CachedXi | undefined {
  if (source === 'live') {
    return lastCachedXi(fixtures, teamId, (fixture) => lineups.getCachedLiveLineups(fixture) ?? EMPTY_LINEUP_PAIR);
  }
  return lastCachedXi(fixtures, teamId, (fixture) => lineups.getLineups(fixture));
}

export interface TeamOverviewDensify {
  mockTeamId: string;
  form: TeamFormChip[];
  /** Season-form letters when fixture form is empty (stats or standings). */
  formLetters: FormResult[];
  standing?: StandingRow;
  scorers: Scorer[];
  assists: Scorer[];
  stats?: TeamSeasonStats;
  venue?: string;
  coach?: string;
}

/** Mock catalog id among relatedIds (e.g. `liv` next to live `40`). */
export function resolveMockTeamAlias(
  relatedIds: readonly string[],
  getMockTeam: (id: string) => Team | undefined,
): string | undefined {
  for (const id of relatedIds) {
    if (/^[1-9]\d*$/.test(id)) continue;
    if (getMockTeam(id)) return id;
  }
  return undefined;
}

/**
 * Build densify patches for Overview empty blocks (form / season / scorers / stats).
 * Callers must prefer live data when it exists. Never includes Last XI.
 */
export function buildTeamOverviewDensify(
  mockTeamId: string,
  liveTeamId: string,
  mock: Pick<
    FootballProvider,
    'getFixtures' | 'getStandings' | 'getTopScorers' | 'getTeamStats' | 'getTeamCompetitions'
  >,
): TeamOverviewDensify {
  const fixtures = mock.getFixtures({ teamId: mockTeamId });
  const form = recentTeamForm(fixtures, mockTeamId);
  const comps = mock.getTeamCompetitions(mockTeamId);
  const league = comps.find((row) => row.featured) ?? comps[0];
  const table = league ? mock.getStandings(league.id) : [];
  const mockStanding = table.find((row) => row.teamId === mockTeamId);
  const standing = mockStanding ? { ...mockStanding, teamId: liveTeamId } : undefined;
  const scorersList = league ? mock.getTopScorers(league.id) : [];
  const chart = teamChart(scorersList, [mockTeamId]);
  const stats = mock.getTeamStats(mockTeamId);
  const formLetters =
    form.length > 0
      ? form.map((chip) => chip.result)
      : stats?.form?.length
        ? stats.form.slice(-5)
        : (standing?.form ?? []);
  return {
    mockTeamId,
    form,
    formLetters,
    ...(standing ? { standing } : {}),
    scorers: chart.scorers,
    assists: chart.assists,
    ...(stats ? { stats } : {}),
    ...(stats?.venue ? { venue: stats.venue } : {}),
    ...(stats?.coach ? { coach: stats.coach } : {}),
  };
}

export function densifyIsActive(parts: {
  liveFormEmpty: boolean;
  densifyForm: boolean;
  liveSeasonMissing: boolean;
  densifySeason: boolean;
  liveStatsMissing: boolean;
  densifyStats: boolean;
  liveScorersEmpty: boolean;
  densifyScorers: boolean;
}): boolean {
  return (
    (parts.liveFormEmpty && parts.densifyForm) ||
    (parts.liveSeasonMissing && parts.densifySeason) ||
    (parts.liveStatsMissing && parts.densifyStats) ||
    (parts.liveScorersEmpty && parts.densifyScorers)
  );
}

/**
 * When live free-tier cache misses for an aliased coverage club, Overview can densify
 * from the mock catalog — preferred live data still wins whenever it exists.
 */
import type { FormResult, Scorer, StandingRow, Team, TeamSeasonStats } from '@/data/types';
import type { CachedXi, TeamFormChip } from '@/lib/teamPhaseA';
import { lastCachedXi, recentTeamForm, teamChart } from '@/lib/teamPhaseA';
import type { FootballProvider } from '@/services/footballTypes';

export interface TeamOverviewDensify {
  mockTeamId: string;
  form: TeamFormChip[];
  /** Season-form letters when fixture form is empty (stats or standings). */
  formLetters: FormResult[];
  standing?: StandingRow;
  scorers: Scorer[];
  assists: Scorer[];
  xi?: CachedXi;
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
 * Build densify patches for Overview empty blocks.
 * Callers must prefer live form / standings / scorers / XI / stats when those exist.
 */
export function buildTeamOverviewDensify(
  mockTeamId: string,
  liveTeamId: string,
  mock: Pick<
    FootballProvider,
    'getFixtures' | 'getStandings' | 'getTopScorers' | 'getLineups' | 'getTeamStats' | 'getTeamCompetitions'
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
  const xi = lastCachedXi(fixtures, mockTeamId, (fixture) => mock.getLineups(fixture));
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
    ...(xi ? { xi } : {}),
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
  liveXiMissing: boolean;
  densifyXi: boolean;
}): boolean {
  return (
    (parts.liveFormEmpty && parts.densifyForm) ||
    (parts.liveSeasonMissing && parts.densifySeason) ||
    (parts.liveStatsMissing && parts.densifyStats) ||
    (parts.liveScorersEmpty && parts.densifyScorers) ||
    (parts.liveXiMissing && parts.densifyXi)
  );
}

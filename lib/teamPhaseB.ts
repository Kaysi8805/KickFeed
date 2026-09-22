import type { Fixture, FormResult, Lineup, TeamSeasonStats } from '@/data/types';

export interface SeasonStatChip {
  label: string;
  value: string;
}

export interface SeasonStatsPresentation {
  chips: SeasonStatChip[];
  homeRecord?: string;
  awayRecord?: string;
  /** Latest letters from the statistics form string. */
  form: FormResult[];
  formation?: string;
}

const SEASON_FORM_LIMIT = 8;
const SKIP_VENUES = new Set(['', 'tbd', 'home stadium']);

function sideRecord(stats: TeamSeasonStats, side: 'home' | 'away'): string | undefined {
  const wins = stats.wins?.[side];
  const draws = stats.draws?.[side];
  const losses = stats.losses?.[side];
  if (wins == null || draws == null || losses == null) return undefined;
  return `${wins}-${draws}-${losses}`;
}

/** Compact Overview block. Omits any number the payload did not actually send. */
export function presentTeamSeason(stats: TeamSeasonStats): SeasonStatsPresentation {
  const chips: SeasonStatChip[] = [];
  const goalsFor = stats.goalsForAverage?.total;
  const goalsAgainst = stats.goalsAgainstAverage?.total;
  if (goalsFor != null) chips.push({ label: 'GF/g', value: goalsFor.toFixed(1) });
  if (goalsAgainst != null) chips.push({ label: 'GA/g', value: goalsAgainst.toFixed(1) });
  if (stats.cleanSheets?.total != null) chips.push({ label: 'CS', value: String(stats.cleanSheets.total) });
  if (stats.failedToScore?.total != null) chips.push({ label: 'Failed', value: String(stats.failedToScore.total) });
  return {
    chips,
    homeRecord: sideRecord(stats, 'home'),
    awayRecord: sideRecord(stats, 'away'),
    form: stats.form.slice(-SEASON_FORM_LIMIT),
    ...(stats.formation ? { formation: stats.formation } : {}),
  };
}

/**
 * Home ground from fixtures already in memory.
 * Skips placeholders (`TBD`, generated "Home stadium") so we don't invent a name.
 */
export function cachedHomeVenue(fixtures: Fixture[], teamId: string): string | undefined {
  const counts = new Map<string, number>();
  for (const fixture of fixtures) {
    if (fixture.homeTeamId !== teamId) continue;
    const venue = fixture.venue?.trim() ?? '';
    if (SKIP_VENUES.has(venue.toLowerCase())) continue;
    counts.set(venue, (counts.get(venue) ?? 0) + 1);
  }
  let best: string | undefined;
  let bestCount = 0;
  for (const [venue, count] of counts) {
    if (count > bestCount) {
      best = venue;
      bestCount = count;
    }
  }
  return best;
}

/** Coach from a lineup we already cached. Does not fetch `/coachs`. */
export function cachedCoach(
  fixtures: Fixture[],
  teamId: string,
  lineupsFor: (fixture: Fixture) => { home: Lineup; away: Lineup },
): string | undefined {
  const recent = fixtures
    .filter((fixture) => fixture.homeTeamId === teamId || fixture.awayTeamId === teamId)
    .sort((a, b) => Date.parse(b.kickoff) - Date.parse(a.kickoff));
  for (const fixture of recent) {
    const pair = lineupsFor(fixture);
    const lineup = fixture.homeTeamId === teamId ? pair.home : pair.away;
    const name = lineup.coach?.trim();
    if (name) return name;
  }
  return undefined;
}

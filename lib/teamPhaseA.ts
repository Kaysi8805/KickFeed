import type { Fixture, FormResult, Lineup, LineupPlayer, Scorer, StandingRow } from '@/data/types';

export interface TeamFormChip {
  fixtureId: string;
  result: FormResult;
  /** This club's goals, then the opponent's. */
  goalsFor: number;
  goalsAgainst: number;
}

export interface SeasonChip {
  label: 'P' | 'W' | 'D' | 'L' | 'GF' | 'GA' | 'Pts';
  value: number;
}

export interface CachedXi {
  fixtureId: string;
  formation: string;
  players: LineupPlayer[];
}

/** Last `limit` finished results, oldest → newest, from fixtures already in hand. */
export function recentTeamForm(fixtures: Fixture[], teamId: string, limit = 5): TeamFormChip[] {
  const finished = fixtures
    .filter((fixture) => fixture.status === 'finished')
    .filter((fixture) => fixture.homeTeamId === teamId || fixture.awayTeamId === teamId)
    .sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff))
    .slice(-limit);
  return finished.map((fixture) => {
    const home = fixture.homeTeamId === teamId;
    const goalsFor = home ? fixture.homeScore : fixture.awayScore;
    const goalsAgainst = home ? fixture.awayScore : fixture.homeScore;
    const result: FormResult = goalsFor > goalsAgainst ? 'W' : goalsFor < goalsAgainst ? 'L' : 'D';
    return { fixtureId: fixture.id, result, goalsFor, goalsAgainst };
  });
}

export function seasonSummary(row: StandingRow | undefined): SeasonChip[] | undefined {
  if (!row) return undefined;
  return [
    { label: 'P', value: row.played },
    { label: 'W', value: row.won },
    { label: 'D', value: row.drawn },
    { label: 'L', value: row.lost },
    { label: 'GF', value: row.gf },
    { label: 'GA', value: row.ga },
    { label: 'Pts', value: row.points },
  ];
}

/** This club's rows on the cached league top-scorer list. Assists only when that list actually has them. */
export function teamChart(scorers: Scorer[], teamIds: readonly string[]): { scorers: Scorer[]; assists: Scorer[] } {
  const ids = new Set(teamIds);
  const mine = scorers.filter((row) => ids.has(row.teamId));
  const byGoals = [...mine].sort((a, b) => b.goals - a.goals || b.assists - a.assists || a.playerName.localeCompare(b.playerName));
  const assists = mine
    .filter((row) => row.assists > 0)
    .sort((a, b) => b.assists - a.assists || b.goals - a.goals || a.playerName.localeCompare(b.playerName));
  return { scorers: byGoals, assists };
}

/**
 * Most recent finished fixture whose cached lineup for this club is non-empty.
 * Empty lineups are a cache miss — do not invent an XI.
 */
export function lastCachedXi(
  fixtures: Fixture[],
  teamId: string,
  lineupsFor: (fixture: Fixture) => { home: Lineup; away: Lineup },
): CachedXi | undefined {
  const recent = fixtures
    .filter((fixture) => fixture.status === 'finished')
    .filter((fixture) => fixture.homeTeamId === teamId || fixture.awayTeamId === teamId)
    .sort((a, b) => Date.parse(b.kickoff) - Date.parse(a.kickoff));
  for (const fixture of recent) {
    const pair = lineupsFor(fixture);
    const lineup = fixture.homeTeamId === teamId ? pair.home : pair.away;
    if (!lineup.players.length) continue;
    return { fixtureId: fixture.id, formation: lineup.formation, players: lineup.players };
  }
  return undefined;
}

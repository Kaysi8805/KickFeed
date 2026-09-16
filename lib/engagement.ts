import type { Fixture, LineupPlayer, MatchStatus, MotmVote, Player, PlayerPosition, ScorePrediction } from '@/data/types';
import { foldName } from '@/data/mocks/players';
import type { FootballProvider } from '@/services/footballTypes';

export const PREDICTION_SCORE_MAX = 9;

export type EngagementCatalog = Pick<FootballProvider, 'getLineups' | 'getSquad' | 'getPlayer'>;

export interface MotmCandidate {
  key: string;
  playerId?: string;
  name: string;
  number: number;
  pos: PlayerPosition;
  teamId: string;
}

export interface PredictionAggregate {
  count: number;
  avgHome: number;
  avgAway: number;
  mostCommon: { homeScore: number; awayScore: number; count: number } | null;
  homeWin: number;
  draw: number;
  awayWin: number;
}

export interface MotmTally {
  key: string;
  playerId?: string;
  playerName: string;
  teamId: string;
  votes: number;
}

export function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(PREDICTION_SCORE_MAX, Math.trunc(value)));
}

/** Score picks stay open only before kickoff while the fixture is still upcoming. */
export function isPredictionOpen(fixture: Pick<Fixture, 'status' | 'kickoff'>, now = Date.now()): boolean {
  if (fixture.status !== 'upcoming') return false;
  const kickoff = Date.parse(fixture.kickoff);
  if (!Number.isFinite(kickoff)) return false;
  return kickoff > now;
}

export function isMotmOpen(status: MatchStatus): boolean {
  return status === 'live' || status === 'ht' || status === 'finished';
}

export function playerKeyFor(playerId: string | undefined, teamId: string, number: number, name: string): string {
  if (playerId) return playerId;
  return `lineup:${teamId}:${number}:${foldName(name)}`;
}

function fromLineupPlayer(player: LineupPlayer, teamId: string): MotmCandidate {
  return {
    key: playerKeyFor(player.playerId, teamId, player.number, player.name),
    playerId: player.playerId,
    name: player.name,
    number: player.number,
    pos: player.pos,
    teamId,
  };
}

function fromPlayer(player: Player): MotmCandidate {
  return {
    key: player.id,
    playerId: player.id,
    name: player.name,
    number: player.number,
    pos: player.pos,
    teamId: player.teamId,
  };
}

function dedupeCandidates(rows: MotmCandidate[]): MotmCandidate[] {
  const seen = new Set<string>();
  const out: MotmCandidate[] = [];
  for (const row of rows) {
    if (seen.has(row.key)) continue;
    seen.add(row.key);
    out.push(row);
  }
  return out;
}

/**
 * MOTM ballot: starting XIs when lineups exist, otherwise both squads.
 * Live England may omit lineups on the free tier — squads fill that gap after `ensureSquad`.
 */
export function motmCandidates(provider: EngagementCatalog, fixture: Fixture): MotmCandidate[] {
  const lineups = provider.getLineups(fixture);
  const fromXi = [
    ...lineups.home.players.map((p) => fromLineupPlayer(p, fixture.homeTeamId)),
    ...lineups.away.players.map((p) => fromLineupPlayer(p, fixture.awayTeamId)),
  ];
  if (fromXi.length > 0) return dedupeCandidates(fromXi);

  return dedupeCandidates([
    ...provider.getSquad(fixture.homeTeamId).map(fromPlayer),
    ...provider.getSquad(fixture.awayTeamId).map(fromPlayer),
  ]);
}

export function rowsForMatch<T extends { matchId: string }>(rows: T[], relatedMatchIds: string[]): T[] {
  const related = new Set(relatedMatchIds);
  return rows.filter((row) => related.has(row.matchId));
}

export function predictionForUser(
  predictions: ScorePrediction[],
  userId: string | undefined,
  relatedMatchIds: string[],
): ScorePrediction | undefined {
  if (!userId) return undefined;
  return rowsForMatch(predictions, relatedMatchIds).find((row) => row.userId === userId);
}

export function motmVoteForUser(
  votes: MotmVote[],
  userId: string | undefined,
  relatedMatchIds: string[],
): MotmVote | undefined {
  if (!userId) return undefined;
  return rowsForMatch(votes, relatedMatchIds).find((row) => row.userId === userId);
}

export function aggregatePredictions(predictions: ScorePrediction[]): PredictionAggregate {
  const count = predictions.length;
  if (!count) {
    return { count: 0, avgHome: 0, avgAway: 0, mostCommon: null, homeWin: 0, draw: 0, awayWin: 0 };
  }
  let homeSum = 0;
  let awaySum = 0;
  let homeWin = 0;
  let draw = 0;
  let awayWin = 0;
  const exact = new Map<string, { homeScore: number; awayScore: number; count: number }>();
  for (const row of predictions) {
    homeSum += row.homeScore;
    awaySum += row.awayScore;
    if (row.homeScore > row.awayScore) homeWin += 1;
    else if (row.homeScore < row.awayScore) awayWin += 1;
    else draw += 1;
    const key = `${row.homeScore}-${row.awayScore}`;
    const cur = exact.get(key) ?? { homeScore: row.homeScore, awayScore: row.awayScore, count: 0 };
    cur.count += 1;
    exact.set(key, cur);
  }
  let mostCommon: PredictionAggregate['mostCommon'] = null;
  for (const row of exact.values()) {
    if (!mostCommon || row.count > mostCommon.count) mostCommon = row;
  }
  return {
    count,
    avgHome: Math.round((homeSum / count) * 10) / 10,
    avgAway: Math.round((awaySum / count) * 10) / 10,
    mostCommon,
    homeWin,
    draw,
    awayWin,
  };
}

export function tallyMotmVotes(votes: MotmVote[]): MotmTally[] {
  const map = new Map<string, MotmTally>();
  for (const vote of votes) {
    const cur = map.get(vote.playerKey) ?? {
      key: vote.playerKey,
      playerId: vote.playerId,
      playerName: vote.playerName,
      teamId: vote.teamId,
      votes: 0,
    };
    cur.votes += 1;
    if (!cur.playerId && vote.playerId) cur.playerId = vote.playerId;
    map.set(vote.playerKey, cur);
  }
  return [...map.values()].sort((a, b) => b.votes - a.votes || a.playerName.localeCompare(b.playerName));
}

export function scoreline(home: number, away: number): string {
  return `${home}–${away}`;
}

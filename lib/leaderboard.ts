import type { Fixture, MotmVote, ScorePrediction, User } from '@/data/types';
import { predictionForUser, rowsForMatch, tallyMotmVotes } from '@/lib/engagement';
import { userFromProfile, type AuthMode } from '@/lib/userIdentity';

export const LEADERBOARD_TOP_N = 10;

export const LEADERBOARD_TIEBREAK_COPY =
  'Tie-break: exacts, then results, then MOTM, then matches, then handle.';

/** Exact scoreline after full time. */
export const POINTS_EXACT = 5;
/** Correct home / draw / away, wrong score. */
export const POINTS_RESULT = 2;
/** Voted for the unique community MOTM on a finished match. */
export const POINTS_MOTM = 2;

export type LeaderboardSource = 'demo' | 'live';

export interface ScoredMatch {
  id: string;
  leagueId: string;
  relatedIds: string[];
  homeScore: number;
  awayScore: number;
}

export interface LeaderboardRow {
  userId: string;
  rank: number;
  points: number;
  exactCount: number;
  resultCount: number;
  motmCount: number;
  scoredMatches: number;
  name: string;
  handle: string;
  initials: string;
  avatarColor: string;
  isCurrentUser: boolean;
}

export interface LeaderboardBoard {
  source: LeaderboardSource;
  leagueId: string | null;
  top: LeaderboardRow[];
  current: LeaderboardRow | null;
  totalRanked: number;
  topN: number;
}

export function leaderboardSource(
  supabaseConfigured: boolean,
  authMode: AuthMode | null,
): LeaderboardSource {
  return supabaseConfigured && authMode === 'supabase' ? 'live' : 'demo';
}

/** Live board only for a real session. Demo ids stay on the local fallback. */
export function shouldPersistLeaderboard(
  supabaseConfigured: boolean,
  authMode: AuthMode | null,
): boolean {
  return leaderboardSource(supabaseConfigured, authMode) === 'live';
}

export function outcome(homeScore: number, awayScore: number): -1 | 0 | 1 {
  if (homeScore > awayScore) return 1;
  if (homeScore < awayScore) return -1;
  return 0;
}

export function scorePredictionPoints(
  pick: Pick<ScorePrediction, 'homeScore' | 'awayScore'>,
  result: Pick<ScoredMatch, 'homeScore' | 'awayScore'>,
): { points: number; exact: boolean; resultHit: boolean } {
  if (pick.homeScore === result.homeScore && pick.awayScore === result.awayScore) {
    return { points: POINTS_EXACT, exact: true, resultHit: true };
  }
  if (outcome(pick.homeScore, pick.awayScore) === outcome(result.homeScore, result.awayScore)) {
    return { points: POINTS_RESULT, exact: false, resultHit: true };
  }
  return { points: 0, exact: false, resultHit: false };
}

/** Unique community MOTM key, or null when there are no votes / a tie for first. */
export function uniqueMotmWinner(votes: MotmVote[]): string | null {
  const tallies = tallyMotmVotes(votes);
  const lead = tallies[0];
  if (!lead) return null;
  const second = tallies[1];
  if (second && second.votes === lead.votes) return null;
  return lead.key;
}

/**
 * Collapse finished catalog fixtures so a mock id and its live England alias score once.
 */
export function finishedMatches(
  fixtures: Fixture[],
  relatedIdsFor: (id: string) => string[],
): ScoredMatch[] {
  const claimed = new Set<string>();
  const out: ScoredMatch[] = [];
  for (const fixture of fixtures) {
    if (fixture.status !== 'finished') continue;
    if (claimed.has(fixture.id)) continue;
    const related = uniqueIds([fixture.id, ...relatedIdsFor(fixture.id)]);
    if (related.some((id) => claimed.has(id) && id !== fixture.id)) {
      for (const id of related) claimed.add(id);
      continue;
    }
    for (const id of related) claimed.add(id);
    out.push({
      id: fixture.id,
      leagueId: fixture.leagueId,
      relatedIds: related,
      homeScore: fixture.homeScore,
      awayScore: fixture.awayScore,
    });
  }
  return out;
}

export function filterMatchesByLeague(
  matches: ScoredMatch[],
  leagueId: string | undefined,
  relatedLeagueIds: string[] = [],
): ScoredMatch[] {
  if (!leagueId) return matches;
  const allowed = new Set([leagueId, ...relatedLeagueIds]);
  return matches.filter((match) => allowed.has(match.leagueId));
}

export function rankLeaderboard(opts: {
  predictions: ScorePrediction[];
  motmVotes: MotmVote[];
  matches: ScoredMatch[];
  users: User[];
  currentUserId?: string;
  topN?: number;
  includeMotm?: boolean;
  source?: LeaderboardSource;
  leagueId?: string | null;
}): LeaderboardBoard {
  const topN = opts.topN ?? LEADERBOARD_TOP_N;
  const includeMotm = opts.includeMotm !== false;
  const byId = new Map<string, Acc>();

  for (const match of opts.matches) {
    const matchPredictions = rowsForMatch(opts.predictions, match.relatedIds);
    const matchVotes = rowsForMatch(opts.motmVotes, match.relatedIds);
    const motmKey = includeMotm ? uniqueMotmWinner(matchVotes) : null;
    const seen = new Set<string>();

    for (const row of matchPredictions) {
      if (seen.has(row.userId)) continue;
      seen.add(row.userId);
      const pick = predictionForUser(matchPredictions, row.userId, match.relatedIds);
      if (!pick) continue;
      const scored = scorePredictionPoints(pick, match);
      const acc = accFor(byId, row.userId);
      acc.points += scored.points;
      acc.scoredMatches += 1;
      if (scored.exact) acc.exactCount += 1;
      else if (scored.resultHit) acc.resultCount += 1;
    }

    if (motmKey) {
      const motmSeen = new Set<string>();
      for (const vote of matchVotes) {
        if (motmSeen.has(vote.userId)) continue;
        motmSeen.add(vote.userId);
        if (vote.playerKey !== motmKey) continue;
        const acc = accFor(byId, vote.userId);
        acc.points += POINTS_MOTM;
        acc.motmCount += 1;
      }
    }
  }

  const usersById = new Map(opts.users.map((user) => [user.id, user]));
  const ranked = [...byId.entries()]
    .map(([userId, acc]) => {
      const user = usersById.get(userId) ?? userFromProfile(userId, undefined);
      return {
        userId,
        rank: 0,
        points: acc.points,
        exactCount: acc.exactCount,
        resultCount: acc.resultCount,
        motmCount: acc.motmCount,
        scoredMatches: acc.scoredMatches,
        name: user.name,
        handle: user.handle,
        initials: user.initials,
        avatarColor: user.avatarColor,
        isCurrentUser: userId === opts.currentUserId,
      } satisfies LeaderboardRow;
    })
    .filter((row) => row.points > 0 || row.scoredMatches > 0)
    .sort(compareRows);

  ranked.forEach((row, index) => {
    row.rank = index + 1;
  });

  return {
    source: opts.source ?? 'demo',
    leagueId: opts.leagueId ?? null,
    top: ranked.slice(0, topN),
    current: opts.currentUserId ? (ranked.find((row) => row.userId === opts.currentUserId) ?? null) : null,
    totalRanked: ranked.length,
    topN,
  };
}

export function breakdownLine(row: Pick<LeaderboardRow, 'exactCount' | 'resultCount' | 'motmCount' | 'scoredMatches'>): string {
  const bits = [`${row.scoredMatches} ${row.scoredMatches === 1 ? 'match' : 'matches'}`];
  if (row.exactCount) bits.push(`${row.exactCount} exact`);
  if (row.resultCount) bits.push(`${row.resultCount} result`);
  if (row.motmCount) bits.push(`${row.motmCount} MOTM`);
  return bits.join(' · ');
}

interface Acc {
  points: number;
  exactCount: number;
  resultCount: number;
  motmCount: number;
  scoredMatches: number;
}

function accFor(map: Map<string, Acc>, userId: string): Acc {
  const cur = map.get(userId);
  if (cur) return cur;
  const next: Acc = { points: 0, exactCount: 0, resultCount: 0, motmCount: 0, scoredMatches: 0 };
  map.set(userId, next);
  return next;
}

function compareRows(a: LeaderboardRow, b: LeaderboardRow): number {
  return (
    b.points - a.points ||
    b.exactCount - a.exactCount ||
    b.resultCount - a.resultCount ||
    b.motmCount - a.motmCount ||
    b.scoredMatches - a.scoredMatches ||
    a.handle.localeCompare(b.handle) ||
    a.userId.localeCompare(b.userId)
  );
}

function uniqueIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

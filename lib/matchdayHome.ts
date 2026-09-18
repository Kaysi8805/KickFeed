/**
 * Matchday Home picker: one prominent fixture when kickoff is soon, live, or just finished.
 *
 * Prefers clubs/players the user already follows, then favorite leagues, then a featured
 * live-coverage match (England / Niké Liga / La Liga). Reads the existing catalog only —
 * no extra polling beyond FootballProvider TTLs + the UI live tick.
 */

import type { Fixture } from '@/data/types';
import { MATCHDAY_FEATURED_LEAGUE_PRIORITY } from '@/lib/footballCoverage';
import { fixtureTouchesFavorites, type MatchCatalog } from '@/lib/matchSocial';

export const MATCHDAY_KICKOFF_SOON_MS = 90 * 60_000;
/** Align with the mock FT clock (90 + 3 HT + 5 stoppage). */
export const MATCHDAY_MATCH_LENGTH_MS = 98 * 60_000;
export const MATCHDAY_JUST_FINISHED_MS = 90 * 60_000;
export const MATCHDAY_ALSO_LIMIT = 4;

export type MatchdayCatalog = MatchCatalog;

export type MatchdayPhase = 'live' | 'soon' | 'finished';

export type MatchdayCare = 'club' | 'league' | 'featured';

export type MatchdayWhy =
  | 'favorite-live'
  | 'favorite-soon'
  | 'favorite-finished'
  | 'league-live'
  | 'league-soon'
  | 'league-finished'
  | 'featured-live'
  | 'featured-soon'
  | 'featured-finished';

export interface MatchdayPick {
  fixture: Fixture;
  why: MatchdayWhy;
  care: MatchdayCare;
  phase: MatchdayPhase;
}

export interface MatchdayHome {
  hero?: MatchdayPick;
  also: MatchdayPick[];
  hasFavorites: boolean;
}

export interface MatchdayHomeInput {
  teamIds: string[];
  leagueIds: string[];
  playerIds?: string[];
  now?: number;
}

const CARE_RANK: Record<MatchdayCare, number> = { club: 0, league: 1, featured: 2 };
const PHASE_RANK: Record<MatchdayPhase, number> = { live: 0, soon: 1, finished: 2 };

/** Scheduled KO − 90m through typical full-time + 90m. Shared by soon + finished. */
const MATCHDAY_HORIZON_AFTER_KO_MS = MATCHDAY_MATCH_LENGTH_MS + MATCHDAY_JUST_FINISHED_MS;

export function matchdayPhase(fixture: Fixture, now = Date.now()): MatchdayPhase | null {
  if (fixture.status === 'live' || fixture.status === 'ht') return 'live';
  const kickoff = Date.parse(fixture.kickoff);
  if (!Number.isFinite(kickoff)) return null;
  const elapsed = now - kickoff;
  // One clock window so a delayed kickoff (upcoming, elapsed > 0) does not fall
  // through the gap between "soon" (previously elapsed <= 0) and live/FT.
  if (elapsed < -MATCHDAY_KICKOFF_SOON_MS || elapsed > MATCHDAY_HORIZON_AFTER_KO_MS) return null;
  if (fixture.status === 'upcoming') return 'soon';
  if (fixture.status === 'finished' && elapsed >= 0) return 'finished';
  return null;
}

export function matchdayWhyLabel(why: MatchdayWhy): string {
  switch (why) {
    case 'favorite-live':
      return 'Your club · live';
    case 'favorite-soon':
      return 'Your club · kickoff soon';
    case 'favorite-finished':
      return 'Your club · full time';
    case 'league-live':
      return 'Your league · live';
    case 'league-soon':
      return 'Your league · kickoff soon';
    case 'league-finished':
      return 'Your league · full time';
    case 'featured-live':
      return 'Featured · live';
    case 'featured-soon':
      return 'Featured · kickoff soon';
    case 'featured-finished':
      return 'Featured · full time';
  }
}

export function matchdayWhy(care: MatchdayCare, phase: MatchdayPhase): MatchdayWhy {
  if (care === 'club') {
    if (phase === 'live') return 'favorite-live';
    if (phase === 'soon') return 'favorite-soon';
    return 'favorite-finished';
  }
  if (care === 'league') {
    if (phase === 'live') return 'league-live';
    if (phase === 'soon') return 'league-soon';
    return 'league-finished';
  }
  if (phase === 'live') return 'featured-live';
  if (phase === 'soon') return 'featured-soon';
  return 'featured-finished';
}

function leagueIdSet(provider: MatchdayCatalog, id: string): Set<string> {
  return new Set([id, ...provider.relatedIds('league', id)]);
}

export function fixtureTouchesFavoriteLeagues(
  provider: MatchdayCatalog,
  fixture: Fixture,
  leagueIds: string[],
): boolean {
  if (!leagueIds.length) return false;
  const fx = leagueIdSet(provider, fixture.leagueId);
  for (const id of leagueIds) {
    for (const rel of leagueIdSet(provider, id)) {
      if (fx.has(rel)) return true;
    }
  }
  return false;
}

export function featuredLeaguePriority(provider: MatchdayCatalog, fixture: Fixture): number {
  const fx = leagueIdSet(provider, fixture.leagueId);
  return MATCHDAY_FEATURED_LEAGUE_PRIORITY.findIndex((group) => group.some((id) => fx.has(id)));
}

function fixtureCare(
  provider: MatchdayCatalog,
  fixture: Fixture,
  teamIds: string[],
  leagueIds: string[],
  playerIds: string[],
): MatchdayCare | null {
  if (fixtureTouchesFavorites(provider, fixture, teamIds, playerIds)) return 'club';
  if (fixtureTouchesFavoriteLeagues(provider, fixture, leagueIds)) return 'league';
  if (featuredLeaguePriority(provider, fixture) >= 0) return 'featured';
  return null;
}

function comparePicks(provider: MatchdayCatalog, a: MatchdayPick, b: MatchdayPick): number {
  const care = CARE_RANK[a.care] - CARE_RANK[b.care];
  if (care !== 0) return care;
  const phase = PHASE_RANK[a.phase] - PHASE_RANK[b.phase];
  if (phase !== 0) return phase;
  const ap = featuredLeaguePriority(provider, a.fixture);
  const bp = featuredLeaguePriority(provider, b.fixture);
  const left = ap < 0 ? 99 : ap;
  const right = bp < 0 ? 99 : bp;
  if (left !== right) return left - right;
  if (a.phase === 'soon') {
    return Date.parse(a.fixture.kickoff) - Date.parse(b.fixture.kickoff);
  }
  if (a.phase === 'finished') {
    return Date.parse(b.fixture.kickoff) - Date.parse(a.fixture.kickoff);
  }
  const goals =
    b.fixture.homeScore + b.fixture.awayScore - (a.fixture.homeScore + a.fixture.awayScore);
  if (goals !== 0) return goals;
  return Date.parse(a.fixture.kickoff) - Date.parse(b.fixture.kickoff);
}

export function fixtureHasTeams(provider: MatchdayCatalog, fixture: Fixture): boolean {
  return Boolean(provider.getTeam(fixture.homeTeamId) && provider.getTeam(fixture.awayTeamId));
}

function collectPicks(
  provider: MatchdayCatalog,
  input: MatchdayHomeInput,
  allowFeatured: boolean,
): MatchdayPick[] {
  const now = input.now ?? Date.now();
  const teamIds = input.teamIds;
  const leagueIds = input.leagueIds;
  const playerIds = input.playerIds ?? [];
  const out: MatchdayPick[] = [];
  for (const fixture of provider.getFixtures()) {
    if (!fixtureHasTeams(provider, fixture)) continue;
    const phase = matchdayPhase(fixture, now);
    if (!phase) continue;
    const care = fixtureCare(provider, fixture, teamIds, leagueIds, playerIds);
    if (!care) continue;
    if (care === 'featured' && !allowFeatured) continue;
    out.push({ fixture, care, phase, why: matchdayWhy(care, phase) });
  }
  out.sort((a, b) => comparePicks(provider, a, b));
  return out;
}

/**
 * One hero + a short supporting list.
 * Favorite club/league windows win; featured England / Niké Liga / La Liga only fill the gap.
 */
export function pickMatchdayHome(provider: MatchdayCatalog, input: MatchdayHomeInput): MatchdayHome {
  const hasFavorites =
    input.teamIds.length > 0 || input.leagueIds.length > 0 || (input.playerIds?.length ?? 0) > 0;
  const favorites = collectPicks(provider, input, false);
  const picks = favorites.length ? favorites : collectPicks(provider, input, true);
  const hero = picks[0];
  const also = picks.slice(1, 1 + MATCHDAY_ALSO_LIMIT);
  return { hero, also, hasFavorites };
}

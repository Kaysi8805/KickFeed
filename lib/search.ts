import type { League, Player, Team, User } from '@/data/types';
import { namedPlayers, foldName } from '@/data/mocks/players';
import { football } from '@/services/football';

const PER_GROUP = 8;
const NAMED_IDS = new Set(namedPlayers().map((p) => p.id));

export interface SearchResults {
  teams: Team[];
  players: Player[];
  leagues: League[];
  users: User[];
}

export function emptySearchResults(): SearchResults {
  return { teams: [], players: [], leagues: [], users: [] };
}

export function searchHasHits(results: SearchResults): boolean {
  return (
    results.teams.length > 0 ||
    results.players.length > 0 ||
    results.leagues.length > 0 ||
    results.users.length > 0
  );
}

function rank(text: string, needle: string): number {
  const hay = foldName(text);
  if (!hay || !needle) return 0;
  if (hay === needle) return 100;
  if (hay.startsWith(needle)) return 80;
  if (hay.split(' ').some((word) => word.startsWith(needle))) return 70;
  if (hay.includes(needle)) return 40;
  return 0;
}

function best(...scores: number[]): number {
  return Math.max(0, ...scores);
}

function topHits<T>(rows: { item: T; score: number }[], limit = PER_GROUP): T[] {
  return rows
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((row) => row.item);
}

/**
 * Query teams, players, competitions, and demo fans.
 * Needle is folded (accents stripped) so “Nunez” still hits Núñez.
 */
export function searchEntities(query: string, users: User[]): SearchResults {
  const needle = foldName(query);
  if (needle.length < 2) return emptySearchResults();

  const teams = topHits(
    football.getTeams().map((team) => ({
      item: team,
      score: best(rank(team.name, needle), rank(team.shortName, needle), rank(team.code, needle)),
    })),
  );

  const players = topHits(
    football.getPlayers().map((player) => {
      let score = best(rank(player.name, needle), rank(player.shortName, needle));
      if (score > 0 && NAMED_IDS.has(player.id)) score += 8;
      return { item: player, score };
    }),
  );

  const leagues = topHits(
    football.getLeagues().map((league) => {
      const country = football.getCountry(league.countryId);
      return {
        item: league,
        score: best(rank(league.name, needle), rank(league.shortName, needle), rank(country?.name ?? '', needle)),
      };
    }),
  );

  const userHits = topHits(
    users.map((user) => ({
      item: user,
      score: best(rank(user.name, needle), rank(user.handle, needle), rank(user.bio, needle) >= 70 ? 35 : rank(user.bio, needle) ? 15 : 0),
    })),
  );

  return { teams, players, leagues, users: userHits };
}

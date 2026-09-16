import type { Comment, Fixture, Post, User } from '@/data/types';
import { isSameDay } from '@/lib/format';
import type { FootballProvider } from '@/services/footballTypes';

export interface MatchAlertDraft {
  type: 'goal' | 'kickoff';
  recipientId: string;
  matchId: string;
  title: string;
  body: string;
  relatedMatchIds?: string[];
}

export type MatchCatalog = Pick<
  FootballProvider,
  'getFixture' | 'getFixtures' | 'getTeam' | 'getPlayer' | 'relatedIds' | 'getStatus'
>;

function teamIdSet(provider: MatchCatalog, id: string): Set<string> {
  return new Set(provider.relatedIds('team', id));
}

export function sameTeamPair(provider: MatchCatalog, a: Fixture, b: Fixture): boolean {
  const home = teamIdSet(provider, a.homeTeamId);
  const away = teamIdSet(provider, a.awayTeamId);
  return (
    (home.has(b.homeTeamId) || provider.relatedIds('team', b.homeTeamId).some((id) => home.has(id))) &&
    (away.has(b.awayTeamId) || provider.relatedIds('team', b.awayTeamId).some((id) => away.has(id)))
  );
}

function kickoffDistance(a: Fixture, b: Fixture): number {
  return Math.abs(Date.parse(a.kickoff) - Date.parse(b.kickoff));
}

/**
 * Prefer a catalog (live England / mock window) id when a stored mock attachment
 * can be matched by team pair. Never invent ids — unknown values stay as-is.
 */
export function canonicalMatchId(provider: MatchCatalog, storedId: string): string {
  const catalog = provider.getFixtures();
  if (catalog.some((f) => f.id === storedId)) return storedId;
  const stored = provider.getFixture(storedId);
  if (!stored) return storedId;
  const matches = catalog.filter((f) => sameTeamPair(provider, stored, f));
  if (matches.length === 0) return stored.id;
  matches.sort((a, b) => kickoffDistance(a, stored) - kickoffDistance(b, stored));
  return matches[0]!.id;
}

export function relatedFixtureIds(provider: MatchCatalog, id: string): string[] {
  const ids = new Set<string>([id]);
  const stored = provider.getFixture(id);
  if (stored) ids.add(stored.id);
  const canon = canonicalMatchId(provider, id);
  ids.add(canon);
  const fixture = provider.getFixture(canon) ?? stored;
  if (!fixture) return [...ids];
  for (const f of provider.getFixtures()) {
    if (sameTeamPair(provider, fixture, f)) ids.add(f.id);
  }
  if (stored && stored.id !== fixture.id && sameTeamPair(provider, stored, fixture)) {
    ids.add(stored.id);
  }
  return [...ids];
}

export function isSameMatch(provider: MatchCatalog, a: string, b: string): boolean {
  if (a === b) return true;
  return relatedFixtureIds(provider, a).includes(b) || relatedFixtureIds(provider, b).includes(a);
}

/** Id to persist on a new post/comment: live catalog id when keyed, mock id otherwise. */
export function attachMatchId(provider: MatchCatalog, fixtureId: string): string {
  const fixture = provider.getFixture(fixtureId);
  if (!fixture) return fixtureId;
  return canonicalMatchId(provider, fixture.id);
}

export function attachableFixtures(provider: MatchCatalog, now = Date.now(), limit = 24): Fixture[] {
  const day = new Date(now);
  const all = provider.getFixtures();
  const live = all.filter((f) => f.status === 'live' || f.status === 'ht');
  const today = all.filter((f) => isSameDay(f.kickoff, day));
  const upcoming = all.filter((f) => f.status === 'upcoming' && !isSameDay(f.kickoff, day));
  const seen = new Set<string>();
  const out: Fixture[] = [];
  for (const f of [...live, ...today, ...upcoming]) {
    if (seen.has(f.id)) continue;
    seen.add(f.id);
    out.push(f);
    if (out.length >= limit) break;
  }
  return out;
}

export function fixtureScoreLabel(provider: MatchCatalog, fixture: Fixture): string {
  const home = provider.getTeam(fixture.homeTeamId);
  const away = provider.getTeam(fixture.awayTeamId);
  const left = home?.code ?? '?';
  const right = away?.code ?? '?';
  if (fixture.status === 'upcoming') return `${left} vs ${right}`;
  return `${left} ${fixture.homeScore}–${fixture.awayScore} ${right}`;
}

export function fixtureTouchesFavorites(
  provider: MatchCatalog,
  fixture: Fixture,
  teamIds: string[],
  playerIds: string[] = [],
): boolean {
  const followed = new Set<string>();
  for (const id of teamIds) {
    for (const rel of provider.relatedIds('team', id)) followed.add(rel);
  }
  for (const pid of playerIds) {
    const player = provider.getPlayer(pid);
    if (!player) continue;
    for (const rel of provider.relatedIds('team', player.teamId)) followed.add(rel);
  }
  if (!followed.size) return false;
  return (
    followed.has(fixture.homeTeamId) ||
    followed.has(fixture.awayTeamId) ||
    provider.relatedIds('team', fixture.homeTeamId).some((id) => followed.has(id)) ||
    provider.relatedIds('team', fixture.awayTeamId).some((id) => followed.has(id))
  );
}

export function postsForMatch(posts: Post[], matchId: string, provider: MatchCatalog): Post[] {
  const related = new Set(relatedFixtureIds(provider, matchId));
  return posts.filter((p) => p.matchId && (related.has(p.matchId) || isSameMatch(provider, p.matchId, matchId)));
}

export function commentsForMatch(comments: Comment[], matchId: string, provider: MatchCatalog): Comment[] {
  const related = new Set(relatedFixtureIds(provider, matchId));
  return comments.filter((c) => related.has(c.matchId) || isSameMatch(provider, c.matchId, matchId));
}

export function resolvePostFixture(post: Post, provider: MatchCatalog): Fixture | undefined {
  if (!post.matchId) return undefined;
  const canon = canonicalMatchId(provider, post.matchId);
  return provider.getFixture(canon) ?? provider.getFixture(post.matchId);
}

/** Lower ranks surface first. Live favorite-match posts beat generic chatter. */
export function feedPostRank(
  post: Post,
  provider: MatchCatalog,
  teamIds: string[],
  playerIds: string[] = [],
  now = Date.now(),
): number {
  const fixture = resolvePostFixture(post, provider);
  if (!fixture) return post.matchId ? 80 : 100;
  const cares = fixtureTouchesFavorites(provider, fixture, teamIds, playerIds);
  const live = fixture.status === 'live' || fixture.status === 'ht';
  const today = isSameDay(fixture.kickoff, new Date(now));
  if (live && cares) return 0;
  if (live) return 1;
  if (today && cares) return 2;
  if (cares) return 3;
  if (today) return 4;
  return 10;
}

export function sortFeedPosts(
  posts: Post[],
  provider: MatchCatalog,
  teamIds: string[],
  playerIds: string[] = [],
  now = Date.now(),
): Post[] {
  return [...posts].sort((a, b) => {
    const rank = feedPostRank(a, provider, teamIds, playerIds, now) - feedPostRank(b, provider, teamIds, playerIds, now);
    if (rank !== 0) return rank;
    return Date.parse(b.createdAt) - Date.parse(a.createdAt);
  });
}

export function favoriteLiveFixtures(
  provider: MatchCatalog,
  teamIds: string[],
  playerIds: string[] = [],
  limit = 6,
): Fixture[] {
  const live = provider.getFixtures().filter((f) => f.status === 'live' || f.status === 'ht');
  const followedEmpty = teamIds.length === 0 && playerIds.length === 0;
  return live
    .filter((f) => followedEmpty || fixtureTouchesFavorites(provider, f, teamIds, playerIds))
    .slice(0, limit);
}

export function discussionParticipantIds(comments: Comment[], posts: Post[], matchId: string, provider: MatchCatalog): string[] {
  const ids = new Set<string>();
  for (const c of commentsForMatch(comments, matchId, provider)) ids.add(c.authorId);
  for (const p of postsForMatch(posts, matchId, provider)) ids.add(p.authorId);
  return [...ids];
}

export function participantsFromUsers(ids: string[], users: User[]): User[] {
  return ids.map((id) => users.find((u) => u.id === id)).filter((u): u is User => !!u);
}

export function favoriteMatchAlertDrafts(
  favorites: Record<string, { teams: string[]; players?: string[] }>,
  provider: MatchCatalog,
): MatchAlertDraft[] {
  const drafts: MatchAlertDraft[] = [];
  const fixtures = provider.getFixtures().filter((f) => f.status === 'live' || f.status === 'ht');
  for (const [userId, slice] of Object.entries(favorites)) {
    const teams = slice.teams ?? [];
    const players = slice.players ?? [];
    for (const fixture of fixtures) {
      if (!fixtureTouchesFavorites(provider, fixture, teams, players)) continue;
      const related = relatedFixtureIds(provider, fixture.id);
      const label = fixtureScoreLabel(provider, fixture);
      drafts.push({
        type: 'kickoff',
        recipientId: userId,
        matchId: fixture.id,
        relatedMatchIds: related,
        title: `Kickoff — ${label}`,
        body: `${label} is live. Join the match hub.`,
      });
      const goal = [...fixture.events].reverse().find((e) => e.type === 'goal');
      if (goal) {
        const scorerTeam = provider.getTeam(goal.teamId);
        drafts.push({
          type: 'goal',
          recipientId: userId,
          matchId: fixture.id,
          relatedMatchIds: related,
          title: `GOAL — ${label}`,
          body: `${goal.playerName}${scorerTeam ? ` (${scorerTeam.shortName})` : ''} · ${goal.minute}'`,
        });
      }
    }
  }
  return drafts;
}

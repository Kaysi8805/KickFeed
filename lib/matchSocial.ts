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

/** Device + in-app kickoff reminder window (tighter than Matchday Home’s 90m). */
export const FAVORITE_KICKOFF_SOON_MS = 30 * 60_000;
/** Local DATE trigger fires this long before kickoff when the match is further out. */
export const FAVORITE_KICKOFF_LEAD_MS = 15 * 60_000;
/** Do not pre-schedule kickoff reminders beyond this horizon (no extra API polling). */
export const FAVORITE_KICKOFF_SCHEDULE_HORIZON_MS = 6 * 60 * 60_000;
/** Skip “kickoff” banners once the match has been underway this long. */
export const FAVORITE_LIVE_KICKOFF_GRACE_MS = 10 * 60_000;

export function isFavoriteKickoffAlertFixture(fixture: Fixture, now = Date.now()): boolean {
  if (fixture.status === 'live' || fixture.status === 'ht') return true;
  if (fixture.status !== 'upcoming') return false;
  const kickoff = Date.parse(fixture.kickoff);
  if (!Number.isFinite(kickoff)) return false;
  const until = kickoff - now;
  return until <= FAVORITE_KICKOFF_SOON_MS && until >= -FAVORITE_LIVE_KICKOFF_GRACE_MS;
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

/**
 * Deep-link board: map a stored / URL match id onto the active catalog.
 *
 * - exact: id is in getFixtures() (live England window when keyed, mock clock otherwise)
 * - alias: live catalog has exactly one fixture with the same clubs (team aliases).
 *   Used for seed posts still attached to mock ids (`fx-liv-ars`). Unique pair only —
 *   two LIV–ARS rows in the window do not remap (avoids the wrong match).
 * - missing: do not render a mock fixture on the live path (wrong catalog / scores).
 *
 * Hydrate never writes this mapping back to AsyncStorage.
 */
export type MatchDeepLinkVia = 'exact' | 'alias' | 'missing';

export interface MatchDeepLink {
  requestedId: string;
  catalogId: string;
  fixture?: Fixture;
  source: 'live' | 'mock';
  via: MatchDeepLinkVia;
}

export function resolveMatchDeepLink(provider: MatchCatalog, requestedId: string): MatchDeepLink {
  const source = provider.getStatus().source;
  const catalog = provider.getFixtures();
  const exact = catalog.find((f) => f.id === requestedId);
  if (exact) {
    return { requestedId, catalogId: exact.id, fixture: exact, source, via: 'exact' };
  }
  const relatedHits = catalog.filter((f) =>
    provider.relatedIds('match', requestedId).some((id) => id === f.id && id !== requestedId),
  );
  if (relatedHits.length === 1) {
    const hit = relatedHits[0]!;
    return { requestedId, catalogId: hit.id, fixture: hit, source, via: 'alias' };
  }
  if (source !== 'live') {
    const mock = provider.getFixture(requestedId);
    if (mock) {
      return { requestedId, catalogId: mock.id, fixture: mock, source, via: 'exact' };
    }
    return { requestedId, catalogId: requestedId, source, via: 'missing' };
  }
  const stored = provider.getFixture(requestedId);
  if (!stored) {
    return { requestedId, catalogId: requestedId, source, via: 'missing' };
  }
  const candidates = catalog.filter((f) => sameTeamPair(provider, stored, f));
  if (candidates.length === 1) {
    const hit = candidates[0]!;
    return { requestedId, catalogId: hit.id, fixture: hit, source, via: 'alias' };
  }
  return { requestedId, catalogId: requestedId, source, via: 'missing' };
}

/**
 * Prefer a catalog id when a stored mock attachment uniquely aliases.
 * Unknown / ambiguous values stay as-is — never invent ids.
 */
export function canonicalMatchId(provider: MatchCatalog, storedId: string): string {
  return resolveMatchDeepLink(provider, storedId).catalogId;
}

export function relatedFixtureIds(provider: MatchCatalog, id: string): string[] {
  const link = resolveMatchDeepLink(provider, id);
  const ids = new Set<string>([id, link.catalogId]);
  if (link.via === 'alias') ids.add(link.requestedId);
  for (const rel of provider.relatedIds('match', id)) ids.add(rel);
  for (const rel of provider.relatedIds('match', link.catalogId)) ids.add(rel);
  return [...ids];
}

export function isSameMatch(provider: MatchCatalog, a: string, b: string): boolean {
  if (a === b) return true;
  const left = resolveMatchDeepLink(provider, a);
  const right = resolveMatchDeepLink(provider, b);
  if (left.catalogId === right.catalogId) return true;
  if (left.catalogId === b || right.catalogId === a) return true;
  return false;
}

export function attachMatchId(provider: MatchCatalog, fixtureId: string): string {
  const link = resolveMatchDeepLink(provider, fixtureId);
  if (link.via === 'missing') return fixtureId;
  return link.catalogId;
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
  return resolveMatchDeepLink(provider, post.matchId).fixture;
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
  now = Date.now(),
): MatchAlertDraft[] {
  const drafts: MatchAlertDraft[] = [];
  const fixtures = provider.getFixtures().filter((f) => isFavoriteKickoffAlertFixture(f, now));
  for (const [userId, slice] of Object.entries(favorites)) {
    const teams = slice.teams ?? [];
    const players = slice.players ?? [];
    for (const fixture of fixtures) {
      if (!fixtureTouchesFavorites(provider, fixture, teams, players)) continue;
      const related = relatedFixtureIds(provider, fixture.id);
      const label = fixtureScoreLabel(provider, fixture);
      const live = fixture.status === 'live' || fixture.status === 'ht';
      drafts.push({
        type: 'kickoff',
        recipientId: userId,
        matchId: fixture.id,
        relatedMatchIds: related,
        title: live ? `Kickoff — ${label}` : `Kickoff soon — ${label}`,
        body: live ? `${label} is live. Join the match hub.` : 'Starts soon. Open the match hub.',
      });
      if (!live) continue;
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
      } else if (fixture.homeScore + fixture.awayScore > 0) {
        drafts.push({
          type: 'goal',
          recipientId: userId,
          matchId: fixture.id,
          relatedMatchIds: related,
          title: `GOAL — ${label}`,
          body: `${label} · score update`,
        });
      }
    }
  }
  return drafts;
}

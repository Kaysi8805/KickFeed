import type { League, Post, PostAudience, User } from '@/data/types';
import { fixtureTouchesFavorites, resolvePostFixture, type MatchCatalog } from '@/lib/matchSocial';

/** Catalog used by Home ranking — match helpers plus league lookup for reason copy. */
export type HomeCatalog = MatchCatalog & {
  getLeague: (id: string) => League | undefined;
};

/** Soft rank buckets for Home Option 2 (lower = higher on the feed). */
export type HomeFeedBucket = 'friend' | 'favorite_entity' | 'other_followed' | 'buried';

export type HomeReason =
  | { kind: 'friend' }
  | { kind: 'you' }
  | {
      kind: 'follow_entity';
      entityKind: 'team' | 'player';
      entityId: string;
      name: string;
    }
  | { kind: 'league_following'; leagueId: string; name: string }
  | { kind: 'following' };

export interface HomeFeedViewer {
  viewerId: string;
  /**
   * Mutual follows in the local demo graph (you follow them and they follow you).
   * Friends-audience posts are visible to this set. Not a server friend graph.
   */
  friendIds: readonly string[];
  /** Everyone the viewer follows, including one-way follows who are not mutual friends. */
  followedIds: readonly string[];
  favoriteTeamIds: readonly string[];
  favoriteLeagueIds: readonly string[];
  favoritePlayerIds: readonly string[];
}

export interface RankedHomePost {
  post: Post;
  bucket: HomeFeedBucket;
  reason: HomeReason;
  /** Lower sorts first. Live favorite-match posts get a small boost within the same bucket. */
  rank: number;
}

const BUCKET_BASE: Record<HomeFeedBucket, number> = {
  friend: 0,
  favorite_entity: 100,
  other_followed: 200,
  buried: 1000,
};

/**
 * Who should get a `friend_post` alert.
 * Public posts can reach followers (they can see the post).
 * Friends-only posts stay with mutual follows — a one-way follower cannot see them.
 */
export function friendPostRecipientIds(
  authorId: string,
  audience: PostAudience,
  following: Readonly<Record<string, readonly string[]>>,
): string[] {
  const followers = Object.entries(following)
    .filter(([id, ids]) => id !== authorId && ids.includes(authorId))
    .map(([id]) => id);
  if (audience === 'public') return followers;
  const followsBack = new Set(following[authorId] ?? []);
  return followers.filter((id) => followsBack.has(id));
}

/** Effective audience. Seeds without a field stay public so the demo graph still reads. */
export function postAudience(post: Post): PostAudience {
  return post.audience ?? 'public';
}

/**
 * Home / feed visibility for Option 2.
 * Friends-audience posts only surface for the author and people who friend/follow them.
 */
export function isPostVisibleToViewer(
  post: Post,
  viewerId: string,
  friendIds: readonly string[],
): boolean {
  if (post.authorId === viewerId) return true;
  if (postAudience(post) === 'public') return true;
  return friendIds.includes(post.authorId);
}

function relatedSet(provider: HomeCatalog, kind: 'team' | 'player' | 'league', ids: readonly string[]): Set<string> {
  const out = new Set<string>();
  for (const id of ids) {
    for (const rel of provider.relatedIds(kind, id)) out.add(rel);
  }
  return out;
}

function firstFavoriteTeamTouch(
  provider: HomeCatalog,
  post: Post,
  favoriteTeamIds: readonly string[],
  favoritePlayerIds: readonly string[],
): { entityId: string; name: string; via: 'team' | 'player' } | null {
  const favTeams = relatedSet(provider, 'team', favoriteTeamIds);
  const favPlayers = relatedSet(provider, 'player', favoritePlayerIds);

  for (const id of post.taggedTeamIds ?? []) {
    if (![...provider.relatedIds('team', id)].some((rel) => favTeams.has(rel))) continue;
    const team = provider.getTeam(id) ?? [...provider.relatedIds('team', id)].map((rel) => provider.getTeam(rel)).find(Boolean);
    if (team) return { entityId: team.id, name: team.shortName || team.name, via: 'team' };
  }

  for (const id of post.taggedPlayerIds ?? []) {
    if (![...provider.relatedIds('player', id)].some((rel) => favPlayers.has(rel))) continue;
    const player = provider.getPlayer(id);
    if (player) return { entityId: player.id, name: player.shortName || player.name, via: 'player' };
  }

  const fixture = resolvePostFixture(post, provider);
  if (!fixture || !fixtureTouchesFavorites(provider, fixture, [...favoriteTeamIds], [...favoritePlayerIds])) {
    return null;
  }

  for (const teamId of [fixture.homeTeamId, fixture.awayTeamId]) {
    if (favTeams.has(teamId) || provider.relatedIds('team', teamId).some((rel) => favTeams.has(rel))) {
      const team = provider.getTeam(teamId);
      if (team) return { entityId: team.id, name: team.shortName || team.name, via: 'team' };
    }
  }

  for (const pid of favoritePlayerIds) {
    const player = provider.getPlayer(pid);
    if (!player) continue;
    const club = relatedSet(provider, 'team', [player.teamId]);
    for (const teamId of [fixture.homeTeamId, fixture.awayTeamId]) {
      if (club.has(teamId) || provider.relatedIds('team', teamId).some((rel) => club.has(rel))) {
        return { entityId: player.id, name: player.shortName || player.name, via: 'player' };
      }
    }
  }

  return null;
}

function firstFavoriteLeagueTouch(
  provider: HomeCatalog,
  post: Post,
  favoriteLeagueIds: readonly string[],
): { leagueId: string; name: string } | null {
  if (!favoriteLeagueIds.length) return null;
  const favLeagues = relatedSet(provider, 'league', favoriteLeagueIds);

  for (const id of post.taggedLeagueIds ?? []) {
    if (![...provider.relatedIds('league', id)].some((rel) => favLeagues.has(rel))) continue;
    const league = provider.getLeague(id);
    if (league) return { leagueId: league.id, name: league.shortName || league.name };
  }

  const fixture = resolvePostFixture(post, provider);
  if (!fixture) return null;
  if (
    favLeagues.has(fixture.leagueId) ||
    provider.relatedIds('league', fixture.leagueId).some((rel) => favLeagues.has(rel))
  ) {
    const league = provider.getLeague(fixture.leagueId);
    if (league) return { leagueId: league.id, name: league.shortName || league.name };
  }
  return null;
}

export function postTouchesFavoriteEntity(
  provider: HomeCatalog,
  post: Post,
  favoriteTeamIds: readonly string[],
  favoriteLeagueIds: readonly string[],
  favoritePlayerIds: readonly string[],
): boolean {
  return (
    firstFavoriteTeamTouch(provider, post, favoriteTeamIds, favoritePlayerIds) != null ||
    firstFavoriteLeagueTouch(provider, post, favoriteLeagueIds) != null
  );
}

/**
 * Visible “why am I seeing this?” copy.
 * Friend pill wins when the author is friended. Else entity / league follow. Own posts: “Your post”.
 * Never invent FoF / blank “For You.”
 */
export function selectHomeReason(
  provider: HomeCatalog,
  post: Post,
  viewer: HomeFeedViewer,
  bucket?: HomeFeedBucket,
): HomeReason {
  const isSelf = post.authorId === viewer.viewerId;
  const isFriend = !isSelf && (viewer.friendIds.includes(post.authorId) || bucket === 'friend');

  if (isSelf) return { kind: 'you' };
  if (isFriend) return { kind: 'friend' };

  const teamTouch = firstFavoriteTeamTouch(
    provider,
    post,
    viewer.favoriteTeamIds,
    viewer.favoritePlayerIds,
  );
  if (teamTouch) {
    return {
      kind: 'follow_entity',
      entityKind: teamTouch.via,
      entityId: teamTouch.entityId,
      name: teamTouch.name,
    };
  }

  const leagueTouch = firstFavoriteLeagueTouch(provider, post, viewer.favoriteLeagueIds);
  if (leagueTouch) {
    return { kind: 'league_following', leagueId: leagueTouch.leagueId, name: leagueTouch.name };
  }

  if (bucket === 'other_followed' || viewer.followedIds.includes(post.authorId)) {
    return { kind: 'following' };
  }

  return { kind: 'you' };
}

export function homeFeedBucket(
  provider: HomeCatalog,
  post: Post,
  viewer: HomeFeedViewer,
): HomeFeedBucket {
  if (post.authorId === viewer.viewerId || viewer.friendIds.includes(post.authorId)) {
    return 'friend';
  }
  if (
    postTouchesFavoriteEntity(
      provider,
      post,
      viewer.favoriteTeamIds,
      viewer.favoriteLeagueIds,
      viewer.favoritePlayerIds,
    )
  ) {
    return 'favorite_entity';
  }
  if (viewer.followedIds.includes(post.authorId)) return 'other_followed';
  return 'buried';
}

function liveBoost(provider: HomeCatalog, post: Post, viewer: HomeFeedViewer): number {
  const fixture = resolvePostFixture(post, provider);
  if (!fixture) return 0;
  const live = fixture.status === 'live' || fixture.status === 'ht';
  if (!live) return 0;
  const cares = fixtureTouchesFavorites(
    provider,
    fixture,
    [...viewer.favoriteTeamIds],
    [...viewer.favoritePlayerIds],
  );
  // Small within-bucket boost only — never lifts past a higher social bucket.
  return cares ? -2 : -1;
}

export function homeFeedRank(
  provider: HomeCatalog,
  post: Post,
  viewer: HomeFeedViewer,
): number {
  const bucket = homeFeedBucket(provider, post, viewer);
  return BUCKET_BASE[bucket] + liveBoost(provider, post, viewer);
}

/**
 * Soft-order Home posts: friends → favorite-entity → other followed.
 * Buried FoF/global rows are omitted so Home never fills with noise.
 */
export function rankHomeFeed(
  posts: Post[],
  provider: HomeCatalog,
  viewer: HomeFeedViewer,
): RankedHomePost[] {
  const visible = posts.filter((p) => isPostVisibleToViewer(p, viewer.viewerId, viewer.friendIds));
  const ranked: RankedHomePost[] = [];

  for (const post of visible) {
    const bucket = homeFeedBucket(provider, post, viewer);
    if (bucket === 'buried') continue;
    ranked.push({
      post,
      bucket,
      reason: selectHomeReason(provider, post, viewer, bucket),
      rank: homeFeedRank(provider, post, viewer),
    });
  }

  ranked.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    return Date.parse(b.post.createdAt) - Date.parse(a.post.createdAt);
  });
  return ranked;
}

/** True when the personal Home stream has nothing to show (do not dump global). */
export function isHomeFeedCold(ranked: RankedHomePost[]): boolean {
  return ranked.length === 0;
}

export function homeColdCopy(viewer: HomeFeedViewer): { title: string; body: string } {
  const hasFriends = viewer.friendIds.length > 0;
  const hasFavorites =
    viewer.favoriteTeamIds.length > 0 ||
    viewer.favoriteLeagueIds.length > 0 ||
    viewer.favoritePlayerIds.length > 0;
  if (!hasFriends && !hasFavorites) {
    return {
      title: 'Your pitch is quiet',
      body: 'Follow clubs and a few fans so Home fills with people and teams you care about — not the whole planet.',
    };
  }
  if (!hasFriends) {
    return {
      title: 'Your pitch is quiet',
      body: 'Find friends so their posts land here before the rest of the timeline.',
    };
  }
  if (!hasFavorites) {
    return {
      title: 'Your pitch is quiet',
      body: 'Follow clubs, leagues, or players so match chatter about your teams can surface here.',
    };
  }
  return {
    title: 'Your pitch is quiet',
    body: 'No friend or favorite-team posts yet. Stick around — we keep global noise off this pitch.',
  };
}

export function viewerFromApp(opts: {
  currentUser: User;
  friendIds: readonly string[];
  followedIds: readonly string[];
  favoriteTeamIds: readonly string[];
  favoriteLeagueIds: readonly string[];
  favoritePlayerIds: readonly string[];
}): HomeFeedViewer {
  return {
    viewerId: opts.currentUser.id,
    friendIds: opts.friendIds,
    followedIds: opts.followedIds,
    favoriteTeamIds: opts.favoriteTeamIds,
    favoriteLeagueIds: opts.favoriteLeagueIds,
    favoritePlayerIds: opts.favoritePlayerIds,
  };
}

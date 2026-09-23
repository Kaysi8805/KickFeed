import type { Post, SharedPostPayload, User } from '@/data/types';
import { canonicalMatchId, fixtureScoreLabel, resolvePostFixture } from '@/lib/matchSocial';
import { buildSharedPostPayload } from '@/lib/shareToChat';
import { football } from '@/services/football';

/** Card payload for Send in KickFeed. Match id is only set when a real match route exists. */
export function sharedPayloadForPost(post: Post, author: User): SharedPostPayload | null {
  const match = resolvePostFixture(post, football);
  const home = match ? football.getTeam(match.homeTeamId) : undefined;
  const away = match ? football.getTeam(match.awayTeamId) : undefined;
  const matchLabel = match && home && away ? fixtureScoreLabel(football, match) : undefined;
  const matchId = post.matchId ? canonicalMatchId(football, post.matchId) : undefined;
  return buildSharedPostPayload({
    postId: post.id,
    authorId: author.id,
    authorName: author.name,
    authorHandle: author.handle,
    text: post.text,
    matchLabel,
    matchId,
  });
}

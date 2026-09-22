import type { Post } from '@/data/types';
import {
  friendPostRecipientIds,
  homeColdCopy,
  homeFeedBucket,
  homeFeedRank,
  isHomeFeedCold,
  isPostVisibleToViewer,
  postAudience,
  rankHomeFeed,
  selectHomeReason,
  type HomeFeedViewer,
} from '@/lib/homeFeed';
import { mockFootballProvider } from '@/services/football';
import { describe, expect, it } from 'vitest';

function post(partial: Partial<Post> & Pick<Post, 'id' | 'authorId'>): Post {
  return {
    text: 'chat',
    createdAt: '2026-09-16T12:00:00.000Z',
    ...partial,
  };
}

const maya: HomeFeedViewer = {
  viewerId: 'maya',
  friendIds: ['omar', 'luca', 'jordan', 'sophie'],
  followedIds: ['omar', 'luca', 'jordan', 'sophie'],
  favoriteTeamIds: ['ars', 'liv'],
  favoriteLeagueIds: ['epl', 'ucl'],
  favoritePlayerIds: [],
};

describe('postAudience / visibility', () => {
  it('treats missing audience as public for seed back-compat', () => {
    expect(postAudience(post({ id: 'p', authorId: 'diego' }))).toBe('public');
  });

  it('hides friends-only posts from non-friends', () => {
    const friendsOnly = post({ id: 'f', authorId: 'diego', audience: 'friends' });
    expect(isPostVisibleToViewer(friendsOnly, 'maya', maya.friendIds)).toBe(false);
    expect(isPostVisibleToViewer(friendsOnly, 'diego', maya.friendIds)).toBe(true);
    expect(isPostVisibleToViewer(friendsOnly, 'maya', ['diego'])).toBe(true);
  });

  it('keeps public posts visible to anyone', () => {
    const pub = post({ id: 'p', authorId: 'diego', audience: 'public' });
    expect(isPostVisibleToViewer(pub, 'maya', maya.friendIds)).toBe(true);
  });
});

describe('home feed ranking (Option 2)', () => {
  it('orders friends ahead of favorite-entity ahead of buried global', () => {
    const friend = post({
      id: 'friend',
      authorId: 'jordan',
      createdAt: '2026-09-16T10:00:00.000Z',
      text: 'YNWA',
    });
    const favorite = post({
      id: 'fav',
      authorId: 'aisha',
      matchId: 'fx-liv-ars',
      audience: 'public',
      createdAt: '2026-09-16T18:00:00.000Z',
    });
    const global = post({
      id: 'global',
      authorId: 'kenji',
      audience: 'public',
      createdAt: '2026-09-16T19:00:00.000Z',
      text: 'J1 night',
    });

    expect(homeFeedBucket(mockFootballProvider, friend, maya)).toBe('friend');
    expect(homeFeedBucket(mockFootballProvider, favorite, maya)).toBe('favorite_entity');
    expect(homeFeedBucket(mockFootballProvider, global, maya)).toBe('buried');

    const ranked = rankHomeFeed([global, favorite, friend], mockFootballProvider, maya);
    expect(ranked.map((r) => r.post.id)).toEqual(['friend', 'fav']);
    expect(ranked.every((r) => r.bucket !== 'buried')).toBe(true);
    expect(homeFeedRank(mockFootballProvider, friend, maya)).toBeLessThan(
      homeFeedRank(mockFootballProvider, favorite, maya),
    );
  });

  it('keeps a quiet friend ahead of a live favorite-entity post', () => {
    const friend = post({
      id: 'friend-quiet',
      authorId: 'jordan',
      createdAt: '2026-09-01T10:00:00.000Z',
      text: 'quiet',
    });
    const liveEntity = post({
      id: 'live-entity',
      authorId: 'aisha',
      matchId: 'fx-liv-ars',
      audience: 'public',
      createdAt: '2026-09-16T20:00:00.000Z',
    });
    const ranked = rankHomeFeed([liveEntity, friend], mockFootballProvider, maya);
    expect(ranked.map((row) => row.post.id)).toEqual(['friend-quiet', 'live-entity']);
    expect(ranked[0]?.bucket).toBe('friend');
    expect(ranked[1]?.bucket).toBe('favorite_entity');
    expect(homeFeedRank(mockFootballProvider, friend, maya)).toBeLessThan(
      homeFeedRank(mockFootballProvider, liveEntity, maya),
    );
  });

  it('boosts live favorite matches within the same bucket without beating friends', () => {
    const friendPlain = post({
      id: 'friend-plain',
      authorId: 'omar',
      createdAt: '2026-09-16T19:00:00.000Z',
    });
    const friendLiveFav = post({
      id: 'friend-live',
      authorId: 'jordan',
      matchId: 'fx-liv-ars',
      createdAt: '2026-09-16T10:00:00.000Z',
    });
    const ranked = rankHomeFeed([friendPlain, friendLiveFav], mockFootballProvider, maya);
    expect(ranked[0]?.post.id).toBe('friend-live');
    expect(ranked.every((r) => r.bucket === 'friend')).toBe(true);
  });

  it('does not fill Home with global noise when the personal graph is thin', () => {
    const lonely: HomeFeedViewer = {
      viewerId: 'maya',
      friendIds: [],
      followedIds: [],
      favoriteTeamIds: [],
      favoriteLeagueIds: [],
      favoritePlayerIds: [],
    };
    const noise = [
      post({ id: 'g1', authorId: 'kenji', audience: 'public' }),
      post({ id: 'g2', authorId: 'diego', audience: 'public' }),
    ];
    const ranked = rankHomeFeed(noise, mockFootballProvider, lonely);
    expect(ranked).toEqual([]);
    expect(isHomeFeedCold(ranked)).toBe(true);
    expect(homeColdCopy(lonely).title).toBe('Your pitch is quiet');
  });
});

describe('friend_post recipients', () => {
  const following = {
    maya: ['omar', 'luca', 'jordan', 'sophie'],
    omar: ['maya'],
    aisha: ['maya'],
    jordan: ['maya'],
  };

  it('notifies mutual friends of a friends-only post, not one-way followers', () => {
    expect(friendPostRecipientIds('maya', 'friends', following).sort()).toEqual(['jordan', 'omar']);
  });

  it('notifies followers of a public post, including one-way follows', () => {
    expect(friendPostRecipientIds('maya', 'public', following).sort()).toEqual(['aisha', 'jordan', 'omar']);
  });
});

describe('reason labels', () => {
  it('labels friend authors with Friend', () => {
    const friend = post({ id: 'f', authorId: 'jordan', matchId: 'fx-liv-ars' });
    expect(selectHomeReason(mockFootballProvider, friend, maya)).toEqual({ kind: 'friend' });
  });

  it('labels favorite-entity posts with Because you follow {Name}', () => {
    const favorite = post({
      id: 'fav',
      authorId: 'aisha',
      matchId: 'fx-liv-ars',
      audience: 'public',
    });
    const reason = selectHomeReason(mockFootballProvider, favorite, maya, 'favorite_entity');
    expect(reason.kind).toBe('follow_entity');
    if (reason.kind === 'follow_entity') {
      expect(reason.name).toBe('Liverpool');
      expect(reason.entityKind).toBe('team');
    }
  });

  it('labels league-only favorites with {League} · Following', () => {
    const leagueFan: HomeFeedViewer = {
      ...maya,
      friendIds: [],
      followedIds: [],
      favoriteTeamIds: [],
      favoritePlayerIds: [],
      favoriteLeagueIds: ['seriea'],
    };
    const derby = post({
      id: 'serie',
      authorId: 'diego',
      matchId: 'fx-int-mil',
      audience: 'public',
    });
    const reason = selectHomeReason(mockFootballProvider, derby, leagueFan, 'favorite_entity');
    expect(reason).toEqual({ kind: 'league_following', leagueId: 'seriea', name: 'Serie A' });
  });

  it('ranks one-way follows after favorite entities and labels them Following', () => {
    const viewer: HomeFeedViewer = {
      ...maya,
      friendIds: ['jordan'],
      followedIds: ['jordan', 'kenji'],
    };
    const friend = post({ id: 'friend', authorId: 'jordan', text: 'YNWA' });
    const fav = post({
      id: 'fav',
      authorId: 'aisha',
      matchId: 'fx-liv-ars',
      audience: 'public',
      createdAt: '2026-09-16T18:00:00.000Z',
    });
    const followed = post({
      id: 'followed',
      authorId: 'kenji',
      audience: 'public',
      text: 'Clean sheet watch',
      createdAt: '2026-09-16T19:00:00.000Z',
    });
    const ranked = rankHomeFeed([followed, fav, friend], mockFootballProvider, viewer);
    expect(ranked.map((r) => r.post.id)).toEqual(['friend', 'fav', 'followed']);
    expect(ranked[2]?.bucket).toBe('other_followed');
    expect(ranked[2]?.reason).toEqual({ kind: 'following' });
  });

  it('labels own posts without inventing For You', () => {
    const mine = post({ id: 'me', authorId: 'maya', text: 'clearing the calendar' });
    expect(selectHomeReason(mockFootballProvider, mine, maya)).toEqual({ kind: 'you' });
  });
});

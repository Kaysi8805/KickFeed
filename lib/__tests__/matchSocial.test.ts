import type { Post } from '@/data/types';
import {
  attachMatchId,
  attachableFixtures,
  canonicalMatchId,
  commentsForMatch,
  favoriteMatchAlertDrafts,
  feedPostRank,
  postsForMatch,
  relatedFixtureIds,
  resolveMatchDeepLink,
  resolvePostFixture,
  sameTeamPair,
  sortFeedPosts,
} from '@/lib/matchSocial';
import { mockFootballProvider } from '@/services/football';
import { createLiveFootballProvider } from '@/services/footballLive';
import type { ApiFixture, FootballHttp } from '@/services/footballApi';
import { describe, expect, it, vi } from 'vitest';

function post(partial: Partial<Post> & Pick<Post, 'id' | 'matchId'>): Post {
  return {
    authorId: 'maya',
    text: 'chat',
    createdAt: '2026-09-16T12:00:00.000Z',
    ...partial,
  };
}

const livArs: ApiFixture = {
  fixture: {
    id: 9001,
    date: '2026-09-16T19:00:00+00:00',
    venue: { name: 'Anfield', city: 'Liverpool' },
    status: { short: '1H', elapsed: 34 },
  },
  league: { id: 39, name: 'Premier League' },
  teams: {
    home: { id: 40, name: 'Liverpool' },
    away: { id: 42, name: 'Arsenal' },
  },
  goals: { home: 2, away: 1 },
};

function fakeHttp(): FootballHttp {
  return vi.fn(async (path, params) => {
    if (path === '/fixtures') return params?.league === 40 || params?.league === '40' ? [] : [livArs];
    if (path === '/standings') return [];
    if (path === '/players/topscorers') return [];
    return [];
  });
}

describe('attachableFixtures', () => {
  it('lists live and today before later upcoming, from the active provider', () => {
    const list = attachableFixtures(mockFootballProvider);
    expect(list.length).toBeGreaterThan(0);
    const firstLive = list.findIndex((f) => f.status === 'live' || f.status === 'ht');
    const firstUpcomingLater = list.findIndex((f) => f.status === 'upcoming' && f.id !== list[firstLive]?.id);
    expect(firstLive).toBeGreaterThanOrEqual(0);
    if (firstUpcomingLater >= 0) expect(firstLive).toBeLessThan(firstUpcomingLater);
    expect(list.some((f) => f.id === 'fx-liv-ars')).toBe(true);
  });
});

describe('match post helpers (mock ids)', () => {
  it('keeps mock attachments on the mock catalog', () => {
    expect(attachMatchId(mockFootballProvider, 'fx-liv-ars')).toBe('fx-liv-ars');
    expect(canonicalMatchId(mockFootballProvider, 'fx-liv-ars')).toBe('fx-liv-ars');
    expect(relatedFixtureIds(mockFootballProvider, 'fx-liv-ars')).toContain('fx-liv-ars');
    const attached = postsForMatch(
      [post({ id: 'p1', matchId: 'fx-liv-ars' }), post({ id: 'p2', matchId: 'fx-rma-bar' }), post({ id: 'p3', matchId: undefined })],
      'fx-liv-ars',
      mockFootballProvider,
    );
    expect(attached.map((p) => p.id)).toEqual(['p1']);
  });

  it('does not invent ids for unknown attachments', () => {
    expect(canonicalMatchId(mockFootballProvider, 'fx-does-not-exist')).toBe('fx-does-not-exist');
    expect(attachMatchId(mockFootballProvider, 'fx-ghost')).toBe('fx-ghost');
    expect(resolvePostFixture(post({ id: 'px', matchId: 'fx-ghost' }), mockFootballProvider)).toBeUndefined();
  });

  it('ranks live favorite-match posts ahead of unattached chatter', () => {
    const liv = post({ id: 'live', matchId: 'fx-liv-ars', createdAt: '2026-09-16T10:00:00.000Z' });
    const chat = post({ id: 'plain', matchId: undefined, createdAt: '2026-09-16T18:00:00.000Z' });
    expect(feedPostRank(liv, mockFootballProvider, ['liv', 'ars'])).toBeLessThan(
      feedPostRank(chat, mockFootballProvider, ['liv', 'ars']),
    );
    expect(sortFeedPosts([chat, liv], mockFootballProvider, ['liv'])[0]?.id).toBe('live');
  });
});

describe('live catalog id stability', () => {
  it('maps seed mock match ids onto the live England fixture when teams alias', async () => {
    const live = createLiveFootballProvider({
      fallback: mockFootballProvider,
      http: fakeHttp(),
      season: 2026,
      now: () => Date.parse('2026-09-16T12:00:00.000Z'),
    });
    await live.hydrate();
    expect(live.getFixture('9001')?.id).toBe('9001');
    expect(sameTeamPair(live, live.getFixture('fx-liv-ars')!, live.getFixture('9001')!)).toBe(true);
    expect(canonicalMatchId(live, 'fx-liv-ars')).toBe('9001');
    expect(attachMatchId(live, '9001')).toBe('9001');
    expect(relatedFixtureIds(live, 'fx-liv-ars')).toContain('9001');
    const attached = postsForMatch([post({ id: 'p1', matchId: 'fx-liv-ars' })], '9001', live);
    expect(attached).toHaveLength(1);
    expect(commentsForMatch([{ id: 'c1', matchId: 'fx-liv-ars', authorId: 'maya', text: 'x', createdAt: 't' }], '9001', live)).toHaveLength(
      1,
    );
    expect(resolvePostFixture(post({ id: 'p1', matchId: 'fx-liv-ars' }), live)?.id).toBe('9001');
    const link = resolveMatchDeepLink(live, 'fx-liv-ars');
    expect(link.via).toBe('alias');
    expect(link.catalogId).toBe('9001');
    expect(link.source).toBe('live');
    expect(link.fixture?.id).toBe('9001');
  });

  it('does not serve a mock fixture on the live path when the club pair is missing or ambiguous', async () => {
    const second: ApiFixture = {
      ...livArs,
      fixture: { ...livArs.fixture, id: 9002, date: '2026-09-23T19:00:00+00:00' },
    };
    const http: FootballHttp = vi.fn(async (path, params) => {
      if (path === '/fixtures') return params?.league === 40 || params?.league === '40' ? [] : [livArs, second];
      if (path === '/standings') return [];
      if (path === '/players/topscorers') return [];
      return [];
    });
    const live = createLiveFootballProvider({
      fallback: mockFootballProvider,
      http,
      season: 2026,
      now: () => Date.parse('2026-09-16T12:00:00.000Z'),
    });
    await live.hydrate();
    expect(live.getFixture('fx-liv-ars')?.id).toBe('fx-liv-ars');
    const ambiguous = resolveMatchDeepLink(live, 'fx-liv-ars');
    expect(ambiguous.via).toBe('missing');
    expect(ambiguous.fixture).toBeUndefined();
    expect(ambiguous.catalogId).toBe('fx-liv-ars');
    expect(resolvePostFixture(post({ id: 'p1', matchId: 'fx-liv-ars' }), live)).toBeUndefined();

    const ghost = resolveMatchDeepLink(live, 'fx-rma-bar');
    expect(ghost.via).toBe('missing');
    expect(ghost.fixture).toBeUndefined();
  });

  it('builds goal-style drafts on live ids for users who favorite those clubs', async () => {
    const live = createLiveFootballProvider({
      fallback: mockFootballProvider,
      http: fakeHttp(),
      season: 2026,
      now: () => Date.parse('2026-09-16T12:00:00.000Z'),
    });
    await live.hydrate();
    const drafts = favoriteMatchAlertDrafts({ maya: { teams: ['ars', 'liv'], players: [] } }, live);
    expect(drafts.some((d) => d.type === 'kickoff' && d.matchId === '9001' && d.recipientId === 'maya')).toBe(true);
    expect(drafts.every((d) => d.matchId !== 'fx-liv-ars')).toBe(true);
  });
});

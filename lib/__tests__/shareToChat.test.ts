import { describe, expect, it } from 'vitest';

import { buildSharedPostPayload, parseSharedPost, sharedPostBody } from '@/lib/shareToChat';

describe('buildSharedPostPayload', () => {
  it('keeps author, snippet, and match label without a url', () => {
    const payload = buildSharedPostPayload({
      postId: 'p2',
      authorId: 'maya',
      authorName: 'Maya Chen',
      authorHandle: '@mayagoals',
      text: 'Arsenal look a yard off in midfield tonight. Need a reset at half. Still believe.',
      matchLabel: 'LIV 1–1 ARS',
      matchId: 'fx-liv-ars',
    });
    expect(payload).toMatchObject({
      postId: 'p2',
      authorId: 'maya',
      authorHandle: 'mayagoals',
      matchLabel: 'LIV 1–1 ARS',
      matchId: 'fx-liv-ars',
    });
    expect(payload?.snippet).toContain('Arsenal look a yard off');
    expect(payload && 'url' in payload).toBe(false);
    const body = payload ? sharedPostBody(payload) : '';
    expect(body).toContain('Maya Chen (@mayagoals) on KickFeed:');
    expect(body).toContain('Match: LIV 1–1 ARS');
    expect(body).not.toMatch(/https?:\/\//);
    expect(body).not.toMatch(/kickfeed:\/\//);
  });

  it('drops payloads that smuggle a link or a bad author', () => {
    expect(
      parseSharedPost({
        postId: 'p2',
        authorId: 'maya',
        authorName: 'Maya Chen',
        authorHandle: 'mayagoals',
        snippet: 'Still believe.',
        url: 'https://example.com/post/p2',
      }),
    ).toBeNull();
    expect(
      buildSharedPostPayload({
        postId: 'p2',
        authorId: 'ghost',
        authorName: 'Ghost',
        authorHandle: 'ghost',
        text: 'Nope',
      }),
    ).toBeNull();
    expect(
      buildSharedPostPayload({
        postId: 'p2',
        authorId: 'maya',
        authorName: 'Maya Chen',
        authorHandle: 'mayagoals',
        text: '   ',
      }),
    ).toBeNull();
  });
});

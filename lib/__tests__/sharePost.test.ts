import { describe, expect, it } from 'vitest';

import { buildPostShareMessage, snippetPostText } from '@/lib/sharePost';

describe('snippetPostText', () => {
  it('returns short text unchanged', () => {
    expect(snippetPostText('Still believe.')).toBe('Still believe.');
  });

  it('collapses whitespace and truncates long copy on a word boundary', () => {
    const long = 'Arsenal look a yard off in midfield tonight. '.repeat(8);
    const out = snippetPostText(long, 60);
    expect(out.endsWith('…')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(60);
    expect(out).not.toMatch(/\s…$/);
  });
});

describe('buildPostShareMessage', () => {
  it('builds author + snippet without inventing a link', () => {
    const message = buildPostShareMessage({
      authorName: 'Maya Goals',
      authorHandle: 'mayagoals',
      text: 'Arsenal look a yard off in midfield tonight. Need a reset at half. Still believe.',
      matchLabel: 'LIV 1–1 ARS',
    });
    expect(message).toContain('Maya Goals (@mayagoals) on KickFeed:');
    expect(message).toContain('Arsenal look a yard off');
    expect(message).toContain('Match: LIV 1–1 ARS');
    expect(message).not.toMatch(/https?:\/\//);
    expect(message).not.toMatch(/kickfeed:\/\//);
  });

  it('strips a leading @ on the handle and omits empty match labels', () => {
    const message = buildPostShareMessage({
      authorName: 'Maya Goals',
      authorHandle: '@mayagoals',
      text: 'UCL midweek is the best night of the week.',
      matchLabel: '   ',
    });
    expect(message).toContain('(@mayagoals)');
    expect(message).not.toContain('Match:');
  });

  it('appends only an explicit shareable url', () => {
    const message = buildPostShareMessage({
      authorName: 'Maya Goals',
      authorHandle: 'mayagoals',
      text: 'Still believe.',
      url: 'https://example.com/post/p2',
    });
    expect(message.endsWith('https://example.com/post/p2')).toBe(true);
  });
});

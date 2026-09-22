import { crestBadgeMode, leagueMarkA11y, teamCrestA11y } from '@/lib/crestBadge';
import { describe, expect, it } from 'vitest';

describe('crest badge fallback', () => {
  it('shows the image only while a URL has not failed', () => {
    expect(crestBadgeMode('https://media.api-sports.io/football/teams/40.png', false)).toBe('image');
  });

  it('falls back to the code chip when the image fails to load', () => {
    expect(crestBadgeMode('https://media.api-sports.io/football/teams/40.png', true)).toBe('fallback');
  });

  it('falls back when there is no URL', () => {
    expect(crestBadgeMode(undefined, false)).toBe('fallback');
    expect(crestBadgeMode('', false)).toBe('fallback');
  });
});

describe('crest accessibility', () => {
  it('names team and league badges as images', () => {
    expect(teamCrestA11y('Liverpool')).toEqual({ role: 'image', label: 'Liverpool crest' });
    expect(leagueMarkA11y('Premier League')).toEqual({ role: 'image', label: 'Premier League logo' });
  });
});

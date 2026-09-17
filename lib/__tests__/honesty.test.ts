import {
  CATALOG_ERROR_BODY,
  CATALOG_ERROR_TITLE,
  LIVE_MIX_DISCLAIMER,
  TV_EDITORIAL_DISCLAIMER,
  matchesEmptyBody,
} from '@/lib/honesty';
import { describe, expect, it } from 'vitest';

describe('honesty copy', () => {
  it('names the live/mock mix without sounding like a full worldwide live product', () => {
    expect(LIVE_MIX_DISCLAIMER).toMatch(/England live/i);
    expect(LIVE_MIX_DISCLAIMER).toMatch(/mock/i);
  });

  it('marks TV as editorial, not a licensed FotMob-style guide', () => {
    expect(TV_EDITORIAL_DISCLAIMER).toMatch(/editorial/i);
    expect(TV_EDITORIAL_DISCLAIMER).toMatch(/not a licensed/i);
    expect(TV_EDITORIAL_DISCLAIMER).toMatch(/FotMob/i);
  });

  it('keeps Matches empty-body copy aligned with the active filter', () => {
    expect(matchesEmptyBody('live', 'mock')).toMatch(/^Flip to Today or Upcoming/);
    expect(matchesEmptyBody('today', 'live')).toMatch(/^Flip to Live or Upcoming/);
    expect(matchesEmptyBody('upcoming', 'mock')).toMatch(/^Flip to Live or Today/);
    expect(matchesEmptyBody('today', 'mock')).not.toMatch(/Flip to Today/);
  });

  it('does not glue a raw upstream error into the catalog retry sentence', () => {
    expect(CATALOG_ERROR_TITLE).toBe('Couldn’t load England scores');
    expect(CATALOG_ERROR_BODY).not.toMatch(/%s|\$\{/);
    expect(CATALOG_ERROR_BODY.toLowerCase()).not.toContain('invalid api key');
  });
});

import { describe, expect, it } from 'vitest';

import {
  CATALOG_ERROR_BODY,
  CATALOG_ERROR_TITLE,
  LIVE_MIX_DISCLAIMER,
  MODERATION_DEMO_COPY,
  MODERATION_LIVE_COPY,
  TV_EDITORIAL_DISCLAIMER,
  matchesEmptyBody,
  matchdayEmptyBody,
  moderationDisclaimer,
} from '@/lib/honesty';

describe('honesty copy', () => {
  it('names the live/mock mix without sounding like a full worldwide live product', () => {
    expect(LIVE_MIX_DISCLAIMER).toMatch(/England/i);
    expect(LIVE_MIX_DISCLAIMER).toMatch(/Slovakia/i);
    expect(LIVE_MIX_DISCLAIMER).toMatch(/La Liga/i);
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
    expect(matchesEmptyBody('live', 'live')).toMatch(/Slovakia/);
  });

  it('keeps matchday empty copy honest about live coverage vs mock', () => {
    expect(matchdayEmptyBody(false, 'live')).toMatch(/England/);
    expect(matchdayEmptyBody(false, 'live')).toMatch(/Star clubs/);
    expect(matchdayEmptyBody(true, 'mock')).toMatch(/Feed is one tap away/);
    expect(matchdayEmptyBody(true, 'live')).toMatch(/mock/);
  });

  it('does not glue a raw upstream error into the catalog retry sentence', () => {
    expect(CATALOG_ERROR_TITLE).toBe('Couldn’t load live scores');
    expect(CATALOG_ERROR_BODY).not.toMatch(/%s|\$\{/);
    expect(CATALOG_ERROR_BODY.toLowerCase()).not.toContain('invalid api key');
  });

  it('keeps report/block copy honest about demo device vs Postgres', () => {
    expect(moderationDisclaimer(false)).toBe(MODERATION_DEMO_COPY);
    expect(moderationDisclaimer(true)).toBe(MODERATION_LIVE_COPY);
    expect(MODERATION_DEMO_COPY).toMatch(/this device/i);
    expect(MODERATION_LIVE_COPY).toMatch(/Postgres/i);
    expect(MODERATION_LIVE_COPY).toMatch(/no public moderation inbox/i);
  });
});

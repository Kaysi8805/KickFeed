import { describe, expect, it } from 'vitest';

import {
  CATALOG_ERROR_BODY,
  CATALOG_ERROR_TITLE,
  DEMO_DENSIFY_BANNER,
  FAN_PICKS_NOT_GAMBLING,
  STATS_UNAVAILABLE_BODY,
  STATS_UNAVAILABLE_TITLE,
  LINEUPS_CACHE_MISS_BODY,
  LINEUPS_CACHE_MISS_TITLE,
  LIVE_MIX_DISCLAIMER,
  DM_DEMO_COPY,
  DM_LIVE_COPY,
  MODERATION_DEMO_COPY,
  MODERATION_LIVE_COPY,
  TV_EDITORIAL_DISCLAIMER,
  dmDisclaimer,
  matchesDayCaption,
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

  it('keeps Matches empty-body copy on the selected day', () => {
    expect(matchesEmptyBody('today', 'mock')).toMatch(/yesterday or tomorrow/i);
    expect(matchesEmptyBody('today', 'mock')).not.toMatch(/Flip to/);
    expect(matchesEmptyBody('yesterday', 'mock')).toMatch(/this day/i);
    expect(matchesEmptyBody('tomorrow', 'live')).toMatch(/Slovakia/);
    expect(matchesEmptyBody('other', 'live')).toMatch(/this day/i);
    expect(matchesEmptyBody('today', 'live')).toMatch(/other leagues stay mock/i);
  });

  it('names the selected Matches day without calling mock scores live', () => {
    const now = new Date(2026, 8, 16, 12, 0, 0);
    expect(matchesDayCaption('2026-09-16', 'mock', now)).toBe('Today · Wednesday 16 September · worldwide (mock)');
    expect(matchesDayCaption('2026-09-15', 'live', now)).toBe('Yesterday · Tuesday 15 September');
    expect(matchesDayCaption('2026-09-17', 'mock', now)).toMatch(/^Tomorrow · /);
    expect(matchesDayCaption('2026-09-17', 'live', now)).not.toMatch(/worldwide/i);
    expect(matchesDayCaption('2026-09-16', 'live', now)).not.toMatch(/Last 5 days/);
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

  it('keeps DM copy honest about demo device vs Postgres, including groups', () => {
    expect(dmDisclaimer(false)).toBe(DM_DEMO_COPY);
    expect(dmDisclaimer(true)).toBe(DM_LIVE_COPY);
    expect(DM_DEMO_COPY).toMatch(/this device/i);
    expect(DM_LIVE_COPY).toMatch(/Postgres/i);
    expect(DM_LIVE_COPY).toMatch(/group/i);
    expect(DM_DEMO_COPY).toMatch(/Slack/i);
  });

  it('tells the truth when a lineup sheet is not cached yet', () => {
    expect(LINEUPS_CACHE_MISS_TITLE).toMatch(/60–90 min before kickoff/);
    expect(LINEUPS_CACHE_MISS_BODY).toMatch(/will not invent a lineup/i);
  });

  it('says predictions and MOTM are not gambling', () => {
    expect(FAN_PICKS_NOT_GAMBLING).toMatch(/not a betting or gambling product/i);
    expect(FAN_PICKS_NOT_GAMBLING).toMatch(/no stakes/i);
    expect(FAN_PICKS_NOT_GAMBLING).toMatch(/Man of the Match/);
  });

  it('does not invent possession when stats are missing', () => {
    expect(STATS_UNAVAILABLE_TITLE).toMatch(/possession/i);
    expect(STATS_UNAVAILABLE_BODY).toMatch(/does not invent/i);
    expect(STATS_UNAVAILABLE_BODY).not.toMatch(/placeholder|TODO/i);
  });

  it('marks Overview densify as demo, not live free-tier', () => {
    expect(DEMO_DENSIFY_BANNER).toMatch(/demo densify/i);
    expect(DEMO_DENSIFY_BANNER).toMatch(/not live free-tier/i);
  });
});

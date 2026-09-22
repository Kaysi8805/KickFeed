/** User-facing disclaimers so live/mock mix and editorial TV are obvious in demos. */

import { LIVE_GEO_LABEL, LIVE_GEO_SHORT } from '@/lib/footballCoverage';

export const LIVE_MIX_DISCLAIMER = `${LIVE_GEO_SHORT} live · other leagues mock`;

export const TV_EDITORIAL_DISCLAIMER =
  'Editorial TV listings — not a licensed FotMob-style guide.';

export const CATALOG_ERROR_TITLE = 'Couldn’t load live scores';

export const CATALOG_ERROR_BODY =
  'Live fixtures didn’t load. Retry from here, or check the other match windows if anything is already cached.';

export const CATALOG_LOADING_NOTE = `Loading ${LIVE_GEO_LABEL}…`;

export const LIVE_COUNTRY_EMPTY =
  `Live scores cover ${LIVE_GEO_SHORT}. Other countries stay on the mock tree.`;

export const LIVE_LEAGUE_UNKNOWN =
  'Live scores cover Premier League, Championship, Niké Liga, and La Liga. Other competitions stay mock.';

/** Shown when a free-tier response is missing. Never pair this with a grid of invented zeros. */
export const FREE_TIER_CACHE_MISS = 'Not in free-tier cache yet';

export const LIVE_RANKING_ERROR_TITLE = 'Couldn’t load KickFeed ranking';

export const LIVE_RANKING_ERROR_BODY =
  'Synced picks didn’t load. Retry from here — this is the live table, not the seeded demo board.';

export const MODERATION_LIVE_COPY =
  'Reports and blocks sync to KickFeed Postgres for this email account. There is no public moderation inbox in the app.';

export const MODERATION_DEMO_COPY =
  'Reports and blocks stay on this device in demo mode. Email sign-in stores them in KickFeed Postgres.';

export const CHAT_SLOW_MODE_HINT =
  'Slow mode — 20s between messages so match chat stays readable.';

export const DM_SLOW_MODE_HINT =
  'Slow mode — 20s between messages so DMs stay readable.';

export const DM_LIVE_COPY =
  '1:1 DMs sync to KickFeed Postgres for this email account. Text only — not a group inbox. Blocks hide the thread.';

export const DM_DEMO_COPY =
  'Direct messages stay on this device in demo mode. Email sign-in stores 1:1 chats in KickFeed Postgres. Not a Slack-style workspace.';

export const DM_BLOCKED_COPY =
  'You can’t message this fan. KickFeed hides threads when either of you has blocked the other.';

export const DM_INBOX_EMPTY_TITLE = 'No messages yet';

export const DM_INBOX_EMPTY_BODY =
  'Open a fan profile or search results and tap Message. 1:1 text only — no group chats.';

export function dmDisclaimer(live: boolean): string {
  return live ? DM_LIVE_COPY : DM_DEMO_COPY;
}

export const BLOCKED_PROFILE_TITLE = 'You’ve blocked this fan';

export const BLOCKED_PROFILE_BODY =
  'Their posts, match-chat messages, and DMs are hidden on this account. Unblock to see them again — KickFeed is not a full moderation dashboard.';

export const BLOCKED_LIST_EMPTY_TITLE = 'No blocked fans';

export const BLOCKED_LIST_EMPTY_BODY =
  'Block from a post, profile, or match-chat message. Their content is hidden here as far as this account can see.';

export function moderationDisclaimer(live: boolean): string {
  return live ? MODERATION_LIVE_COPY : MODERATION_DEMO_COPY;
}

export function rankingDisclaimer(
  source: 'demo' | 'live',
  supabaseConfigured: boolean,
  catalogSource: 'live' | 'mock',
): string {
  if (source === 'live') {
    return catalogSource === 'live'
      ? `Live ranking — KickFeed Postgres. Finished scores follow the catalog (${LIVE_MIX_DISCLAIMER}).`
      : 'Live ranking — KickFeed Postgres. Finished scores follow the mock catalog until a football key is set.';
  }
  if (supabaseConfigured) {
    return 'Demo ranking — this device and seeded fans. Email sign-in syncs your picks to the live KickFeed table.';
  }
  return 'Demo ranking — this device and seeded fans. Not a live KickFeed table.';
}

export type MatchWindowFilter = 'live' | 'today' | 'upcoming';

export const MATCHDAY_EMPTY_TITLE = 'Quiet matchday';

export const MATCHDAY_EMPTY_NO_FAVORITES_TITLE = 'Pick a club for matchday';

export function matchdayEmptyBody(hasFavorites: boolean, source: 'live' | 'mock'): string {
  if (!hasFavorites) {
    return source === 'live'
      ? `Star clubs or leagues you follow. Until then, Home features a live ${LIVE_GEO_SHORT} match when one is on.`
      : 'Star clubs or leagues you follow. Until then, Home features a live mock match from England, Niké Liga, or La Liga when one is on.';
  }
  return source === 'live'
    ? `Nothing kicking off soon, live, or just finished for your clubs and leagues. Live coverage is ${LIVE_GEO_SHORT} — other competitions stay mock.`
    : 'Nothing kicking off soon, live, or just finished for your clubs and leagues. Feed is one tap away.';
}

export function matchesEmptyBody(
  filter: MatchWindowFilter,
  source: 'live' | 'mock',
): string {
  const flip =
    filter === 'live'
      ? 'Flip to Today or Upcoming'
      : filter === 'today'
        ? 'Flip to Live or Upcoming'
        : 'Flip to Live or Today';
  if (source === 'live') {
    return `${flip} — live fixtures for ${LIVE_GEO_SHORT} land here when the API has them.`;
  }
  return `${flip} — the mock clock always has fixtures around now.`;
}

/** User-facing disclaimers so live/mock mix and editorial TV are obvious in demos. */

import { LIVE_GEO_LABEL, LIVE_GEO_SHORT } from '@/lib/footballCoverage';
import { matchDayHeading, type MatchDayRelation } from '@/lib/matchesWindow';

export const LIVE_MIX_DISCLAIMER = `${LIVE_GEO_SHORT} live · other leagues mock`;

/** Shared by Predict, MOTM, the leaderboard, Terms, and Privacy. */
export const FAN_PICKS_NOT_GAMBLING =
  'Score picks and Man of the Match votes are fan opinions for a leaderboard. KickFeed is not a betting or gambling product. There are no stakes and no payouts.';

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

export const LINEUPS_LOADING_TITLE = 'Loading lineups';

export const LINEUPS_LOADING_BODY = 'Checking the free-tier cache for this fixture.';

/** Shown when `/fixtures/lineups` has no starting XI yet. Do not pair this with a guessed XI. */
export const LINEUPS_CACHE_MISS_TITLE = 'Lineups usually ~60–90 min before kickoff';

export const LINEUPS_CACHE_MISS_BODY =
  'Nothing is in the free-tier cache for this match yet. KickFeed will not invent a lineup.';

export const LINEUPS_ERROR_TITLE = 'Couldn’t load lineups';

export const LINEUPS_ERROR_BODY =
  'The free-tier lineup request failed. Score and events are unchanged — this tab will not invent an XI.';

export const STATS_UNAVAILABLE_TITLE = 'No possession or shot stats';

export const STATS_UNAVAILABLE_BODY =
  'KickFeed does not invent possession, shots, or expected goals. The score, events, and lineups are the match record when the free tier has them.';

export const MATCH_SECTION_ERROR_TITLE = 'This section did not load';

export const MATCH_SECTION_ERROR_BODY =
  'The scoreboard is still here. Switch tabs or leave and come back to try again.';

export const TV_UNAVAILABLE_TITLE = 'TV listing unavailable';

export const TV_UNAVAILABLE_BODY =
  'Editorial listings did not load for this match. The score is unchanged.';

export const ALERTS_UNAVAILABLE_TITLE = 'Match alerts unavailable';

export const ALERTS_UNAVAILABLE_BODY =
  'The in-app notification center still works. Leave Profile and come back to try alerts again.';

/**
 * Overview densify for aliased coverage clubs after a live miss.
 * Prefer live `/teams/statistics`, standings, scorers, and fixtures whenever they exist.
 */
export const DEMO_DENSIFY_BANNER =
  'Demo densify — not live free-tier. Live stats replace this when the cache fills.';

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
  '1:1 and group chats sync to KickFeed Postgres for this email account. Text and shared posts. Blocks stop new members and shares.';

export const DM_DEMO_COPY =
  'Direct and group messages stay on this device in demo mode. Email sign-in stores them in KickFeed Postgres. Not a Slack-style workspace.';

export const DM_BLOCKED_COPY =
  'You can’t message this fan. KickFeed hides threads when either of you has blocked the other.';

export const DM_INBOX_EMPTY_TITLE = 'No messages yet';

export const DM_INBOX_EMPTY_BODY =
  'Message a friend from their profile, or start a group. Share a post from Home into that chat.';

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

/** Selected day on Matches. Mock keeps the worldwide disclaimer; live does not claim other leagues. */
export function matchesDayCaption(dayIso: string, source: 'live' | 'mock', now = new Date()): string {
  const heading = matchDayHeading(dayIso, now);
  return source === 'live' ? heading : `${heading} · worldwide (mock)`;
}

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

export function matchesEmptyBody(relation: MatchDayRelation, source: 'live' | 'mock'): string {
  if (source === 'live') {
    return relation === 'today'
      ? `No fixtures for ${LIVE_GEO_SHORT} on this day. Pick another day — other leagues stay mock.`
      : `Nothing on this day. Live fixtures for ${LIVE_GEO_SHORT} show here when the API has them.`;
  }
  return relation === 'today'
    ? 'The mock clock has no fixtures on this calendar day. Pick yesterday or tomorrow in the strip.'
    : 'No mock fixtures kick off on this day. Pick another day — scores stay whatever the catalog already has.';
}

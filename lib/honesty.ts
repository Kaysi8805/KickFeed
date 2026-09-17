/** User-facing disclaimers so live/mock mix and editorial TV are obvious in demos. */

export const LIVE_MIX_DISCLAIMER = 'England live · other leagues mock';

export const TV_EDITORIAL_DISCLAIMER =
  'Editorial TV listings — not a licensed FotMob-style guide.';

export const CATALOG_ERROR_TITLE = 'Couldn’t load England scores';

export const CATALOG_ERROR_BODY =
  'Live fixtures didn’t load. Retry from here, or check the other match windows if anything is already cached.';

export const LIVE_RANKING_ERROR_TITLE = 'Couldn’t load KickFeed ranking';

export const LIVE_RANKING_ERROR_BODY =
  'Synced picks didn’t load. Retry from here — this is the live table, not the seeded demo board.';

export function rankingDisclaimer(
  source: 'demo' | 'live',
  supabaseConfigured: boolean,
  catalogSource: 'live' | 'mock',
): string {
  if (source === 'live') {
    return catalogSource === 'live'
      ? 'Live ranking — KickFeed Postgres. Finished scores follow the catalog (England live · other leagues mock).'
      : 'Live ranking — KickFeed Postgres. Finished scores follow the mock catalog until a football key is set.';
  }
  if (supabaseConfigured) {
    return 'Demo ranking — this device and seeded fans. Email sign-in syncs your picks to the live KickFeed table.';
  }
  return 'Demo ranking — this device and seeded fans. Not a live KickFeed table.';
}

export type MatchWindowFilter = 'live' | 'today' | 'upcoming';

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
    return `${flip} — live England fixtures land here when the API has them.`;
  }
  return `${flip} — the mock clock always has fixtures around now.`;
}

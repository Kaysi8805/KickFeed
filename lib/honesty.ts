/** User-facing disclaimers so live/mock mix and editorial TV are obvious in demos. */

export const LIVE_MIX_DISCLAIMER = 'England live · other leagues mock';

export const TV_EDITORIAL_DISCLAIMER =
  'Editorial TV listings — not a licensed FotMob-style guide.';

export const CATALOG_ERROR_TITLE = 'Couldn’t load England scores';

export const CATALOG_ERROR_BODY =
  'Live fixtures didn’t load. Retry from here, or check the other match windows if anything is already cached.';

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

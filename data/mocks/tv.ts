import type { TvChannel, TvCountry } from '@/data/types';

/** v1 launch geos — append here to extend (listings + UI follow this list). */
export const tvCountries: TvCountry[] = [
  {
    id: 'gbr',
    name: 'United Kingdom',
    shortName: 'UK',
    flag: '🇬🇧',
    timeZone: 'Europe/London',
    localeRegions: ['GB', 'UK'],
    timeZones: ['Europe/London', 'Europe/Belfast', 'Europe/Guernsey', 'Europe/Isle_of_Man', 'Europe/Jersey'],
  },
  {
    id: 'svk',
    name: 'Slovakia',
    shortName: 'SK',
    flag: '🇸🇰',
    timeZone: 'Europe/Bratislava',
    localeRegions: ['SK'],
    timeZones: ['Europe/Bratislava'],
  },
  {
    id: 'usa',
    name: 'United States',
    shortName: 'US',
    flag: '🇺🇸',
    timeZone: 'America/New_York',
    localeRegions: ['US'],
    timeZones: [
      'America/New_York',
      'America/Chicago',
      'America/Denver',
      'America/Los_Angeles',
      'America/Phoenix',
      'America/Anchorage',
      'Pacific/Honolulu',
    ],
  },
];

export const DEFAULT_TV_COUNTRY_ID = 'svk';

export const tvChannels: TvChannel[] = [
  { id: 'sky-me', name: 'Sky Sports Main Event', shortName: 'Sky ME', kind: 'tv' },
  { id: 'sky-pl', name: 'Sky Sports Premier League', shortName: 'Sky PL', kind: 'tv' },
  { id: 'sky-football', name: 'Sky Sports Football', shortName: 'Sky Football', kind: 'tv' },
  { id: 'tnt-1', name: 'TNT Sports 1', shortName: 'TNT 1', kind: 'tv' },
  { id: 'now', name: 'NOW', shortName: 'NOW', kind: 'streaming' },
  { id: 'discovery', name: 'discovery+', shortName: 'discovery+', kind: 'streaming' },
  { id: 'bbc-highlights', name: 'BBC iPlayer (highlights)', shortName: 'BBC', kind: 'streaming' },
  { id: 'premier-sport-1', name: 'Premier Sport 1', shortName: 'Premier Sport 1', kind: 'tv' },
  { id: 'premier-sport-2', name: 'Premier Sport 2', shortName: 'Premier Sport 2', kind: 'tv' },
  { id: 'voyo', name: 'Voyo', shortName: 'Voyo', kind: 'streaming' },
  { id: 'nbc', name: 'NBC', shortName: 'NBC', kind: 'tv' },
  { id: 'usa-net', name: 'USA Network', shortName: 'USA', kind: 'tv' },
  { id: 'peacock', name: 'Peacock', shortName: 'Peacock', kind: 'streaming' },
  { id: 'cbs-sn', name: 'CBS Sports Network', shortName: 'CBSSN', kind: 'tv' },
  { id: 'paramount', name: 'Paramount+', shortName: 'Paramount+', kind: 'streaming' },
];

/**
 * Editorial mock rows — not a licensed rights schedule.
 * Prefer `matchId` (mock fixture id) + club pair so live England ids alias via relatedIds.
 * `leagueId` rows are fallbacks for any PL / Championship fixture without a specific listing.
 */
export interface SeedTvListing {
  id: string;
  countryId: string;
  channelIds: string[];
  matchId?: string;
  homeTeamId?: string;
  awayTeamId?: string;
  leagueId?: string;
  note?: string;
}

function row(
  id: string,
  countryId: string,
  channelIds: string[],
  extra: Omit<SeedTvListing, 'id' | 'countryId' | 'channelIds'> = {},
): SeedTvListing {
  return { id, countryId, channelIds, ...extra };
}

/** Featured England fixtures get distinctive packages per geo. */
const featured: SeedTvListing[] = [
  row('liv-ars-gbr', 'gbr', ['sky-me', 'sky-pl', 'now'], {
    matchId: 'fx-liv-ars',
    homeTeamId: 'liv',
    awayTeamId: 'ars',
  }),
  row('liv-ars-svk', 'svk', ['premier-sport-1', 'voyo'], {
    matchId: 'fx-liv-ars',
    homeTeamId: 'liv',
    awayTeamId: 'ars',
  }),
  row('liv-ars-usa', 'usa', ['usa-net', 'peacock'], {
    matchId: 'fx-liv-ars',
    homeTeamId: 'liv',
    awayTeamId: 'ars',
  }),
  row('mci-che-gbr', 'gbr', ['tnt-1', 'discovery'], {
    matchId: 'fx-mci-che',
    homeTeamId: 'mci',
    awayTeamId: 'che',
  }),
  row('mci-che-svk', 'svk', ['premier-sport-2', 'voyo'], {
    matchId: 'fx-mci-che',
    homeTeamId: 'mci',
    awayTeamId: 'che',
  }),
  row('mci-che-usa', 'usa', ['nbc', 'peacock'], {
    matchId: 'fx-mci-che',
    homeTeamId: 'mci',
    awayTeamId: 'che',
  }),
  row('new-tot-gbr', 'gbr', ['sky-pl', 'now'], {
    matchId: 'fx-new-tot',
    homeTeamId: 'new',
    awayTeamId: 'tot',
  }),
  row('new-tot-svk', 'svk', ['premier-sport-1'], {
    matchId: 'fx-new-tot',
    homeTeamId: 'new',
    awayTeamId: 'tot',
  }),
  row('new-tot-usa', 'usa', ['peacock'], {
    matchId: 'fx-new-tot',
    homeTeamId: 'new',
    awayTeamId: 'tot',
  }),
  row('bha-mun-gbr', 'gbr', ['sky-me', 'now'], {
    matchId: 'fx-bha-mun',
    homeTeamId: 'bha',
    awayTeamId: 'mun',
  }),
  row('bha-mun-svk', 'svk', ['premier-sport-1', 'voyo'], {
    matchId: 'fx-bha-mun',
    homeTeamId: 'bha',
    awayTeamId: 'mun',
  }),
  row('bha-mun-usa', 'usa', ['usa-net', 'peacock'], {
    matchId: 'fx-bha-mun',
    homeTeamId: 'bha',
    awayTeamId: 'mun',
  }),
  row('avl-whu-gbr', 'gbr', ['tnt-1', 'discovery'], {
    matchId: 'fx-avl-whu',
    homeTeamId: 'avl',
    awayTeamId: 'whu',
  }),
  row('avl-whu-svk', 'svk', ['voyo'], {
    matchId: 'fx-avl-whu',
    homeTeamId: 'avl',
    awayTeamId: 'whu',
  }),
  row('avl-whu-usa', 'usa', ['peacock'], {
    matchId: 'fx-avl-whu',
    homeTeamId: 'avl',
    awayTeamId: 'whu',
  }),
  row('ful-eve-gbr', 'gbr', ['sky-pl', 'bbc-highlights'], {
    matchId: 'fx-ful-eve',
    homeTeamId: 'ful',
    awayTeamId: 'eve',
    note: 'BBC highlights after full time',
  }),
  row('ful-eve-svk', 'svk', ['premier-sport-2'], {
    matchId: 'fx-ful-eve',
    homeTeamId: 'ful',
    awayTeamId: 'eve',
  }),
  row('ful-eve-usa', 'usa', ['peacock'], {
    matchId: 'fx-ful-eve',
    homeTeamId: 'ful',
    awayTeamId: 'eve',
    note: 'Peacock replay window',
  }),
];

const leagueFallback: SeedTvListing[] = [
  row('fb-gbr-epl', 'gbr', ['sky-pl', 'now'], { leagueId: 'epl' }),
  row('fb-svk-epl', 'svk', ['premier-sport-1'], { leagueId: 'epl' }),
  row('fb-usa-epl', 'usa', ['peacock'], { leagueId: 'epl' }),
  row('fb-gbr-elc', 'gbr', ['sky-football', 'now'], { leagueId: 'elc' }),
  row('fb-svk-elc', 'svk', ['premier-sport-2'], { leagueId: 'elc' }),
  row('fb-usa-elc', 'usa', ['paramount', 'cbs-sn'], { leagueId: 'elc' }),
];

export const seedTvListings: SeedTvListing[] = [...featured, ...leagueFallback];

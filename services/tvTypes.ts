import type { Fixture, TvAiring, TvChannel, TvCountry, TvCountryBroadcasts, TvScheduleEntry } from '@/data/types';
import type { MatchCatalog } from '@/lib/matchSocial';

/**
 * Broadcast listings by match and by country.
 * v1 is editorial/mock. Swap this interface for a licensed TV feed later —
 * do not scrape FotMob, Flashscore, or broadcaster sites.
 */
export interface TvProvider {
  getCountries(): TvCountry[];
  getCountry(id: string): TvCountry | undefined;
  getChannels(): TvChannel[];
  getChannel(id: string): TvChannel | undefined;
  /** Channels airing this match. Omit countryId to get every launch geo with listings. */
  getBroadcastsByMatch(matchId: string, countryId?: string): TvCountryBroadcasts[];
  /** Today / upcoming kickoffs in a launch geo, with channel chips. */
  getListingsByCountry(
    countryId: string,
    opts?: { window?: 'today' | 'upcoming'; now?: number },
  ): TvScheduleEntry[];
}

export type TvLookupCatalog = MatchCatalog;

export interface ResolvedAirings {
  fixture: Fixture;
  airings: TvAiring[];
  via: 'match' | 'pair' | 'league' | 'none';
}

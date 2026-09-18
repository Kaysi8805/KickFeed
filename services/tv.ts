import type { Fixture, TvAiring, TvChannel, TvCountryBroadcasts, TvScheduleEntry } from '@/data/types';
import { seedTvListings, tvChannels, tvCountries, type SeedTvListing } from '@/data/mocks/tv';
import { isSameMatch, resolveMatchDeepLink } from '@/lib/matchSocial';
import { isSameCalendarDay } from '@/lib/tvCountry';
import { canonicalLeagueId, isLiveEnglandLeague } from '@/services/footballMap';
import { football } from '@/services/football';
import type { ResolvedAirings, TvLookupCatalog, TvProvider } from '@/services/tvTypes';

const channelMap = new Map(tvChannels.map((c) => [c.id, c]));
const countryMap = new Map(tvCountries.map((c) => [c.id, c]));

export function getTvChannel(id: string): TvChannel | undefined {
  return channelMap.get(id);
}

function teamIdSet(catalog: TvLookupCatalog, id: string): Set<string> {
  return new Set(catalog.relatedIds('team', id));
}

function setsOverlap(a: Set<string>, b: Set<string>): boolean {
  for (const id of a) {
    if (b.has(id)) return true;
  }
  return false;
}

export function sameClubPair(catalog: TvLookupCatalog, listing: SeedTvListing, fixture: Fixture): boolean {
  if (!listing.homeTeamId || !listing.awayTeamId) return false;
  return (
    setsOverlap(teamIdSet(catalog, listing.homeTeamId), teamIdSet(catalog, fixture.homeTeamId)) &&
    setsOverlap(teamIdSet(catalog, listing.awayTeamId), teamIdSet(catalog, fixture.awayTeamId))
  );
}

export function sameEnglandLeague(listingLeagueId: string, fixtureLeagueId: string): boolean {
  const left = canonicalLeagueId(listingLeagueId) ?? listingLeagueId;
  const right = canonicalLeagueId(fixtureLeagueId) ?? fixtureLeagueId;
  return left === right;
}

export function isEnglandCompetition(leagueId: string): boolean {
  return isLiveEnglandLeague(leagueId);
}

function airingsFrom(listing: SeedTvListing): TvAiring[] {
  const out: TvAiring[] = [];
  const seen = new Set<string>();
  for (const id of listing.channelIds) {
    const channel = channelMap.get(id);
    if (!channel || seen.has(channel.id)) continue;
    seen.add(channel.id);
    out.push({ channel, note: listing.note });
  }
  return out;
}

function mergeAirings(rows: SeedTvListing[]): TvAiring[] {
  const out: TvAiring[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    for (const air of airingsFrom(row)) {
      if (seen.has(air.channel.id)) continue;
      seen.add(air.channel.id);
      out.push(air);
    }
  }
  return out;
}

/**
 * Resolve editorial listings onto a catalog fixture (mock id or live England id).
 * Priority: exact/aliased matchId → club pair → PL/Championship league fallback.
 */
export function resolveAiringsForFixture(
  catalog: TvLookupCatalog,
  fixture: Fixture,
  countryId: string,
  listings: SeedTvListing[] = seedTvListings,
): ResolvedAirings {
  const rows = listings.filter((l) => l.countryId === countryId);
  const byMatch = rows.filter((l) => l.matchId && isSameMatch(catalog, l.matchId, fixture.id));
  if (byMatch.length) {
    return { fixture, airings: mergeAirings(byMatch), via: 'match' };
  }
  const byPair = rows.filter((l) => sameClubPair(catalog, l, fixture));
  if (byPair.length) {
    return { fixture, airings: mergeAirings(byPair), via: 'pair' };
  }
  if (isEnglandCompetition(fixture.leagueId)) {
    const byLeague = rows.filter((l) => l.leagueId && sameEnglandLeague(l.leagueId, fixture.leagueId));
    if (byLeague.length) {
      return { fixture, airings: mergeAirings(byLeague), via: 'league' };
    }
  }
  return { fixture, airings: [], via: 'none' };
}

export function broadcastsByMatch(
  catalog: TvLookupCatalog,
  matchId: string,
  countryId?: string,
  listings: SeedTvListing[] = seedTvListings,
): TvCountryBroadcasts[] {
  const fixture = resolveMatchDeepLink(catalog, matchId).fixture;
  if (!fixture) return [];
  const geos = countryId ? tvCountries.filter((c) => c.id === countryId) : tvCountries;
  return geos
    .map((country) => ({
      country,
      airings: resolveAiringsForFixture(catalog, fixture, country.id, listings).airings,
    }))
    .filter((row) => row.airings.length > 0);
}

export function listingsByCountry(
  catalog: TvLookupCatalog,
  countryId: string,
  opts: { window?: 'today' | 'upcoming'; now?: number } = {},
  listings: SeedTvListing[] = seedTvListings,
): TvScheduleEntry[] {
  const country = countryMap.get(countryId);
  if (!country) return [];
  const now = opts.now ?? Date.now();
  const window = opts.window ?? 'today';
  const entries: TvScheduleEntry[] = [];
  for (const fixture of catalog.getFixtures()) {
    const resolved = resolveAiringsForFixture(catalog, fixture, countryId, listings);
    if (!resolved.airings.length) continue;
    const today = isSameCalendarDay(fixture.kickoff, country.timeZone, now);
    if (window === 'today') {
      if (!today) continue;
    } else if (today || fixture.status === 'finished') {
      continue;
    }
    entries.push({ fixture, airings: resolved.airings });
  }
  return entries.sort((a, b) => Date.parse(a.fixture.kickoff) - Date.parse(b.fixture.kickoff));
}

export function createEditorialTvProvider(catalog: TvLookupCatalog = football): TvProvider {
  return {
    getCountries: () => tvCountries,
    getCountry: (id) => countryMap.get(id),
    getChannels: () => tvChannels,
    getChannel: (id) => channelMap.get(id),
    getBroadcastsByMatch: (matchId, countryId) => broadcastsByMatch(catalog, matchId, countryId),
    getListingsByCountry: (countryId, opts) => listingsByCountry(catalog, countryId, opts),
  };
}

export type { TvLookupCatalog, TvProvider } from '@/services/tvTypes';

/** Editorial mock TV — replace with a licensed adapter that implements `TvProvider`. */
export const tv: TvProvider = createEditorialTvProvider(football);

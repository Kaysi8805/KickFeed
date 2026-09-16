import type { Href } from 'expo-router';

import { football } from '@/services/football';

export type EntityKind = 'team' | 'player' | 'league' | 'match' | 'user';

export type BackKind = EntityKind | 'country' | 'continent';

export function entityHref(kind: EntityKind, id: string): Href {
  switch (kind) {
    case 'team':
      return `/team/${id}` as Href;
    case 'player':
      return `/player/${id}` as Href;
    case 'league':
      return `/league/${id}` as Href;
    case 'match':
      return `/match/${id}` as Href;
    case 'user':
      return `/user/${id}` as Href;
  }
}

/**
 * Parent surface for a cold open / empty stack.
 * Used when `router.back()` is unavailable or throws — do not treat canGoBack as sufficient.
 */
export function entityBackHref(kind: BackKind, id?: string): Href {
  if (kind === 'player' && id) {
    const player = football.getPlayer(id);
    if (player) return entityHref('team', player.teamId);
    return '/' as Href;
  }
  if (kind === 'team' && id) {
    const comps = football.getTeamCompetitions(id);
    const league = comps.find((l) => l.featured) ?? comps[0];
    if (league) return entityHref('league', league.id);
    return '/leagues' as Href;
  }
  if (kind === 'league' && id) {
    const league = football.getLeague(id);
    if (league) return `/country/${league.countryId}` as Href;
    return '/leagues' as Href;
  }
  if (kind === 'match') return '/matches' as Href;
  if (kind === 'country' && id) {
    const country = football.getCountry(id);
    if (country) return `/continent/${country.continentId}` as Href;
    return '/leagues' as Href;
  }
  if (kind === 'continent') return '/leagues' as Href;
  return '/' as Href;
}

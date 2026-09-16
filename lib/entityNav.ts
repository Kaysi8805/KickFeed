import type { Href } from 'expo-router';

export type EntityKind = 'team' | 'player' | 'league' | 'match' | 'user';

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

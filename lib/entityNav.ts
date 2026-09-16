export type EntityKind = 'team' | 'player' | 'league' | 'match' | 'user';

export function entityHref(kind: EntityKind, id: string): string {
  switch (kind) {
    case 'team':
      return `/team/${id}`;
    case 'player':
      return `/player/${id}`;
    case 'league':
      return `/league/${id}`;
    case 'match':
      return `/match/${id}`;
    case 'user':
      return `/user/${id}`;
  }
}

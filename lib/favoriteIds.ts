import { football } from '@/services/football';
import type { FootballEntityKind } from '@/services/footballTypes';

export function relatedIdSet(kind: FootballEntityKind, id: string): Set<string> {
  return new Set(football.relatedIds(kind, id));
}

export function isFavoriteId(saved: string[], id: string, kind: FootballEntityKind): boolean {
  const related = relatedIdSet(kind, id);
  return saved.some((item) => related.has(item) || football.relatedIds(kind, item).includes(id));
}

export function expandFavoriteIds(saved: string[], kind: FootballEntityKind): Set<string> {
  const out = new Set<string>();
  for (const id of saved) {
    for (const rel of football.relatedIds(kind, id)) out.add(rel);
  }
  return out;
}

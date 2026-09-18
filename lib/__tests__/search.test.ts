import { searchEntities, searchHasHits } from '@/lib/search';
import { demoUsers } from '@/data/mocks/social';
import { describe, expect, it } from 'vitest';

describe('searchEntities', () => {
  it('finds Salah on a player page id', () => {
    const hits = searchEntities('Salah', demoUsers);
    expect(hits.players.some((p) => p.id === 'p-liv-11' && /salah/i.test(p.name))).toBe(true);
    expect(hits.teams.some((t) => t.id === 'liv')).toBe(false);
  });

  it('finds Arsenal as a club', () => {
    const hits = searchEntities('Arsenal', demoUsers);
    expect(hits.teams[0]?.id).toBe('ars');
    expect(searchHasHits(hits)).toBe(true);
  });

  it('finds Premier League from a partial name', () => {
    const hits = searchEntities('Premier', demoUsers);
    expect(hits.leagues.some((l) => l.id === 'epl')).toBe(true);
  });

  it('finds Slovakia Niké Liga and Slovan in the mock catalog', () => {
    const liga = searchEntities('Nike', demoUsers);
    expect(liga.leagues.some((l) => l.id === 'nikeliga')).toBe(true);
    const club = searchEntities('Slovan', demoUsers);
    expect(club.teams.some((t) => t.id === 'slovan')).toBe(true);
  });

  it('finds demo fans by name and handle', () => {
    const byName = searchEntities('Maya', demoUsers);
    expect(byName.users.some((u) => u.id === 'maya')).toBe(true);
    const byHandle = searchEntities('madridista', demoUsers);
    expect(byHandle.users.some((u) => u.id === 'omar')).toBe(true);
  });

  it('returns nothing for a one-letter or empty query', () => {
    expect(searchHasHits(searchEntities('', demoUsers))).toBe(false);
    expect(searchHasHits(searchEntities('s', demoUsers))).toBe(false);
  });
});

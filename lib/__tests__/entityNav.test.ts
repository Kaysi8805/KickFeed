import { entityHref } from '@/lib/entityNav';
import { describe, expect, it } from 'vitest';

describe('entityHref', () => {
  it('builds first-class entity routes', () => {
    expect(entityHref('team', 'liv')).toBe('/team/liv');
    expect(entityHref('player', 'p-liv-11')).toBe('/player/p-liv-11');
    expect(entityHref('league', 'epl')).toBe('/league/epl');
    expect(entityHref('match', 'fx-liv-ars')).toBe('/match/fx-liv-ars');
    expect(entityHref('user', 'maya')).toBe('/user/maya');
  });
});

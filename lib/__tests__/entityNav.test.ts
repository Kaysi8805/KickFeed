import { entityBackHref, entityHref } from '@/lib/entityNav';
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

describe('entityBackHref', () => {
  it('points at a parent entity when history is empty', () => {
    expect(entityBackHref('player', 'p-liv-11')).toBe('/team/liv');
    expect(entityBackHref('team', 'liv')).toBe('/league/epl');
    expect(entityBackHref('league', 'epl')).toBe('/country/eng');
    expect(entityBackHref('match', 'fx-liv-ars')).toBe('/matches');
    expect(entityBackHref('user', 'maya')).toBe('/');
    expect(entityBackHref('country', 'eng')).toBe('/continent/europe');
    expect(entityBackHref('continent', 'europe')).toBe('/leagues');
  });
});

describe('entityHref', () => {
  it('builds first-class entity routes', () => {
    expect(entityHref('team', 'liv')).toBe('/team/liv');
    expect(entityHref('player', 'p-liv-11')).toBe('/player/p-liv-11');
    expect(entityHref('league', 'epl')).toBe('/league/epl');
    expect(entityHref('match', 'fx-liv-ars')).toBe('/match/fx-liv-ars');
    expect(entityHref('user', 'maya')).toBe('/user/maya');
  });
});

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { defaultEntitySegment, tabBarFocusIndex } from '@/lib/entityTabs';

const root = resolve(__dirname, '../..');

const tabs = [
  { name: 'index' },
  { name: 'matches' },
  { name: 'leagues' },
  { name: 'following' },
  { name: 'profile' },
  { name: '(entity)' },
];

describe('entity routes stay inside the tab navigator', () => {
  it('nests match, team, player, and league under (tabs)/(entity)', () => {
    for (const screen of ['match/[id].tsx', 'team/[id].tsx', 'player/[id].tsx', 'league/[id].tsx']) {
      expect(existsSync(resolve(root, 'app/(tabs)/(entity)', screen))).toBe(true);
      expect(existsSync(resolve(root, 'app', screen))).toBe(false);
    }
    expect(existsSync(resolve(root, 'app/(tabs)/(entity)/_layout.tsx'))).toBe(true);
    expect(existsSync(resolve(root, 'app/compose.tsx'))).toBe(true);
    expect(existsSync(resolve(root, 'app/edit-profile.tsx'))).toBe(true);
  });

  it('keeps entity screens off the root stack and hides the entity tab', () => {
    const rootLayout = readFileSync(resolve(root, 'app/_layout.tsx'), 'utf8');
    const tabsLayout = readFileSync(resolve(root, 'app/(tabs)/_layout.tsx'), 'utf8');
    for (const screen of ['team/[id]', 'player/[id]', 'match/[id]', 'league/[id]']) {
      expect(rootLayout).not.toContain(`name="${screen}"`);
    }
    expect(rootLayout).toContain('name="compose"');
    expect(rootLayout).toContain('name="edit-profile"');
    expect(tabsLayout).toContain('name="(entity)"');
    expect(tabsLayout).toContain('href: null');
  });

  it('selects Overview (or the matching segment) and a visible tab by default', () => {
    expect(defaultEntitySegment('team')).toBe('overview');
    expect(defaultEntitySegment('player')).toBe('overview');
    expect(defaultEntitySegment('match')).toBe('events');
    expect(defaultEntitySegment('league')).toBe('table');

    const entityIndex = tabs.findIndex((route) => route.name === '(entity)');
    expect(tabBarFocusIndex(tabs, entityIndex, 'team/[id]')).toBe(0);
    expect(tabBarFocusIndex(tabs, entityIndex, 'player/[id]')).toBe(0);
    expect(tabBarFocusIndex(tabs, entityIndex, 'match/[id]')).toBe(1);
    expect(tabBarFocusIndex(tabs, entityIndex, 'league/[id]')).toBe(2);
    expect(tabBarFocusIndex(tabs, 3, undefined)).toBe(3);
  });
});

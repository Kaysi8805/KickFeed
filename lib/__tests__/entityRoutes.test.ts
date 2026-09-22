import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../..');

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
});

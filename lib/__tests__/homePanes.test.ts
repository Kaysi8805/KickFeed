import { describe, expect, it } from 'vitest';

import { DEFAULT_HOME_PANE, HOME_PANES } from '@/lib/homePanes';

describe('home panes', () => {
  it('opens Feed first, with Matchday still available second', () => {
    expect(HOME_PANES.map((pane) => pane.key)).toEqual(['feed', 'matchday']);
    expect(HOME_PANES.map((pane) => pane.label)).toEqual(['Feed', 'Matchday']);
    expect(DEFAULT_HOME_PANE).toBe('feed');
    expect(DEFAULT_HOME_PANE).toBe(HOME_PANES[0]?.key);
  });
});

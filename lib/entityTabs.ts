/** In-page segment and the visible bottom tab while a hidden `(entity)` screen is open. */

export type EntityScreen = 'team' | 'player' | 'match' | 'league';

export type EntitySegment = 'overview' | 'events' | 'table';

export type PrimaryTab = 'index' | 'matches' | 'leagues' | 'following' | 'profile';

/** First segment when landing on an entity. Match and league have no Overview label. */
export function defaultEntitySegment(screen: 'team' | 'player'): 'overview';
export function defaultEntitySegment(screen: 'match'): 'events';
export function defaultEntitySegment(screen: 'league'): 'table';
export function defaultEntitySegment(screen: EntityScreen): EntitySegment {
  if (screen === 'match') return 'events';
  if (screen === 'league') return 'table';
  return 'overview';
}

/**
 * Bottom tab that stays selected on an entity screen.
 * The `(entity)` route is hidden, so leaving the navigator index there paints no tab.
 */
export function primaryTabForEntity(screen: EntityScreen): PrimaryTab {
  if (screen === 'match') return 'matches';
  if (screen === 'league') return 'leagues';
  return 'index';
}

export function entityScreenFromRouteName(name: string | undefined): EntityScreen | undefined {
  if (!name) return undefined;
  if (name.startsWith('team')) return 'team';
  if (name.startsWith('player')) return 'player';
  if (name.startsWith('match')) return 'match';
  if (name.startsWith('league')) return 'league';
  return undefined;
}

/** Index into the tab state that should look selected. Entity routes alias to a visible tab. */
export function tabBarFocusIndex(
  routes: readonly { name: string }[],
  focusedIndex: number,
  nestedEntityRoute: string | undefined,
): number {
  const focused = routes[focusedIndex];
  if (!focused || focused.name !== '(entity)') return focusedIndex;
  const screen = entityScreenFromRouteName(nestedEntityRoute);
  const target = screen ? primaryTabForEntity(screen) : 'index';
  const index = routes.findIndex((route) => route.name === target);
  return index >= 0 ? index : focusedIndex;
}

/** Home segments. Feed is first and selected so the social pitch opens before Matchday. */

export type HomePane = 'feed' | 'matchday';

export const HOME_PANES: { key: HomePane; label: string }[] = [
  { key: 'feed', label: 'Feed' },
  { key: 'matchday', label: 'Matchday' },
];

export const DEFAULT_HOME_PANE: HomePane = HOME_PANES[0]!.key;

/** Team/league badge visual. A failed image load uses the same chip as a missing URL. */
export function crestBadgeMode(uri: string | undefined, loadFailed: boolean): 'image' | 'fallback' {
  return uri && !loadFailed ? 'image' : 'fallback';
}

/** Accessibility name for a team crest (image plate or code-chip fallback). */
export function teamCrestA11y(name: string): { role: 'image'; label: string } {
  return { role: 'image', label: `${name} crest` };
}

/** Accessibility name for a competition mark (image plate or short-name chip). */
export function leagueMarkA11y(name: string): { role: 'image'; label: string } {
  return { role: 'image', label: `${name} logo` };
}

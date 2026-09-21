/**
 * KickFeed Pitch Neon (batch 1) — dark-only.
 *
 * Hard rules:
 * - Green (`accent` / `accentSoft`) is brand and CTA only.
 * - LIVE is coral/red (`live`) — never green.
 * - Glow is reserved for live rings and the Matchday hero.
 * - Scores use tabular numerals (`type.displayScore`).
 */

export const palette = {
  bg: '#050805',
  surface: '#0C120E',
  surfaceElevated: '#152018',
  text: '#F3FBF5',
  textMuted: '#8FA396',
  accent: '#22C55E',
  accentSoft: '#4ADE80',
  danger: '#F87171',
  live: '#EF4444',
  border: '#1F2E24',
} as const;

/** Semantic roles for chrome. Prefer these over raw palette keys in new UI. */
export const semantic = {
  canvas: palette.bg,
  surface: palette.surface,
  surfaceElevated: palette.surfaceElevated,
  text: palette.text,
  textMuted: palette.textMuted,
  brand: palette.accent,
  brandSoft: palette.accentSoft,
  cta: palette.accent,
  onCta: palette.bg,
  live: palette.live,
  danger: palette.danger,
  border: palette.border,
} as const;

/**
 * 8-point spacing grid (plus a 4pt half-step).
 * `spacing` keeps the existing named keys so out-of-scope screens do not reflow.
 */
export const space = {
  0: 0,
  half: 4,
  1: 8,
  2: 16,
  3: 24,
  4: 32,
  5: 40,
} as const;

export const spacing = {
  xs: space.half,
  sm: space[1],
  md: 12,
  lg: space[2],
  xl: 20,
  xxl: 28,
  xxxl: space[5],
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  full: 999,
} as const;

const tabularNums: Array<'tabular-nums'> = ['tabular-nums'];

export const type = {
  displayScore: {
    fontSize: 32,
    fontWeight: '800' as const,
    letterSpacing: -0.8,
    fontVariant: tabularNums,
  },
  title: { fontSize: 22, fontWeight: '800' as const, letterSpacing: -0.4 },
  body: { fontSize: 15, fontWeight: '500' as const },
  meta: { fontSize: 13, fontWeight: '600' as const },
  badge: {
    fontSize: 11,
    fontWeight: '800' as const,
    letterSpacing: 0.8,
    textTransform: 'uppercase' as const,
  },
  // Compatibility aliases used by existing screens.
  hero: { fontSize: 28, fontWeight: '800' as const, letterSpacing: -0.6 },
  subtitle: { fontSize: 16, fontWeight: '700' as const },
  caption: { fontSize: 13, fontWeight: '600' as const },
  micro: { fontSize: 11, fontWeight: '700' as const, letterSpacing: 0.6 },
  score: {
    fontSize: 28,
    fontWeight: '800' as const,
    letterSpacing: -0.8,
    fontVariant: tabularNums,
  },
};

/** Live glow — hero + live rings only. */
export const glow = {
  live: {
    shadowColor: palette.live,
    shadowOpacity: 0.55,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
} as const;

export const shadow = {
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
};

/**
 * Compatibility palette for existing screens.
 * CTA fills (`lime`, `pitchBright`) map to brand green.
 * Section kickers (`limeMuted`) map to muted text so green stays on brand/CTA.
 * Decorative `pitch` maps to brand green (existing fills). Chrome that must not
 * be green should use `border` or `live` explicitly.
 */
export const colors = {
  bg: palette.bg,
  bgElevated: palette.surface,
  surface: palette.surface,
  surfaceHover: palette.surfaceElevated,
  surfaceAlt: palette.surfaceElevated,
  surfaceElevated: palette.surfaceElevated,
  border: palette.border,
  pitch: palette.accent,
  pitchBright: palette.accent,
  lime: palette.accent,
  limeMuted: palette.textMuted,
  gold: '#E8C547',
  live: palette.live,
  danger: palette.danger,
  text: palette.text,
  textMuted: palette.textMuted,
  textDim: palette.textMuted,
  white: '#FFFFFF',
  overlay: 'rgba(5, 8, 5, 0.78)',
  accent: palette.accent,
  accentSoft: palette.accentSoft,
  onCta: semantic.onCta,
} as const;

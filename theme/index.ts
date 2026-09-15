export const colors = {
  bg: '#07150F',
  bgElevated: '#0B1F14',
  surface: '#12281C',
  surfaceHover: '#173424',
  surfaceAlt: '#1A3A28',
  border: '#234A34',
  pitch: '#16A34A',
  pitchBright: '#22C55E',
  lime: '#C8F542',
  limeMuted: '#A3E635',
  gold: '#F5C518',
  live: '#FF3B5C',
  danger: '#F43F5E',
  text: '#F4FBF6',
  textMuted: '#9BB8A6',
  textDim: '#6E8B7A',
  white: '#FFFFFF',
  overlay: 'rgba(7, 21, 15, 0.72)',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  xxxl: 40,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  full: 999,
} as const;

export const type = {
  hero: { fontSize: 28, fontWeight: '800' as const, letterSpacing: -0.6 },
  title: { fontSize: 22, fontWeight: '800' as const, letterSpacing: -0.4 },
  subtitle: { fontSize: 16, fontWeight: '700' as const },
  body: { fontSize: 15, fontWeight: '500' as const },
  caption: { fontSize: 13, fontWeight: '600' as const },
  micro: { fontSize: 11, fontWeight: '700' as const, letterSpacing: 0.6 },
  score: { fontSize: 28, fontWeight: '800' as const, letterSpacing: -0.8 },
};

export const shadow = {
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
};

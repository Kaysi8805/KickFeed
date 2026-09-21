import { describe, expect, it } from 'vitest';

import { colors, palette, semantic, space, spacing, type } from '@/theme';

describe('Pitch Neon tokens', () => {
  it('locks the batch-1 palette', () => {
    expect(palette).toEqual({
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
    });
  });

  it('keeps LIVE off the brand greens', () => {
    expect(semantic.live).toBe(palette.live);
    expect(semantic.live).not.toBe(semantic.brand);
    expect(semantic.live).not.toBe(palette.accent);
    expect(semantic.live).not.toBe(palette.accentSoft);
    expect(colors.live).toBe(palette.live);
  });

  it('reserves green for brand/CTA aliases', () => {
    expect(semantic.brand).toBe(palette.accent);
    expect(semantic.cta).toBe(palette.accent);
    expect(colors.lime).toBe(palette.accent);
    expect(colors.pitchBright).toBe(palette.accent);
    expect(colors.limeMuted).toBe(palette.textMuted);
    expect(colors.pitch).toBe(palette.accent);
  });

  it('exposes an 8pt spacing grid and type roles', () => {
    expect(space[1]).toBe(8);
    expect(space[2]).toBe(16);
    expect(spacing.sm).toBe(8);
    expect(spacing.lg).toBe(16);
    expect(type.displayScore.fontVariant).toEqual(['tabular-nums']);
    expect(type.score.fontVariant).toEqual(['tabular-nums']);
    expect(type.title.fontSize).toBe(22);
    expect(type.body.fontSize).toBe(15);
    expect(type.meta.fontSize).toBe(13);
    expect(type.badge.fontSize).toBe(11);
  });
});

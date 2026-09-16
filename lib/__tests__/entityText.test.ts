import { splitEntityText } from '@/lib/entityText';
import { describe, expect, it } from 'vitest';

describe('splitEntityText', () => {
  it('links team, player, and league mentions in feed copy', () => {
    const parts = splitEntityText('Salah still unplayable. Arsenal need a reset. UCL midweek is the best night.');
    const kinds = parts.filter((p) => p.kind !== 'text');
    expect(kinds.some((p) => p.kind === 'player' && p.value.toLowerCase().includes('salah'))).toBe(true);
    expect(kinds.some((p) => p.kind === 'team' && p.id === 'ars')).toBe(true);
    expect(kinds.some((p) => p.kind === 'league' && p.id === 'ucl')).toBe(true);
  });

  it('prefers the longer team name when two overlap', () => {
    const parts = splitEntityText('Inter Miami host a Friday night.');
    const teams = parts.filter((p) => p.kind === 'team');
    expect(teams[0]?.id).toBe('mia');
  });
});

import { describe, expect, it } from 'vitest';

import type { LineupPlayer } from '@/data/types';
import { LINEUPS_CACHE_MISS_BODY } from '@/lib/honesty';
import { formationRows, lineupIsSheet, parseLineupGrid, pitchPoints } from '@/lib/lineupPitch';

const positions = ['GK', 'DF', 'DF', 'DF', 'DF', 'MF', 'MF', 'MF', 'FW', 'FW', 'FW'] as const;

function xi(): LineupPlayer[] {
  return positions.map((pos, index) => ({
    name: `P${index}`,
    number: index + 1,
    pos,
    playerId: `p${index}`,
  }));
}

describe('lineup pitch', () => {
  it('parses API-Football grid cells and rejects blanks', () => {
    expect(parseLineupGrid('1:1')).toEqual({ row: 1, col: 1 });
    expect(parseLineupGrid(' 4:2 ')).toEqual({ row: 4, col: 2 });
    expect(parseLineupGrid(null)).toBeUndefined();
    expect(parseLineupGrid('gk')).toBeUndefined();
  });

  it('accepts a 10-outfield formation and rejects a bad shape', () => {
    expect(formationRows('4-2-3-1')).toEqual([4, 2, 3, 1]);
    expect(formationRows('4-4-3')).toBeUndefined();
    expect(formationRows('—')).toBeUndefined();
  });

  it('places a 4-3-3 with the home goalkeeper at the bottom and the away goalkeeper at the top', () => {
    const home = pitchPoints(xi(), '4-3-3', 'home');
    const away = pitchPoints(xi(), '4-3-3', 'away');
    expect(home).toHaveLength(11);
    expect(away).toHaveLength(11);
    expect(home![0]!.y).toBeGreaterThan(home![10]!.y);
    expect(home![0]!.y).toBeGreaterThan(0.5);
    expect(away![0]!.y).toBeLessThan(away![10]!.y);
    expect(away![0]!.y).toBeLessThan(0.5);
    expect(home![1]!.x).toBeLessThan(home![4]!.x);
    expect(away![1]!.x).toBeGreaterThan(away![4]!.x);
  });

  it('uses grid cells when every starter has one, and refuses to guess a partial sheet', () => {
    const players: LineupPlayer[] = [
      { name: 'GK', number: 1, pos: 'GK', grid: { row: 1, col: 1 } },
      { name: 'LB', number: 3, pos: 'DF', grid: { row: 2, col: 1 } },
      { name: 'RB', number: 2, pos: 'DF', grid: { row: 2, col: 4 } },
    ];
    const placed = pitchPoints(players, '—', 'home');
    expect(placed?.find((point) => point.player.name === 'GK')?.y).toBeGreaterThan(
      placed!.find((point) => point.player.name === 'LB')!.y,
    );
    expect(placed?.find((point) => point.player.name === 'LB')?.x).toBeLessThan(
      placed!.find((point) => point.player.name === 'RB')!.x,
    );
    expect(pitchPoints([{ name: 'Salah', number: 11, pos: 'FW' }], '4-3-3', 'home')).toBeUndefined();
  });

  it('treats only a non-empty published sheet as confirmed', () => {
    expect(lineupIsSheet({ source: 'sheet', players: [{ name: 'A', number: 1, pos: 'GK' }] })).toBe(true);
    expect(lineupIsSheet({ source: 'demo', players: [{ name: 'A', number: 1, pos: 'GK' }] })).toBe(false);
    expect(lineupIsSheet({ source: 'sheet', players: [] })).toBe(false);
    expect(LINEUPS_CACHE_MISS_BODY).toMatch(/does not guess a probable XI/);
  });
});
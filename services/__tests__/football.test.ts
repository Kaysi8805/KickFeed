import type { SeedFixture } from '@/data/types';
import { hydrateFixture, MOCK_FIRST_HALF_END, MOCK_FULL_TIME, MOCK_HT_END } from '@/services/football';
import { describe, expect, it } from 'vitest';

const NOW = Date.parse('2026-09-15T12:00:00.000Z');

function seed(offsetMin: number, extra: Partial<SeedFixture> = {}): SeedFixture {
  return {
    id: 'fx-test',
    leagueId: 'epl',
    homeTeamId: 'liv',
    awayTeamId: 'ars',
    kickoffOffsetMin: offsetMin,
    venue: 'Anfield',
    events: [
      { id: 'e1', type: 'goal', minute: 12, teamId: 'liv', playerName: 'Salah' },
      { id: 'e2', type: 'goal', minute: 52, teamId: 'ars', playerName: 'Saka' },
    ],
    ...extra,
  };
}

describe('hydrateFixture', () => {
  it('marks future kickoffs as upcoming with 0-0', () => {
    const fx = hydrateFixture(seed(15), NOW);
    expect(fx.status).toBe('upcoming');
    expect(fx.homeScore).toBe(0);
    expect(fx.awayScore).toBe(0);
    expect(fx.events).toEqual([]);
  });

  it('keeps first-half live minutes and only events up to that minute', () => {
    const fx = hydrateFixture(seed(-20), NOW);
    expect(fx.status).toBe('live');
    expect(fx.minute).toBe(20);
    expect(fx.homeScore).toBe(1);
    expect(fx.awayScore).toBe(0);
  });

  it('uses the 3-minute HT window', () => {
    const fx = hydrateFixture(seed(-(MOCK_FIRST_HALF_END + 1)), NOW);
    expect(fx.status).toBe('ht');
    expect(fx.minute).toBe(MOCK_FIRST_HALF_END);
  });

  it('maps second-half elapsed time onto display minutes after HT', () => {
    const fx = hydrateFixture(seed(-70), NOW);
    expect(fx.status).toBe('live');
    expect(fx.minute).toBe(67);
    expect(fx.homeScore).toBe(1);
    expect(fx.awayScore).toBe(1);
  });

  it('is finished at the mock full-time cutoff', () => {
    const fx = hydrateFixture(seed(-MOCK_FULL_TIME, { finishedHome: 2, finishedAway: 1 }), NOW);
    expect(fx.status).toBe('finished');
    expect(fx.homeScore).toBe(2);
    expect(fx.awayScore).toBe(1);
    expect(MOCK_HT_END).toBe(48);
  });
});

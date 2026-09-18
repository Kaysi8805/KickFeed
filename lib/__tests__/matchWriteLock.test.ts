import {
  MOTM_LOCK_AFTER_KICKOFF_MS,
  motmWriteAllowed,
  predictionWriteAllowed,
  tightenedKickoffMs,
} from '@/lib/matchWriteLock';
import { describe, expect, it } from 'vitest';

describe('server-side match write lock', () => {
  const kickoff = Date.parse('2026-09-16T18:00:00.000Z');

  it('locks score picks at kickoff using the clock, not client timestamps', () => {
    expect(predictionWriteAllowed(kickoff - 1, kickoff)).toBe(true);
    expect(predictionWriteAllowed(kickoff, kickoff)).toBe(false);
    expect(predictionWriteAllowed(kickoff + 60_000, kickoff)).toBe(false);
  });

  it('opens MOTM at kickoff and closes 4 hours later', () => {
    expect(motmWriteAllowed(kickoff - 1, kickoff)).toBe(false);
    expect(motmWriteAllowed(kickoff, kickoff)).toBe(true);
    expect(motmWriteAllowed(kickoff + 90 * 60_000, kickoff)).toBe(true);
    expect(motmWriteAllowed(kickoff + MOTM_LOCK_AFTER_KICKOFF_MS - 1, kickoff)).toBe(true);
    expect(motmWriteAllowed(kickoff + MOTM_LOCK_AFTER_KICKOFF_MS, kickoff)).toBe(false);
  });

  it('only allows kickoff to move earlier', () => {
    const later = kickoff + 3600_000;
    expect(tightenedKickoffMs(null, later)).toBe(later);
    expect(tightenedKickoffMs(later, kickoff)).toBe(kickoff);
    expect(tightenedKickoffMs(kickoff, later)).toBe(kickoff);
  });
});

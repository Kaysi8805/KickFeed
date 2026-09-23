import type { Fixture } from '@/data/types';
import { seedMotmVotes, seedPredictions } from '@/data/mocks/engagement';
import {
  aggregatePredictions,
  clampScore,
  hubEngageState,
  isMotmOpen,
  isPredictionOpen,
  motmCandidates,
  motmVoteForUser,
  playerKeyFor,
  predictionForUser,
  rowsForMatch,
  tallyMotmVotes,
} from '@/lib/engagement';
import { mockFootballProvider } from '@/services/football';
import { describe, expect, it } from 'vitest';

function upcoming(kickoff: string): Pick<Fixture, 'status' | 'kickoff'> {
  return { status: 'upcoming', kickoff };
}

describe('prediction lock', () => {
  it('stays open only while upcoming and kickoff is still in the future', () => {
    const now = Date.parse('2026-09-16T12:00:00.000Z');
    expect(isPredictionOpen(upcoming('2026-09-16T13:00:00.000Z'), now)).toBe(true);
    expect(isPredictionOpen(upcoming('2026-09-16T12:00:00.000Z'), now)).toBe(false);
    expect(isPredictionOpen({ status: 'live', kickoff: '2026-09-16T13:00:00.000Z' }, now)).toBe(false);
    expect(isPredictionOpen({ status: 'ht', kickoff: '2026-09-16T11:00:00.000Z' }, now)).toBe(false);
    expect(isPredictionOpen({ status: 'finished', kickoff: '2026-09-16T10:00:00.000Z' }, now)).toBe(false);
    expect(isPredictionOpen(undefined, now)).toBe(false);
    expect(isPredictionOpen(null, now)).toBe(false);
  });

  it('clamps scores to 0–9 integers', () => {
    expect(clampScore(2.9)).toBe(2);
    expect(clampScore(-1)).toBe(0);
    expect(clampScore(15)).toBe(9);
    expect(clampScore(Number.NaN)).toBe(0);
  });
});

describe('MOTM window', () => {
  it('opens during and after the match, not before kickoff', () => {
    expect(isMotmOpen('upcoming')).toBe(false);
    expect(isMotmOpen('live')).toBe(true);
    expect(isMotmOpen('ht')).toBe(true);
    expect(isMotmOpen('finished')).toBe(true);
    expect(isMotmOpen(undefined)).toBe(false);
    expect(isMotmOpen(null)).toBe(false);
  });
});

describe('hub engage gating', () => {
  it('only surfaces completed Predict/MOTM that match the fixture phase', () => {
    expect(hubEngageState('upcoming', true, true)).toEqual({ prediction: true, motm: false });
    expect(hubEngageState('upcoming', false, false)).toEqual({ prediction: false, motm: false });
    expect(hubEngageState('live', true, false)).toEqual({ prediction: true, motm: false });
    expect(hubEngageState('live', false, true)).toEqual({ prediction: false, motm: true });
    expect(hubEngageState('finished', true, true)).toEqual({ prediction: true, motm: true });
    expect(hubEngageState(undefined, true, true)).toEqual({ prediction: true, motm: false });
  });
});

describe('community aggregates', () => {
  it('averages scores and finds the most common line', () => {
    const agg = aggregatePredictions(rowsForMatch(seedPredictions, ['fx-bha-mun']));
    expect(agg.count).toBe(4);
    expect(agg.mostCommon).toBeTruthy();
    expect(agg.homeWin + agg.draw + agg.awayWin).toBe(4);
  });

  it('tallies MOTM votes and leaves Maya without a seeded vote', () => {
    const related = ['fx-liv-ars'];
    expect(motmVoteForUser(seedMotmVotes, 'maya', related)).toBeUndefined();
    expect(predictionForUser(seedPredictions, 'maya', related)).toBeUndefined();
    const tallies = tallyMotmVotes(rowsForMatch(seedMotmVotes, related));
    expect(tallies[0]?.playerName).toMatch(/Salah/);
    expect(tallies[0]?.votes).toBe(2);
  });
});

describe('MOTM candidates', () => {
  it('uses mock lineups (starting XIs) with catalog player ids', () => {
    const fixture = mockFootballProvider.getFixture('fx-liv-ars');
    expect(fixture).toBeTruthy();
    const ballot = motmCandidates(mockFootballProvider, fixture!);
    expect(ballot.length).toBe(22);
    expect(ballot.every((p) => p.playerId && mockFootballProvider.getPlayer(p.playerId))).toBe(true);
    expect(ballot.some((p) => p.key === 'p-liv-11')).toBe(true);
    expect(ballot.some((p) => p.teamId === 'ars')).toBe(true);
    const lineups = mockFootballProvider.getLineups(fixture!);
    const benchIds = new Set([...(lineups.home.bench ?? []), ...(lineups.away.bench ?? [])].map((p) => p.playerId));
    const starterIds = new Set([...lineups.home.players, ...lineups.away.players].map((p) => p.playerId));
    expect(lineups.home.bench?.length).toBeGreaterThan(0);
    expect(lineups.home.source).toBe('demo');
    expect([...benchIds].some((id) => id && !starterIds.has(id))).toBe(true);
    expect(ballot.every((p) => !p.playerId || starterIds.has(p.playerId))).toBe(true);
  });

  it('falls back to squads when lineups are empty', () => {
    const fixture = mockFootballProvider.getFixture('fx-liv-ars')!;
    const empty = {
      getLineups: () => ({
        home: { formation: '', players: [] },
        away: { formation: '', players: [] },
      }),
      getSquad: mockFootballProvider.getSquad,
      getPlayer: mockFootballProvider.getPlayer,
    };
    const ballot = motmCandidates(empty, fixture);
    expect(ballot.length).toBeGreaterThan(22);
    expect(ballot.some((p) => p.key === 'p-liv-11')).toBe(true);
  });

  it('returns an empty ballot when the fixture is omitted', () => {
    expect(motmCandidates(mockFootballProvider, undefined)).toEqual([]);
    expect(motmCandidates(mockFootballProvider, null)).toEqual([]);
  });

  it('builds a stable key when a lineup row has no player id', () => {
    expect(playerKeyFor(undefined, 'liv', 11, 'Mohamed Salah')).toBe('lineup:liv:11:mohamed salah');
    expect(playerKeyFor('p-liv-11', 'liv', 11, 'Mohamed Salah')).toBe('p-liv-11');
  });
});

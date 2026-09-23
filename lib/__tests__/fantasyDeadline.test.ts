import { describe, expect, it, vi } from 'vitest';

import { remoteFixturesUrl, remoteMatchStatus } from '@/lib/remotePush';
import {
  deadlinesFromBffPayload,
  deadlinesFromFixtures,
  fantasyFixturesUrl,
  fantasyKickoffStatus,
  readFantasySyncRequest,
  runFantasyDeadlineSync,
} from '@/supabase/functions/_shared/fantasyDeadline';

const NOW = Date.parse('2026-09-23T12:00:00.000Z');

describe('fantasy server deadline', () => {
  it('matches the push status map and the BFF fixture window', () => {
    for (const code of ['NS', 'FT', '1H', 'HT', 'CANC', 'PST', 'AET', 'ABD', '']) {
      expect(fantasyKickoffStatus(code)).toBe(remoteMatchStatus(code));
    }
    const now = new Date(NOW);
    expect(fantasyFixturesUrl('https://kickfeed-football-bff.kaysi8805.workers.dev/', '39', now, 2025)).toBe(
      remoteFixturesUrl('https://kickfeed-football-bff.kaysi8805.workers.dev/', '39', now, 2025),
    );
  });

  it('uses the earliest not-started kickoff and ignores a deadline stuffed in the request', () => {
    expect(
      readFantasySyncRequest({
        competitionId: '39',
        season: 2026,
        deadlineAt: '2099-01-01T00:00:00.000Z',
        p_deadline: '2099-01-01T00:00:00.000Z',
      }),
    ).toEqual({ competitionId: '39', season: 2026 });
    expect(readFantasySyncRequest({ competitionId: '1', season: 2026 })).toBeNull();

    const rows = deadlinesFromFixtures(
      [
        { season: 2026, round: 'Regular Season - 8', kickoff: '2026-09-26T16:00:00.000Z', status: 'upcoming' },
        { season: 2026, round: 'Regular Season - 8', kickoff: '2026-09-26T14:00:00.000Z', status: 'upcoming' },
        { season: 2026, round: 'Regular Season - 8', kickoff: '2026-09-20T12:00:00.000Z', status: 'finished' },
        { season: 2026, round: 'Regular Season - 7', kickoff: '2026-09-13T14:00:00.000Z', status: 'finished' },
        { season: 2025, round: 'Regular Season - 8', kickoff: '2025-09-01T14:00:00.000Z', status: 'upcoming' },
        { season: 2026, round: 'Regular Season - 9', kickoff: '2026-09-01T14:00:00.000Z', status: 'skip' },
      ],
      2026,
    );
    expect(rows).toEqual([
      { roundId: 'Regular Season - 7', deadlineAt: '2026-09-13T14:00:00.000Z' },
      { roundId: 'Regular Season - 8', deadlineAt: '2026-09-26T14:00:00.000Z' },
    ]);
  });

  it('reads round kickoffs from a BFF payload and does not trust a client deadline field', () => {
    const rows = deadlinesFromBffPayload(
      {
        errors: [],
        response: [
          {
            fixture: { date: '2026-09-27T19:00:00.000Z', status: { short: 'NS' } },
            league: { season: 2026, round: 'Regular Season - 8' },
          },
          {
            fixture: { date: '2026-09-26T14:00:00.000Z', status: { short: 'NS' } },
            league: { season: 2026, round: 'Regular Season - 8' },
            deadlineAt: '2099-01-01T00:00:00.000Z',
          },
          {
            fixture: { date: '2026-09-26T12:00:00.000Z', status: { short: 'CANC' } },
            league: { season: 2026, round: 'Regular Season - 8' },
          },
        ],
      },
      2026,
    );
    expect(rows).toEqual([{ roundId: 'Regular Season - 8', deadlineAt: '2026-09-26T14:00:00.000Z' }]);
    expect(deadlinesFromBffPayload({ errors: ['quota'] }, 2026)).toBeNull();
  });

  it('skips a fresh server cache and saves only kickoffs parsed from the BFF', async () => {
    const fetchImpl = vi.fn();
    const fresh = await runFantasyDeadlineSync({
      competitionId: '39',
      season: 2026,
      now: NOW,
      bffUrl: 'https://kickfeed-football-bff.kaysi8805.workers.dev',
      fetchImpl,
      loadFetchedAt: async () => NOW - 60_000,
      saveDeadlines: async () => {
        throw new Error('should not save');
      },
    });
    expect(fresh).toEqual({ ok: true, fetched: false, rounds: 0 });
    expect(fetchImpl).not.toHaveBeenCalled();

    const saved: unknown[] = [];
    fetchImpl.mockResolvedValue({
      ok: true,
      json: async () => ({
        response: [
          {
            fixture: { date: '2026-09-26T14:00:00.000Z', status: { short: 'NS' } },
            league: { season: 2026, round: 'Regular Season - 8' },
          },
        ],
      }),
    });
    const fetched = await runFantasyDeadlineSync({
      competitionId: '39',
      season: 2026,
      now: NOW,
      bffUrl: 'https://kickfeed-football-bff.kaysi8805.workers.dev',
      fetchImpl,
      loadFetchedAt: async () => null,
      saveDeadlines: async (rows) => {
        saved.push(rows);
      },
    });
    expect(fetched).toEqual({ ok: true, fetched: true, rounds: 1 });
    expect(saved).toEqual([[{ roundId: 'Regular Season - 8', deadlineAt: '2026-09-26T14:00:00.000Z' }]]);
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain('league=39');
    expect(String(fetchImpl.mock.calls[0]?.[0])).not.toContain('2099');
  });
});

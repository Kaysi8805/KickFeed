import { LIVE_RANKING_ERROR_BODY, rankingDisclaimer } from '@/lib/honesty';
import { LEADERBOARD_TIEBREAK_COPY } from '@/lib/leaderboard';
import {
  asLeaderboardClient,
  fetchRemoteLeaderboardRows,
  motmVoteToRemote,
  parseRemoteMotmVote,
  parseRemotePrediction,
  parseRemoteProfile,
  predictionToRemote,
  upsertRemotePrediction,
} from '@/services/leaderboard';
import { describe, expect, it } from 'vitest';

const UUID = '44444444-4444-4444-8444-444444444444';

describe('ranking honesty', () => {
  it('names demo vs live ranking without mixing the two tables', () => {
    expect(rankingDisclaimer('demo', false, 'mock')).toMatch(/demo ranking/i);
    expect(rankingDisclaimer('demo', false, 'mock')).toMatch(/not a live/i);
    expect(rankingDisclaimer('demo', true, 'mock')).toMatch(/email sign-in/i);
    expect(rankingDisclaimer('live', true, 'live')).toMatch(/KickFeed Postgres/i);
    expect(rankingDisclaimer('live', true, 'live')).toMatch(/England/i);
    expect(rankingDisclaimer('live', true, 'live')).toMatch(/Slovakia/i);
    expect(rankingDisclaimer('live', true, 'live')).toMatch(/other leagues mock/i);
    expect(rankingDisclaimer('live', true, 'mock')).toMatch(/mock catalog/i);
    expect(LIVE_RANKING_ERROR_BODY).toMatch(/live table/i);
    expect(LIVE_RANKING_ERROR_BODY).not.toMatch(/%s|\$\{/);
    expect(LEADERBOARD_TIEBREAK_COPY).toMatch(/matches/);
  });
});

describe('remote leaderboard rows', () => {
  it('maps snake_case postgres rows onto KickFeed identity keys', () => {
    const pred = parseRemotePrediction({
      match_id: 'fx-ful-eve',
      user_id: UUID,
      home_score: 2,
      away_score: 1,
      created_at: '2026-09-17T10:00:00.000Z',
      updated_at: '2026-09-17T11:00:00.000Z',
    });
    expect(pred).toMatchObject({ matchId: 'fx-ful-eve', userId: UUID, homeScore: 2, awayScore: 1 });
    expect(parseRemotePrediction({ match_id: 'x', user_id: 'ghost', home_score: 1, away_score: 0 })).toBeNull();

    const vote = parseRemoteMotmVote({
      match_id: 'fx-ful-eve',
      user_id: 'diego',
      player_key: 'p-ful-7',
      player_name: 'Raúl Jiménez',
      team_id: 'ful',
      created_at: '2026-09-17T12:00:00.000Z',
    });
    expect(vote).toMatchObject({ userId: 'diego', playerKey: 'p-ful-7' });

    const profile = parseRemoteProfile({
      id: UUID,
      handle: 'fan_44444444',
      display_name: 'Karol',
      avatar_color: '#22C55E',
    });
    expect(profile?.id).toBe(UUID);
    expect(profile?.name).toBe('Karol');
  });

  it('does not send client timestamps on the write payload', () => {
    const row = {
      matchId: 'fx-ful-eve',
      userId: UUID,
      homeScore: 2,
      awayScore: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const remote = predictionToRemote(row, 'epl');
    expect(remote).toMatchObject({
      match_id: 'fx-ful-eve',
      user_id: UUID,
      league_id: 'epl',
      home_score: 2,
      away_score: 1,
    });
    expect(motmVoteToRemote({
      matchId: 'fx-ful-eve',
      userId: UUID,
      playerKey: 'p-ful-7',
      playerName: 'Raúl Jiménez',
      teamId: 'ful',
      createdAt: '2026-09-17T12:00:00.000Z',
    }).user_id).toBe(UUID);
  });

  it('fetches through the tiny client wrapper and writes via RPC, not table upsert', async () => {
    expect(asLeaderboardClient(null)).toBeNull();
    const missing = await fetchRemoteLeaderboardRows(null);
    expect(missing).toEqual({ error: 'not_configured' });

    const tables: Record<string, Record<string, unknown>[]> = {
      predictions: [
        {
          match_id: 'fx-ful-eve',
          user_id: UUID,
          home_score: 2,
          away_score: 1,
          created_at: '2026-09-17T10:00:00.000Z',
          updated_at: '2026-09-17T10:00:00.000Z',
        },
      ],
      motm_votes: [],
      profiles: [{ id: UUID, handle: 'fan_44444444', display_name: 'Karol' }],
    };
    const rpcCalls: Array<{ fn: string; args?: Record<string, unknown> }> = [];
    const client = asLeaderboardClient({
      from: (table: string) => ({
        select: async () => ({ data: tables[table] ?? [], error: null }),
      }),
      rpc: async (fn, args) => {
        rpcCalls.push({ fn, args });
        return { data: null, error: null };
      },
    });
    const rows = await fetchRemoteLeaderboardRows(client);
    expect('error' in rows).toBe(false);
    if ('error' in rows) return;
    expect(rows.predictions[0]?.userId).toBe(UUID);
    expect(rows.users[0]?.name).toBe('Karol');

    const saved = await upsertRemotePrediction(
      client,
      rows.predictions[0]!,
      'epl',
      '2026-09-20T15:00:00.000Z',
    );
    expect(saved.error).toBeNull();
    expect(rpcCalls[0]).toMatchObject({
      fn: 'kickfeed_upsert_prediction',
      args: {
        p_match_id: 'fx-ful-eve',
        p_league_id: 'epl',
        p_kickoff: '2026-09-20T15:00:00.000Z',
      },
    });
    expect(rpcCalls[0]?.args).not.toHaveProperty('created_at');
    expect(rpcCalls[0]?.args).not.toHaveProperty('p_created_at');
  });

  it('surfaces fetch failures instead of throwing', async () => {
    const client = asLeaderboardClient({
      from: () => ({
        select: async () => {
          throw new Error('network down');
        },
      }),
      rpc: async () => ({ data: null, error: null }),
    });
    await expect(fetchRemoteLeaderboardRows(client)).resolves.toEqual({ error: 'network down' });

    const locked = asLeaderboardClient({
      from: () => ({
        select: async () => ({ data: [], error: null }),
      }),
      rpc: async () => {
        throw new Error('predictions locked at kickoff');
      },
    });
    const row = {
      matchId: 'fx-ful-eve',
      userId: UUID,
      homeScore: 1,
      awayScore: 0,
      createdAt: '2026-09-17T10:00:00.000Z',
      updatedAt: '2026-09-17T10:00:00.000Z',
    };
    await expect(upsertRemotePrediction(locked, row, 'epl', '2026-09-01T12:00:00.000Z')).resolves.toEqual({
      error: 'predictions locked at kickoff',
    });
  });
});

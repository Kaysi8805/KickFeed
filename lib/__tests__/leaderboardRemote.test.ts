import { LIVE_RANKING_ERROR_BODY, rankingDisclaimer } from '@/lib/honesty';
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
    expect(rankingDisclaimer('live', true, 'live')).toMatch(/England live/i);
    expect(rankingDisclaimer('live', true, 'mock')).toMatch(/mock catalog/i);
    expect(LIVE_RANKING_ERROR_BODY).toMatch(/live table/i);
    expect(LIVE_RANKING_ERROR_BODY).not.toMatch(/%s|\$\{/);
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

  it('round-trips a prediction for upsert', () => {
    const row = {
      matchId: 'fx-ful-eve',
      userId: UUID,
      homeScore: 2,
      awayScore: 1,
      createdAt: '2026-09-17T10:00:00.000Z',
      updatedAt: '2026-09-17T11:00:00.000Z',
    };
    expect(predictionToRemote(row, 'epl')).toMatchObject({
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

  it('fetches through the tiny client wrapper and no-ops without supabase', async () => {
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
    const client = asLeaderboardClient({
      from: (table: string) => ({
        select: async () => ({ data: tables[table] ?? [], error: null }),
        upsert: async () => ({ error: null }),
      }),
    });
    const rows = await fetchRemoteLeaderboardRows(client);
    expect('error' in rows).toBe(false);
    if ('error' in rows) return;
    expect(rows.predictions[0]?.userId).toBe(UUID);
    expect(rows.users[0]?.name).toBe('Karol');

    const saved = await upsertRemotePrediction(client, rows.predictions[0]!, 'epl');
    expect(saved.error).toBeNull();
  });
});

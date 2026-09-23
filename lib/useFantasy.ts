import { useCallback, useEffect, useState } from 'react';

import { saveFantasyPick, validateXi, type FantasySlot, type FantasySnapshot } from '@/lib/fantasy';
import { shouldPersistLeaderboard } from '@/lib/leaderboard';
import { useApp } from '@/services/AppProvider';
import {
  asFantasyClient,
  createRemoteFantasyLeague,
  fetchRemoteFantasy,
  joinRemoteFantasyLeague,
  upsertRemoteFantasyPick,
  upsertRemoteFantasyPoints,
} from '@/services/fantasyRemote';
import { getSupabaseClient } from '@/services/supabase';

export function useFantasy() {
  const { currentUser, authMode, supabaseConfigured, rememberProfiles } = useApp();
  const signedIn = shouldPersistLeaderboard(supabaseConfigured, authMode);
  const userId = currentUser?.id ?? null;
  const [snapshot, setSnapshot] = useState<FantasySnapshot | null>(null);
  const [loading, setLoading] = useState(signedIn);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!userId || !signedIn) {
      setSnapshot(null);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const remote = await fetchRemoteFantasy(asFantasyClient(getSupabaseClient()));
    if ('error' in remote) {
      setError(remote.error);
      setSnapshot(null);
      setLoading(false);
      return;
    }
    rememberProfiles(remote.users);
    setSnapshot(remote.snapshot);
    setLoading(false);
  }, [rememberProfiles, signedIn, userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const createLeague = useCallback(
    async (
      name: string,
      competitionId: string,
      season: number,
    ): Promise<{ ok: true; leagueId: string } | { ok: false; error: string }> => {
      if (!signedIn) return { ok: false, error: 'not_authenticated' };
      const created = await createRemoteFantasyLeague(asFantasyClient(getSupabaseClient()), name, competitionId, season);
      if ('error' in created) return { ok: false, error: created.error };
      await refresh();
      return { ok: true, leagueId: created.league.id };
    },
    [refresh, signedIn],
  );

  const joinLeague = useCallback(
    async (code: string): Promise<{ ok: true; leagueId: string } | { ok: false; error: string }> => {
      if (!signedIn) return { ok: false, error: 'not_authenticated' };
      const joined = await joinRemoteFantasyLeague(asFantasyClient(getSupabaseClient()), code);
      if ('error' in joined) return { ok: false, error: joined.error };
      await refresh();
      return { ok: true, leagueId: joined.league.id };
    },
    [refresh, signedIn],
  );

  const saveXi = useCallback(
    async (
      leagueId: string,
      roundId: string,
      slots: readonly FantasySlot[],
      locked: boolean,
      deadlineAt: string | null,
    ): Promise<{ ok: true } | { ok: false; error: string }> => {
      if (!userId || !snapshot || !signedIn) return { ok: false, error: 'not_authenticated' };
      const local = saveFantasyPick(snapshot, userId, leagueId, roundId, slots, locked, new Date());
      if (!local.ok) return local;
      const remote = await upsertRemoteFantasyPick(
        asFantasyClient(getSupabaseClient()),
        leagueId,
        roundId,
        [...slots],
        deadlineAt,
      );
      if (remote.error) return { ok: false, error: remote.error };
      await refresh();
      return { ok: true };
    },
    [refresh, signedIn, snapshot, userId],
  );

  const saveRoundPoints = useCallback(
    async (
      leagueId: string,
      roundId: string,
      rows: Array<{ userId: string; points: number; goals: number; assists: number }>,
    ): Promise<void> => {
      if (!signedIn || rows.length === 0) return;
      await upsertRemoteFantasyPoints(asFantasyClient(getSupabaseClient()), leagueId, roundId, rows);
    },
    [signedIn],
  );

  return {
    signedIn,
    userId,
    snapshot,
    loading,
    error,
    refresh,
    createLeague,
    joinLeague,
    saveXi,
    saveRoundPoints,
    validateXi,
  };
}

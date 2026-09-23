import { useCallback, useEffect, useState } from 'react';

import {
  createFantasyLeague,
  joinFantasyLeague,
  saveFantasyPick,
  withDemoSeed,
  type FantasySlot,
  type FantasySnapshot,
} from '@/lib/fantasy';
import { shouldPersistLeaderboard } from '@/lib/leaderboard';
import { useApp } from '@/services/AppProvider';
import { loadFantasyLocal, saveFantasyLocal } from '@/services/fantasyLocal';
import {
  asFantasyClient,
  createRemoteFantasyLeague,
  fetchRemoteFantasy,
  joinRemoteFantasyLeague,
  upsertRemoteFantasyPick,
} from '@/services/fantasyRemote';
import { getSupabaseClient } from '@/services/supabase';

export function useFantasy() {
  const { currentUser, authMode, supabaseConfigured, rememberProfiles } = useApp();
  const live = shouldPersistLeaderboard(supabaseConfigured, authMode);
  const userId = currentUser?.id ?? null;
  const [snapshot, setSnapshot] = useState<FantasySnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!userId) {
      setSnapshot(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    if (!live) {
      const local = await loadFantasyLocal();
      setSnapshot(withDemoSeed(local, userId, new Date()));
      setLoading(false);
      return;
    }
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
  }, [live, rememberProfiles, userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const persistLocal = useCallback(
    async (next: FantasySnapshot) => {
      if (!userId) return;
      const stored = next;
      setSnapshot(withDemoSeed(stored, userId, new Date()));
      await saveFantasyLocal(stored);
    },
    [userId],
  );

  const createLeague = useCallback(
    async (name: string): Promise<{ ok: true; leagueId: string } | { ok: false; error: string }> => {
      if (!userId || !snapshot) return { ok: false, error: 'not_authenticated' };
      if (live) {
        const created = await createRemoteFantasyLeague(asFantasyClient(getSupabaseClient()), name);
        if ('error' in created) return { ok: false, error: created.error };
        await refresh();
        return { ok: true, leagueId: created.league.id };
      }
      const result = createFantasyLeague(snapshot, userId, name, new Date());
      if (!result.ok) return result;
      await persistLocal(result.snapshot);
      const leagueId = result.snapshot.leagues[result.snapshot.leagues.length - 1]?.id;
      if (!leagueId) return { ok: false, error: 'invalid_name' };
      return { ok: true, leagueId };
    },
    [live, persistLocal, refresh, snapshot, userId],
  );

  const joinLeague = useCallback(
    async (code: string): Promise<{ ok: true; leagueId: string } | { ok: false; error: string }> => {
      if (!userId || !snapshot) return { ok: false, error: 'not_authenticated' };
      if (live) {
        const joined = await joinRemoteFantasyLeague(asFantasyClient(getSupabaseClient()), code);
        if ('error' in joined) return { ok: false, error: joined.error };
        await refresh();
        return { ok: true, leagueId: joined.league.id };
      }
      const result = joinFantasyLeague(snapshot, userId, code, new Date());
      if (!result.ok) return result;
      await persistLocal(result.snapshot);
      const cleaned = code.trim().toUpperCase();
      const league = result.snapshot.leagues.find((row) => row.inviteCode === cleaned.replace(/[^A-Z0-9]/g, ''));
      if (!league) return { ok: false, error: 'league_not_found' };
      return { ok: true, leagueId: league.id };
    },
    [live, persistLocal, refresh, snapshot, userId],
  );

  const saveXi = useCallback(
    async (
      gameweekId: string,
      draft: ReadonlyArray<FantasySlot | null>,
      locked: boolean,
      deadlineAt: string | null,
    ): Promise<{ ok: true } | { ok: false; error: string }> => {
      if (!userId || !snapshot) return { ok: false, error: 'not_authenticated' };
      const result = saveFantasyPick(snapshot, userId, gameweekId, draft, locked, new Date());
      if (!result.ok) return result;
      if (live) {
        const pick = result.snapshot.picks.find((row) => row.userId === userId && row.gameweekId === gameweekId);
        if (!pick) return { ok: false, error: 'invalid_xi' };
        const remote = await upsertRemoteFantasyPick(
          asFantasyClient(getSupabaseClient()),
          gameweekId,
          pick.slots,
          deadlineAt,
        );
        if (remote.error) return { ok: false, error: remote.error };
        await refresh();
        return { ok: true };
      }
      await persistLocal(result.snapshot);
      return { ok: true };
    },
    [live, persistLocal, refresh, snapshot, userId],
  );

  return {
    live,
    userId,
    snapshot,
    loading,
    error,
    refresh,
    createLeague,
    joinLeague,
    saveXi,
  };
}

import { useCallback, useEffect, useState } from 'react';

import type { ScorePrediction, Team } from '@/data/types';
import {
  bondsForUser,
  clubFromTeam,
  declareRivalryClub,
  endRivalry,
  inviteRivalry,
  postRivalryBanter,
  recentLedger,
  respondRivalry,
  rivalrySeasonLabel,
  shouldPersistRivalry,
  syncRivalryLedger,
  type RivalryBond,
  type RivalryBook,
  type RivalryClub,
  type RivalryLedgerEntry,
  type RivalryMatchFact,
} from '@/lib/rivalry';
import { useApp } from '@/services/AppProvider';
import { getRivalryDemoBook, loadRivalryDemo, mutateRivalryDemo, subscribeRivalryDemo } from '@/services/rivalryDemo';
import {
  asRivalryClient,
  endRemoteRivalry,
  fetchRemoteRivalry,
  inviteRemoteRivalry,
  postRemoteRivalryBanter,
  respondRemoteRivalry,
  setRemoteRivalryClub,
  syncRemoteRivalryLedger,
} from '@/services/rivalryRemote';
import { getSupabaseClient } from '@/services/supabase';

type Ok = { ok: true; bondId?: string };
type Err = { ok: false; error: string };

export function useRivalry() {
  const { currentUser, authMode, supabaseConfigured, friendIds, followingIds, cannotDmUserIds } = useApp();
  const live = shouldPersistRivalry(supabaseConfigured, authMode);
  const userId = currentUser?.id ?? null;
  const [book, setBook] = useState<RivalryBook>(() => getRivalryDemoBook());
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const season = rivalrySeasonLabel();

  const refresh = useCallback(async () => {
    if (!userId) {
      setReady(true);
      return;
    }
    if (!live) {
      await loadRivalryDemo();
      setBook(getRivalryDemoBook());
      setError(null);
      setReady(true);
      return;
    }
    const remote = await fetchRemoteRivalry(asRivalryClient(getSupabaseClient()));
    if ('error' in remote) {
      setError(remote.error);
      setBook({ clubs: {}, bonds: [], ledger: [] });
    } else {
      setError(null);
      setBook(remote);
    }
    setReady(true);
  }, [live, userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (live) return;
    return subscribeRivalryDemo(() => setBook(getRivalryDemoBook()));
  }, [live]);

  const blocked = useCallback((peerId: string) => cannotDmUserIds.includes(peerId), [cannotDmUserIds]);

  const declareClub = useCallback(
    async (team: Team): Promise<Ok | Err> => {
      if (!userId) return { ok: false, error: 'not_authenticated' };
      const club = clubFromTeam(team);
      if (!club) return { ok: false, error: 'bad_club' };
      if (!live) {
        await mutateRivalryDemo((current) => declareRivalryClub(current, userId, club));
        return { ok: true };
      }
      const saved = await setRemoteRivalryClub(asRivalryClient(getSupabaseClient()), club);
      if (saved.error) return { ok: false, error: saved.error };
      await refresh();
      return { ok: true };
    },
    [live, refresh, userId],
  );

  const invite = useCallback(
    async (peerId: string): Promise<Ok | Err> => {
      if (!userId) return { ok: false, error: 'not_authenticated' };
      if (blocked(peerId)) return { ok: false, error: 'blocked' };
      if (!live) {
        let bondId = '';
        let failure: string | null = null;
        await mutateRivalryDemo((current) => {
          const result = inviteRivalry(current, {
            actorId: userId,
            peerId,
            mutual: friendIds.includes(peerId),
            blocked: blocked(peerId),
          });
          if ('error' in result) {
            failure = result.error;
            return current;
          }
          bondId = result.bondId;
          return result.book;
        });
        if (failure) return { ok: false, error: failure };
        return { ok: true, bondId };
      }
      const result = await inviteRemoteRivalry(asRivalryClient(getSupabaseClient()), peerId);
      if ('error' in result) return { ok: false, error: result.error };
      await refresh();
      return { ok: true, bondId: result.bondId };
    },
    [blocked, friendIds, live, refresh, userId],
  );

  const respond = useCallback(
    async (bondId: string, accept: boolean): Promise<Ok | Err> => {
      if (!userId) return { ok: false, error: 'not_authenticated' };
      const bond = (live ? book : getRivalryDemoBook()).bonds.find((row) => row.id === bondId);
      const peerId = bond && userId === bond.userA ? bond.userB : bond?.userA;
      if (peerId && blocked(peerId)) return { ok: false, error: 'blocked' };
      if (!live) {
        let failure: string | null = null;
        await mutateRivalryDemo((current) => {
          const result = respondRivalry(current, {
            actorId: userId,
            bondId,
            accept,
            mutual: peerId ? friendIds.includes(peerId) : false,
            blocked: peerId ? blocked(peerId) : false,
          });
          if ('error' in result) {
            failure = result.error;
            return current;
          }
          return result.book;
        });
        if (failure) return { ok: false, error: failure };
        return { ok: true };
      }
      const result = await respondRemoteRivalry(asRivalryClient(getSupabaseClient()), bondId, accept);
      if (result.error) return { ok: false, error: result.error };
      await refresh();
      return { ok: true };
    },
    [blocked, book, friendIds, live, refresh, userId],
  );

  const endBond = useCallback(
    async (bondId: string): Promise<Ok | Err> => {
      if (!userId) return { ok: false, error: 'not_authenticated' };
      if (!live) {
        let failure: string | null = null;
        await mutateRivalryDemo((current) => {
          const result = endRivalry(current, { actorId: userId, bondId });
          if ('error' in result) {
            failure = result.error;
            return current;
          }
          return result.book;
        });
        if (failure) return { ok: false, error: failure };
        return { ok: true };
      }
      const result = await endRemoteRivalry(asRivalryClient(getSupabaseClient()), bondId);
      if (result.error) return { ok: false, error: result.error };
      await refresh();
      return { ok: true };
    },
    [live, refresh, userId],
  );

  const postBanter = useCallback(
    async (bondId: string, body: string): Promise<Ok | Err> => {
      if (!userId) return { ok: false, error: 'not_authenticated' };
      const bond = (live ? book : getRivalryDemoBook()).bonds.find((row) => row.id === bondId);
      const peerId = bond && userId === bond.userA ? bond.userB : bond?.userA;
      if (peerId && blocked(peerId)) return { ok: false, error: 'blocked' };
      if (!live) {
        let failure: string | null = null;
        await mutateRivalryDemo((current) => {
          const result = postRivalryBanter(current, {
            actorId: userId,
            bondId,
            body,
            blocked: peerId ? blocked(peerId) : false,
          });
          if ('error' in result) {
            failure = result.error;
            return current;
          }
          return result.book;
        });
        if (failure) return { ok: false, error: failure };
        return { ok: true };
      }
      const result = await postRemoteRivalryBanter(asRivalryClient(getSupabaseClient()), bondId, body);
      if (result.error) return { ok: false, error: result.error };
      await refresh();
      return { ok: true };
    },
    [blocked, book, live, refresh, userId],
  );

  const sync = useCallback(
    async (bondId: string, facts: readonly RivalryMatchFact[], predictions: readonly ScorePrediction[]): Promise<Ok | Err> => {
      if (!userId) return { ok: false, error: 'not_authenticated' };
      if (!live) {
        await mutateRivalryDemo((current) => syncRivalryLedger(current, { bondId, facts, predictions }));
        return { ok: true };
      }
      const result = await syncRemoteRivalryLedger(asRivalryClient(getSupabaseClient()), bondId, facts);
      if (result.error) return { ok: false, error: result.error };
      await refresh();
      return { ok: true };
    },
    [live, refresh, userId],
  );

  const club: RivalryClub | null = userId ? (book.clubs[userId] ?? null) : null;
  const bonds: RivalryBond[] = userId ? bondsForUser(book, userId) : [];
  const ledgerFor = useCallback(
    (bondId: string): RivalryLedgerEntry[] => recentLedger(book.ledger, bondId),
    [book.ledger],
  );

  const candidates = (live ? followingIds : friendIds).filter((id) => !cannotDmUserIds.includes(id));

  return {
    ready,
    live,
    season,
    userId,
    club,
    bonds,
    book,
    error,
    candidates,
    declareClub,
    invite,
    respond,
    endBond,
    postBanter,
    sync,
    ledgerFor,
    refresh,
  };
}

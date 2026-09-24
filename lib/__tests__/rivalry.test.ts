import { describe, expect, it } from 'vitest';

import type { ScorePrediction } from '@/data/types';
import {
  RIVALRY_RULES,
  banterBlocked,
  canonicalUserPair,
  clubFromTeam,
  declareRivalryClub,
  emptyRivalryBook,
  endRivalry,
  inviteRivalry,
  parseRivalryBook,
  postRivalryBanter,
  respondRivalry,
  rivalryMatchFacts,
  rivalrySeasonLabel,
  scorePredictionDuel,
  scoreRealHeadToHead,
  scoreboardFor,
  syncRivalryLedger,
} from '@/lib/rivalry';
import { europeanSeasonYear } from '@/services/footballApi';

const NOW = Date.parse('2026-09-24T12:00:00.000Z');

const arsenal = {
  id: 'ars',
  name: 'Arsenal',
  shortName: 'Arsenal',
  code: 'ARS',
  color: '#EF0107',
  accent: '#FFFFFF',
  countryId: 'eng',
  logoUrl: 'https://media.api-sports.io/football/teams/42.png',
};
const liverpool = { ...arsenal, id: 'liv', name: 'Liverpool', code: 'LIV' };
const everton = { ...arsenal, id: 'eve', name: 'Everton', code: 'EVE' };

function clubs() {
  const ars = clubFromTeam(arsenal);
  const liv = clubFromTeam(liverpool);
  const eve = clubFromTeam(everton);
  if (!ars || !liv || !eve) throw new Error('clubs');
  return declareRivalryClub(declareRivalryClub(declareRivalryClub(emptyRivalryBook(), 'maya', ars), 'omar', liv), 'jordan', eve);
}

function pred(userId: string, matchId: string, homeScore: number, awayScore: number): ScorePrediction {
  return { userId, matchId, homeScore, awayScore, createdAt: new Date(NOW).toISOString(), updatedAt: new Date(NOW).toISOString() };
}

describe('rivalry season and pair', () => {
  it('labels the European season the same way the rest of KickFeed does', () => {
    expect(rivalrySeasonLabel(new Date('2026-09-24T00:00:00.000Z'))).toBe('2026/27');
    expect(rivalrySeasonLabel(new Date('2026-06-30T23:00:00.000Z'))).toBe('2025/26');
    expect(rivalrySeasonLabel(new Date('2026-07-01T00:00:00.000Z'))).toBe('2026/27');
    expect(europeanSeasonYear(new Date('2026-09-24T00:00:00.000Z'))).toBe(2026);
    expect(RIVALRY_RULES).toMatch(/draw is 1 each/);
    expect(RIVALRY_RULES).toMatch(/only one of the clubs does not score/);
  });

  it('orders the pair by id and rejects self', () => {
    expect(canonicalUserPair('omar', 'maya')).toEqual(['maya', 'omar']);
    expect(canonicalUserPair('maya', 'maya')).toBeNull();
  });
});

describe('rivalry invite rules', () => {
  it('requires a mutual follow and two different clubs', () => {
    const book = clubs();
    expect(inviteRivalry(book, { actorId: 'maya', peerId: 'omar', mutual: false, blocked: false, now: NOW })).toMatchObject({
      error: 'not_friends',
    });
    expect(inviteRivalry(book, { actorId: 'maya', peerId: 'omar', mutual: true, blocked: true, now: NOW })).toMatchObject({
      error: 'blocked',
    });
    const same = declareRivalryClub(book, 'omar', clubFromTeam(arsenal)!);
    expect(inviteRivalry(same, { actorId: 'maya', peerId: 'omar', mutual: true, blocked: false, now: NOW })).toMatchObject({
      error: 'same_club',
    });
    const missing = declareRivalryClub(emptyRivalryBook(), 'maya', clubFromTeam(arsenal)!);
    expect(inviteRivalry(missing, { actorId: 'maya', peerId: 'omar', mutual: true, blocked: false, now: NOW })).toMatchObject({
      error: 'missing_club',
    });
  });

  it('canonicalizes the pair and lets the invitee accept', () => {
    const invited = inviteRivalry(clubs(), { actorId: 'omar', peerId: 'maya', mutual: true, blocked: false, now: NOW });
    if ('error' in invited) throw new Error(invited.error);
    const bond = invited.book.bonds[0];
    expect(bond?.userA).toBe('maya');
    expect(bond?.userB).toBe('omar');
    expect(bond?.invitedBy).toBe('omar');
    expect(bond?.clubA.clubId).toBe('ars');
    expect(respondRivalry(invited.book, { actorId: 'omar', bondId: bond!.id, accept: true, mutual: true, blocked: false, now: NOW + 1 })).toMatchObject({
      error: 'not_invite',
    });
    const accepted = respondRivalry(invited.book, {
      actorId: 'maya',
      bondId: bond!.id,
      accept: true,
      mutual: true,
      blocked: false,
      now: NOW + 1,
    });
    if ('error' in accepted) throw new Error(accepted.error);
    expect(accepted.book.bonds[0]?.status).toBe('active');
    const again = inviteRivalry(accepted.book, { actorId: 'maya', peerId: 'omar', mutual: true, blocked: false, now: NOW + 2 });
    expect(again).toMatchObject({ error: 'already_open' });
  });

  it('drops a declined invite so the pair can try again', () => {
    const invited = inviteRivalry(clubs(), { actorId: 'maya', peerId: 'omar', mutual: true, blocked: false, now: NOW });
    if ('error' in invited) throw new Error(invited.error);
    const declined = respondRivalry(invited.book, {
      actorId: 'omar',
      bondId: invited.bondId,
      accept: false,
      mutual: true,
      blocked: false,
      now: NOW + 1,
    });
    if ('error' in declined) throw new Error(declined.error);
    expect(declined.book.bonds[0]?.status).toBe('ended');
    const retry = inviteRivalry(declined.book, { actorId: 'maya', peerId: 'omar', mutual: true, blocked: false, now: NOW + 2 });
    expect('bondId' in retry).toBe(true);
  });
});

describe('rivalry scoring', () => {
  it('awards 3 for a win, 1 each for a draw, and nothing when only one club plays', () => {
    expect(
      scoreRealHeadToHead({
        clubAId: 'ars',
        clubBId: 'liv',
        homeTeamId: 'liv',
        awayTeamId: 'ars',
        homeScore: 1,
        awayScore: 2,
      }),
    ).toEqual({ pointsA: 3, pointsB: 0 });
    expect(
      scoreRealHeadToHead({
        clubAId: 'ars',
        clubBId: 'liv',
        homeTeamId: '40',
        awayTeamId: '42',
        homeAliasIds: ['liv'],
        awayAliasIds: ['ars'],
        homeScore: 0,
        awayScore: 0,
      }),
    ).toEqual({ pointsA: 1, pointsB: 1 });
    expect(
      scoreRealHeadToHead({
        clubAId: 'ars',
        clubBId: 'liv',
        homeTeamId: 'ars',
        awayTeamId: 'che',
        homeScore: 3,
        awayScore: 0,
      }),
    ).toBeNull();
  });

  it('gives 1 to the closer prediction and 0 when the picks are level', () => {
    const result = { homeScore: 2, awayScore: 1 };
    expect(scorePredictionDuel({ homeScore: 2, awayScore: 1 }, { homeScore: 1, awayScore: 0 }, result)).toEqual({
      pointsA: 1,
      pointsB: 0,
    });
    expect(scorePredictionDuel({ homeScore: 3, awayScore: 1 }, { homeScore: 5, awayScore: 1 }, result)).toEqual({
      pointsA: 1,
      pointsB: 0,
    });
    expect(scorePredictionDuel({ homeScore: 0, awayScore: 2 }, { homeScore: 1, awayScore: 1 }, result)).toEqual({
      pointsA: 0,
      pointsB: 1,
    });
    expect(scorePredictionDuel({ homeScore: 2, awayScore: 1 }, { homeScore: 2, awayScore: 1 }, result)).toEqual({
      pointsA: 0,
      pointsB: 0,
    });
  });

  it('appends each result once and keeps the running score', () => {
    const invited = inviteRivalry(clubs(), { actorId: 'maya', peerId: 'omar', mutual: true, blocked: false, now: NOW });
    if ('error' in invited) throw new Error(invited.error);
    const accepted = respondRivalry(invited.book, {
      actorId: 'omar',
      bondId: invited.bondId,
      accept: true,
      mutual: true,
      blocked: false,
      now: NOW + 1,
    });
    if ('error' in accepted) throw new Error(accepted.error);
    const facts = [
      {
        matchId: 'fx-liv-ars',
        aliasIds: ['9001'],
        homeTeamId: 'liv',
        awayTeamId: 'ars',
        homeAliasIds: [],
        awayAliasIds: [],
        homeScore: 1,
        awayScore: 2,
      },
      {
        matchId: 'fx-other',
        aliasIds: [],
        homeTeamId: 'che',
        awayTeamId: 'tot',
        homeAliasIds: [],
        awayAliasIds: [],
        homeScore: 0,
        awayScore: 1,
      },
    ];
    const predictions = [
      pred('maya', '9001', 2, 1),
      pred('omar', 'fx-other', 0, 1),
      pred('maya', 'fx-other', 1, 0),
    ];
    const once = syncRivalryLedger(accepted.book, { bondId: invited.bondId, facts, predictions, now: NOW + 5 });
    const twice = syncRivalryLedger(once, { bondId: invited.bondId, facts, predictions, now: NOW + 9 });
    const bond = twice.bonds.find((row) => row.id === invited.bondId);
    expect(bond?.pointsA).toBe(3);
    expect(bond?.pointsB).toBe(1);
    const kinds = twice.ledger.filter((row) => row.bondId === invited.bondId && row.kind !== 'system').map((row) => row.kind);
    expect(kinds).toEqual(['real_h2h', 'prediction']);
    const board = scoreboardFor(bond!, 'omar');
    expect(board?.left.points).toBe(1);
    expect(board?.left.club.clubId).toBe('liv');
  });

  it('keeps the newest finished matches when the catalog is long', () => {
    const fixtures = Array.from({ length: 45 }, (_, index) => ({
      id: `m${index}`,
      leagueId: 'epl',
      homeTeamId: 'ars',
      awayTeamId: 'liv',
      kickoff: new Date(NOW - (45 - index) * 86_400_000).toISOString(),
      status: 'finished' as const,
      homeScore: 1,
      awayScore: 0,
      events: [],
      venue: 'Home',
    }));
    const facts = rivalryMatchFacts(fixtures, (id) => [id], (id) => [id]);
    expect(facts).toHaveLength(40);
    expect(facts[0]?.matchId).toBe('m5');
    expect(facts.at(-1)?.matchId).toBe('m44');
  });
});

describe('rivalry banter', () => {
  function active() {
    const invited = inviteRivalry(clubs(), { actorId: 'maya', peerId: 'omar', mutual: true, blocked: false, now: NOW });
    if ('error' in invited) throw new Error(invited.error);
    const accepted = respondRivalry(invited.book, {
      actorId: 'omar',
      bondId: invited.bondId,
      accept: true,
      mutual: true,
      blocked: false,
      now: NOW + 1,
    });
    if ('error' in accepted) throw new Error(accepted.error);
    return { book: accepted.book, bondId: invited.bondId };
  }

  it('caps length, blocks a pair, and rate-limits the thread', () => {
    const { book, bondId } = active();
    expect(postRivalryBanter(book, { actorId: 'maya', bondId, body: '   ', blocked: false, now: NOW + 10 })).toMatchObject({
      error: 'bad_banter',
    });
    expect(postRivalryBanter(book, { actorId: 'maya', bondId, body: 'a'.repeat(161), blocked: false, now: NOW + 10 })).toMatchObject({
      error: 'bad_banter',
    });
    expect(postRivalryBanter(book, { actorId: 'maya', bondId, body: 'See you Sunday', blocked: true, now: NOW + 10 })).toMatchObject({
      error: 'blocked',
    });
    const posted = postRivalryBanter(book, { actorId: 'maya', bondId, body: '  See   you Sunday  ', blocked: false, now: NOW + 10 });
    if ('error' in posted) throw new Error(posted.error);
    expect(posted.book.ledger.at(-1)?.body).toBe('See you Sunday');
    expect(postRivalryBanter(posted.book, { actorId: 'maya', bondId, body: 'Again', blocked: false, now: NOW + 12_000 })).toMatchObject({
      error: 'slow_mode',
    });
    const later = postRivalryBanter(posted.book, { actorId: 'omar', bondId, body: 'You wish', blocked: false, now: NOW + 11_000 });
    if ('error' in later) throw new Error(later.error);
    expect(later.book.ledger.filter((row) => row.kind === 'banter')).toHaveLength(2);
    const ended = endRivalry(later.book, { actorId: 'maya', bondId, now: NOW + 40_000 });
    if ('error' in ended) throw new Error(ended.error);
    expect(postRivalryBanter(ended.book, { actorId: 'omar', bondId, body: 'Still here', blocked: false, now: NOW + 50_000 })).toMatchObject({
      error: 'not_active',
    });
  });

  it('round-trips a saved book', () => {
    const { book, bondId } = active();
    const posted = postRivalryBanter(book, { actorId: 'maya', bondId, body: 'North London', blocked: false, now: NOW + 10 });
    if ('error' in posted) throw new Error(posted.error);
    const restored = parseRivalryBook(JSON.parse(JSON.stringify(posted.book)));
    expect(restored.bonds[0]?.clubA.name).toBe('Arsenal');
    expect(restored.ledger.some((row) => row.body === 'North London')).toBe(true);
    expect(banterBlocked(restored.ledger, bondId, 'maya', NOW + 12_000)).toBe(true);
  });
});

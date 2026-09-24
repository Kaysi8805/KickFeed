/**
 * Rivalry Bond — a season score between two friends on opposing clubs.
 * Pure helpers: invite rules, head-to-head points, prediction duels, banter limits.
 * No React, Supabase, or device imports.
 *
 * Real head-to-head (weight 3) scores only when the two declared clubs play each
 * other. The winner's friend gets 3. A draw is 1 each. A match that includes
 * only one club does not score here.
 * Prediction duel (weight 1) scores when both friends picked the same finished
 * match. Leaderboard points decide it (exact 5, right result 2, else 0). If
 * those tie, the smaller scoreline error wins. A level pick is 0 each.
 * Banter is text only and does not move the score.
 */

import type { Fixture, ScorePrediction, Team } from '@/data/types';
import { scorePredictionPoints } from '@/lib/leaderboard';
import { europeanSeasonYear } from '@/services/footballApi';

export const RIVALRY_REAL_WIN = 3;
export const RIVALRY_REAL_DRAW = 1;
export const RIVALRY_PREDICTION_WIN = 1;
export const RIVALRY_BANTER_MAX = 160;
export const RIVALRY_BANTER_COOLDOWN_MS = 20_000;
export const RIVALRY_BANTER_BURST_COUNT = 8;
export const RIVALRY_BANTER_BURST_WINDOW_MS = 2 * 60_000;
export const RIVALRY_SYNC_LIMIT = 40;

export const RIVALRY_NOT_GAMBLING =
  'A Rivalry Bond is a season score between two friends. No stakes, no entry fee, and no payout. KickFeed is not a betting product.';

export const RIVALRY_RULES =
  'Real head-to-head: when your two clubs play each other, the winner’s friend gets 3. A draw is 1 each. A match with only one of the clubs does not score. Prediction duel: when you both picked the same finished match, the closer pick gets 1 (exact score, then the right result, then the nearer scoreline). A level pick is 0. Banter is short text and does not add points.';

export const RIVALRY_DEMO_COPY =
  'Demo bond — stored on this device only. Switch demo users here to accept an invite. It is not written to KickFeed Postgres.';

export const RIVALRY_LIVE_COPY =
  'Live bond — KickFeed Postgres. Only the two of you can read it. Scores update from finished matches already in the catalog. There is no official stake.';

export type RivalryStatus = 'invite' | 'active' | 'ended';
export type RivalryLedgerKind = 'real_h2h' | 'prediction' | 'banter' | 'system';

export type RivalryClub = {
  clubId: string;
  name: string;
  code: string;
  crestUrl?: string;
  color: string;
  accent: string;
};

export type RivalryBond = {
  id: string;
  userA: string;
  userB: string;
  clubA: RivalryClub;
  clubB: RivalryClub;
  season: string;
  status: RivalryStatus;
  invitedBy: string;
  pointsA: number;
  pointsB: number;
  createdAt: string;
  updatedAt: string;
};

export type RivalryLedgerEntry = {
  id: string;
  bondId: string;
  kind: RivalryLedgerKind;
  matchId?: string;
  pointsA: number;
  pointsB: number;
  body: string;
  authorId?: string;
  sourceKey?: string;
  createdAt: string;
};

export type RivalryBook = {
  clubs: Record<string, RivalryClub>;
  bonds: RivalryBond[];
  ledger: RivalryLedgerEntry[];
};

export type RivalryMatchFact = {
  matchId: string;
  aliasIds: string[];
  homeTeamId: string;
  awayTeamId: string;
  homeAliasIds: string[];
  awayAliasIds: string[];
  homeScore: number;
  awayScore: number;
};

export type RivalrySide = {
  userId: string;
  club: RivalryClub;
  points: number;
  you: boolean;
};

const CLUB_ID_RE = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,39}$/;
const HEX_RE = /^#[0-9A-Fa-f]{6}$/;
const CREST_RE = /^https:\/\/\S{1,292}$/;

const ERROR_COPY: Record<string, string> = {
  not_authenticated: 'Sign in with email to keep a Rivalry Bond on KickFeed.',
  not_configured: 'KickFeed Postgres is not configured on this build.',
  not_participant: 'Only the two of you can open this bond.',
  not_friends: 'Rivalry Bonds are for mutual friends. You both need to follow each other.',
  not_invite: 'This invite is no longer open.',
  not_active: 'That only works once the bond is accepted.',
  missing_club: 'You both need a declared club first. One club each, and they have to be different.',
  same_club: 'Pick opposing clubs. A Rivalry Bond needs two different clubs.',
  already_open: 'You already have a bond or an invite with this friend this season.',
  blocked: 'A block is in the way. Unblock before inviting or sending banter.',
  bad_peer: 'That fan can’t be invited.',
  bad_club: 'Pick a club from KickFeed.',
  bad_banter: 'Banter is 1–160 characters.',
  bad_matches: 'Couldn’t read those results.',
  slow_mode: 'Wait a moment before another banter line.',
};

export function rivalryDisclaimer(live: boolean): string {
  return live ? RIVALRY_LIVE_COPY : RIVALRY_DEMO_COPY;
}

export function rivalryErrorMessage(raw: string): string {
  const lower = raw.toLowerCase();
  const code = Object.keys(ERROR_COPY)
    .sort((a, b) => b.length - a.length)
    .find((key) => lower.includes(key));
  return code ? ERROR_COPY[code] : 'Couldn’t save that. Try again.';
}

/** European season label. September 2026 → 2026/27. July starts the new season. */
export function rivalrySeasonLabel(now = new Date()): string {
  const start = europeanSeasonYear(now);
  return `${start}/${String(start + 1).slice(-2)}`;
}

export function shouldPersistRivalry(supabaseConfigured: boolean, authMode: string | null): boolean {
  return supabaseConfigured && authMode === 'supabase';
}

export function canonicalUserPair(a: string, b: string): [string, string] | null {
  const left = a.trim();
  const right = b.trim();
  if (!left || !right || left === right || left.length > 80 || right.length > 80) return null;
  if (/\s/.test(left) || /\s/.test(right)) return null;
  return left < right ? [left, right] : [right, left];
}

export function emptyRivalryBook(): RivalryBook {
  return { clubs: {}, bonds: [], ledger: [] };
}

export function clubFromTeam(team: Pick<Team, 'id' | 'name' | 'shortName' | 'code' | 'color' | 'accent' | 'logoUrl'>): RivalryClub | null {
  const clubId = team.id.trim();
  if (!CLUB_ID_RE.test(clubId)) return null;
  const name = team.name.trim().replace(/\s+/g, ' ').slice(0, 80);
  if (!name) return null;
  const code = (team.code || team.shortName || name).replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 4) || 'FC';
  const color = HEX_RE.test(team.color) ? team.color.toUpperCase() : '#152018';
  const accent = HEX_RE.test(team.accent) ? team.accent.toUpperCase() : '#22C55E';
  const crest = team.logoUrl?.trim() ?? '';
  const crestUrl = CREST_RE.test(crest) ? crest : undefined;
  return { clubId, name, code, color, accent, ...(crestUrl ? { crestUrl } : {}) };
}

export function teamFromClub(club: RivalryClub): Team {
  return {
    id: club.clubId,
    name: club.name,
    shortName: club.code,
    code: club.code,
    color: club.color,
    accent: club.accent,
    countryId: '',
    ...(club.crestUrl ? { logoUrl: club.crestUrl } : {}),
  };
}

export function declareRivalryClub(book: RivalryBook, userId: string, club: RivalryClub): RivalryBook {
  const id = userId.trim();
  if (!id) return book;
  return { ...book, clubs: { ...book.clubs, [id]: club } };
}

function newId(prefix: string, now: number): string {
  return `${prefix}_${now.toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function openBond(book: RivalryBook, userA: string, userB: string, season: string): RivalryBond | undefined {
  return book.bonds.find(
    (bond) =>
      bond.userA === userA &&
      bond.userB === userB &&
      bond.season === season &&
      (bond.status === 'invite' || bond.status === 'active'),
  );
}

export function inviteRivalry(
  book: RivalryBook,
  input: {
    actorId: string;
    peerId: string;
    mutual: boolean;
    blocked: boolean;
    now?: number;
    season?: string;
  },
): { book: RivalryBook; bondId: string } | { error: string } {
  const pair = canonicalUserPair(input.actorId, input.peerId);
  if (!pair) return { error: 'bad_peer' };
  if (input.blocked) return { error: 'blocked' };
  if (!input.mutual) return { error: 'not_friends' };
  const [userA, userB] = pair;
  const clubA = book.clubs[userA];
  const clubB = book.clubs[userB];
  if (!clubA || !clubB) return { error: 'missing_club' };
  if (clubA.clubId === clubB.clubId) return { error: 'same_club' };
  const now = input.now ?? Date.now();
  const season = input.season ?? rivalrySeasonLabel(new Date(now));
  if (openBond(book, userA, userB, season)) return { error: 'already_open' };
  const bondId = newId('rb', now);
  const createdAt = new Date(now).toISOString();
  const bond: RivalryBond = {
    id: bondId,
    userA,
    userB,
    clubA,
    clubB,
    season,
    status: 'invite',
    invitedBy: input.actorId.trim(),
    pointsA: 0,
    pointsB: 0,
    createdAt,
    updatedAt: createdAt,
  };
  const entry: RivalryLedgerEntry = {
    id: newId('rl', now),
    bondId,
    kind: 'system',
    pointsA: 0,
    pointsB: 0,
    body: `Invite sent for ${season}.`,
    authorId: input.actorId.trim(),
    sourceKey: 'system:invite',
    createdAt,
  };
  return { book: { ...book, bonds: [...book.bonds, bond], ledger: [...book.ledger, entry] }, bondId };
}

export function respondRivalry(
  book: RivalryBook,
  input: {
    actorId: string;
    bondId: string;
    accept: boolean;
    mutual: boolean;
    blocked: boolean;
    now?: number;
  },
): { book: RivalryBook } | { error: string } {
  const bond = book.bonds.find((row) => row.id === input.bondId);
  const actorId = input.actorId.trim();
  if (!bond || (actorId !== bond.userA && actorId !== bond.userB)) return { error: 'not_participant' };
  if (bond.status !== 'invite') return { error: 'not_invite' };
  if (input.accept && actorId === bond.invitedBy) return { error: 'not_invite' };
  if (input.blocked) return { error: 'blocked' };
  const now = input.now ?? Date.now();
  const createdAt = new Date(now).toISOString();
  if (!input.accept) {
    return {
      book: replaceBond(book, { ...bond, status: 'ended', updatedAt: createdAt }, {
        id: newId('rl', now),
        bondId: bond.id,
        kind: 'system',
        pointsA: 0,
        pointsB: 0,
        body: 'Invite declined.',
        authorId: actorId,
        sourceKey: 'system:decline',
        createdAt,
      }),
    };
  }
  if (!input.mutual) return { error: 'not_friends' };
  const clubA = book.clubs[bond.userA];
  const clubB = book.clubs[bond.userB];
  if (!clubA || !clubB) return { error: 'missing_club' };
  if (clubA.clubId === clubB.clubId) return { error: 'same_club' };
  return {
    book: replaceBond(
      book,
      { ...bond, status: 'active', clubA, clubB, updatedAt: createdAt },
      {
        id: newId('rl', now),
        bondId: bond.id,
        kind: 'system',
        pointsA: 0,
        pointsB: 0,
        body: `Rivalry Bond is on for ${bond.season}.`,
        authorId: actorId,
        sourceKey: 'system:accept',
        createdAt,
      },
    ),
  };
}

export function endRivalry(
  book: RivalryBook,
  input: { actorId: string; bondId: string; now?: number },
): { book: RivalryBook } | { error: string } {
  const bond = book.bonds.find((row) => row.id === input.bondId);
  const actorId = input.actorId.trim();
  if (!bond || (actorId !== bond.userA && actorId !== bond.userB)) return { error: 'not_participant' };
  if (bond.status !== 'active') return { error: 'not_active' };
  const now = input.now ?? Date.now();
  const createdAt = new Date(now).toISOString();
  return {
    book: replaceBond(book, { ...bond, status: 'ended', updatedAt: createdAt }, {
      id: newId('rl', now),
      bondId: bond.id,
      kind: 'system',
      pointsA: 0,
      pointsB: 0,
      body: 'Rivalry Bond ended.',
      authorId: actorId,
      sourceKey: 'system:end',
      createdAt,
    }),
  };
}

export function normalizeBanter(body: string): string | null {
  const text = body.trim().replace(/\s+/g, ' ');
  if (text.length < 1 || text.length > RIVALRY_BANTER_MAX) return null;
  return text;
}

export function banterBlocked(
  entries: readonly RivalryLedgerEntry[],
  bondId: string,
  authorId: string,
  now: number,
): boolean {
  const mine = entries.filter((row) => row.bondId === bondId && row.kind === 'banter' && row.authorId === authorId);
  const latest = mine.reduce<number | null>((max, row) => {
    const at = Date.parse(row.createdAt);
    if (!Number.isFinite(at)) return max;
    return max == null || at > max ? at : max;
  }, null);
  if (latest != null && now - latest < RIVALRY_BANTER_COOLDOWN_MS) return true;
  const burst = mine.filter((row) => {
    const at = Date.parse(row.createdAt);
    return Number.isFinite(at) && now - at < RIVALRY_BANTER_BURST_WINDOW_MS;
  }).length;
  return burst >= RIVALRY_BANTER_BURST_COUNT;
}

export function postRivalryBanter(
  book: RivalryBook,
  input: { actorId: string; bondId: string; body: string; blocked: boolean; now?: number },
): { book: RivalryBook } | { error: string } {
  const bond = book.bonds.find((row) => row.id === input.bondId);
  const actorId = input.actorId.trim();
  if (!bond || (actorId !== bond.userA && actorId !== bond.userB)) return { error: 'not_participant' };
  if (bond.status !== 'active') return { error: 'not_active' };
  if (input.blocked) return { error: 'blocked' };
  const body = normalizeBanter(input.body);
  if (!body) return { error: 'bad_banter' };
  const now = input.now ?? Date.now();
  if (banterBlocked(book.ledger, bond.id, actorId, now)) return { error: 'slow_mode' };
  const createdAt = new Date(now).toISOString();
  const entry: RivalryLedgerEntry = {
    id: newId('rl', now),
    bondId: bond.id,
    kind: 'banter',
    pointsA: 0,
    pointsB: 0,
    body,
    authorId: actorId,
    createdAt,
  };
  return {
    book: {
      ...book,
      bonds: book.bonds.map((row) => (row.id === bond.id ? { ...row, updatedAt: createdAt } : row)),
      ledger: [...book.ledger, entry],
    },
  };
}

function idsMatch(clubId: string, teamId: string, aliases: readonly string[]): boolean {
  return clubId === teamId || aliases.includes(clubId);
}

/** Null when this match is not a direct meeting of the two clubs. */
export function scoreRealHeadToHead(input: {
  clubAId: string;
  clubBId: string;
  homeTeamId: string;
  awayTeamId: string;
  homeAliasIds?: readonly string[];
  awayAliasIds?: readonly string[];
  homeScore: number;
  awayScore: number;
}): { pointsA: number; pointsB: number } | null {
  const homeAlias = input.homeAliasIds ?? [];
  const awayAlias = input.awayAliasIds ?? [];
  const homeIsA = idsMatch(input.clubAId, input.homeTeamId, homeAlias);
  const homeIsB = idsMatch(input.clubBId, input.homeTeamId, homeAlias);
  const awayIsA = idsMatch(input.clubAId, input.awayTeamId, awayAlias);
  const awayIsB = idsMatch(input.clubBId, input.awayTeamId, awayAlias);
  const aIsHome = homeIsA && awayIsB && !homeIsB && !awayIsA;
  const bIsHome = homeIsB && awayIsA && !homeIsA && !awayIsB;
  if (!aIsHome && !bIsHome) return null;
  if (!Number.isInteger(input.homeScore) || !Number.isInteger(input.awayScore)) return null;
  if (input.homeScore < 0 || input.awayScore < 0 || input.homeScore > 30 || input.awayScore > 30) return null;
  if (input.homeScore === input.awayScore) {
    return { pointsA: RIVALRY_REAL_DRAW, pointsB: RIVALRY_REAL_DRAW };
  }
  const homeWon = input.homeScore > input.awayScore;
  const aWon = (aIsHome && homeWon) || (bIsHome && !homeWon);
  return aWon
    ? { pointsA: RIVALRY_REAL_WIN, pointsB: 0 }
    : { pointsA: 0, pointsB: RIVALRY_REAL_WIN };
}

export function realHeadToHeadBody(input: {
  clubAName: string;
  clubBName: string;
  homeName: string;
  awayName: string;
  homeScore: number;
  awayScore: number;
  pointsA: number;
}): string {
  const line = `${input.homeName} ${input.homeScore}–${input.awayScore} ${input.awayName}`;
  if (input.pointsA === RIVALRY_REAL_DRAW) return `${line}. Draw, 1 each.`;
  const winner = input.pointsA === RIVALRY_REAL_WIN ? input.clubAName : input.clubBName;
  return `${line}. 3 to ${winner}.`;
}

/** Higher leaderboard points, then smaller |Δhome| + |Δaway|. Level is 0–0. */
export function scorePredictionDuel(
  pickA: Pick<ScorePrediction, 'homeScore' | 'awayScore'>,
  pickB: Pick<ScorePrediction, 'homeScore' | 'awayScore'>,
  result: { homeScore: number; awayScore: number },
): { pointsA: number; pointsB: number } {
  const scoredA = scorePredictionPoints(pickA, result);
  const scoredB = scorePredictionPoints(pickB, result);
  const errorA = Math.abs(pickA.homeScore - result.homeScore) + Math.abs(pickA.awayScore - result.awayScore);
  const errorB = Math.abs(pickB.homeScore - result.homeScore) + Math.abs(pickB.awayScore - result.awayScore);
  if (scoredA.points > scoredB.points || (scoredA.points === scoredB.points && errorA < errorB)) {
    return { pointsA: RIVALRY_PREDICTION_WIN, pointsB: 0 };
  }
  if (scoredB.points > scoredA.points || (scoredA.points === scoredB.points && errorB < errorA)) {
    return { pointsA: 0, pointsB: RIVALRY_PREDICTION_WIN };
  }
  return { pointsA: 0, pointsB: 0 };
}

export function predictionDuelBody(pointsA: number, pointsB: number): string {
  if (pointsA === 0 && pointsB === 0) return 'Level prediction. No points.';
  return 'Closer prediction takes 1.';
}

function predictionFor(
  predictions: readonly ScorePrediction[],
  userId: string,
  matchId: string,
  aliasIds: readonly string[],
): ScorePrediction | undefined {
  const ids = new Set([matchId, ...aliasIds]);
  const rows = predictions.filter((row) => row.userId === userId && ids.has(row.matchId));
  return rows.find((row) => row.matchId === matchId) ?? rows[0];
}

function recount(bond: RivalryBond, ledger: readonly RivalryLedgerEntry[]): RivalryBond {
  const rows = ledger.filter((row) => row.bondId === bond.id);
  return {
    ...bond,
    pointsA: rows.reduce((sum, row) => sum + row.pointsA, 0),
    pointsB: rows.reduce((sum, row) => sum + row.pointsB, 0),
  };
}

export function syncRivalryLedger(
  book: RivalryBook,
  input: {
    bondId: string;
    facts: readonly RivalryMatchFact[];
    predictions: readonly ScorePrediction[];
    now?: number;
  },
): RivalryBook {
  const bond = book.bonds.find((row) => row.id === input.bondId);
  if (!bond || bond.status !== 'active') return book;
  const now = input.now ?? Date.now();
  const known = new Set(book.ledger.filter((row) => row.bondId === bond.id && row.sourceKey).map((row) => row.sourceKey));
  const extra: RivalryLedgerEntry[] = [];
  const facts = input.facts.slice(0, RIVALRY_SYNC_LIMIT);
  facts.forEach((fact, index) => {
    if (!CLUB_ID_RE.test(fact.matchId) || !CLUB_ID_RE.test(fact.homeTeamId) || !CLUB_ID_RE.test(fact.awayTeamId)) return;
    const createdAt = new Date(now + index).toISOString();
    const realKey = `real:${fact.matchId}`;
    const real = scoreRealHeadToHead({
      clubAId: bond.clubA.clubId,
      clubBId: bond.clubB.clubId,
      homeTeamId: fact.homeTeamId,
      awayTeamId: fact.awayTeamId,
      homeAliasIds: fact.homeAliasIds,
      awayAliasIds: fact.awayAliasIds,
      homeScore: fact.homeScore,
      awayScore: fact.awayScore,
    });
    if (real && !known.has(realKey)) {
      known.add(realKey);
      const aIsHome = idsMatch(bond.clubA.clubId, fact.homeTeamId, fact.homeAliasIds);
      extra.push({
        id: newId('rl', now + index),
        bondId: bond.id,
        kind: 'real_h2h',
        matchId: fact.matchId,
        pointsA: real.pointsA,
        pointsB: real.pointsB,
        body: realHeadToHeadBody({
          clubAName: bond.clubA.name,
          clubBName: bond.clubB.name,
          homeName: aIsHome ? bond.clubA.name : bond.clubB.name,
          awayName: aIsHome ? bond.clubB.name : bond.clubA.name,
          homeScore: fact.homeScore,
          awayScore: fact.awayScore,
          pointsA: real.pointsA,
        }),
        sourceKey: realKey,
        createdAt,
      });
    }
    const pickA = predictionFor(input.predictions, bond.userA, fact.matchId, fact.aliasIds);
    const pickB = predictionFor(input.predictions, bond.userB, fact.matchId, fact.aliasIds);
    const predKey = `pred:${fact.matchId}`;
    if (pickA && pickB && !known.has(predKey)) {
      known.add(predKey);
      const scored = scorePredictionDuel(pickA, pickB, fact);
      extra.push({
        id: newId('rl', now + index + 1),
        bondId: bond.id,
        kind: 'prediction',
        matchId: fact.matchId,
        pointsA: scored.pointsA,
        pointsB: scored.pointsB,
        body: predictionDuelBody(scored.pointsA, scored.pointsB),
        sourceKey: predKey,
        createdAt,
      });
    }
  });
  if (!extra.length) return book;
  const ledger = [...book.ledger, ...extra];
  return {
    ...book,
    ledger,
    bonds: book.bonds.map((row) => (row.id === bond.id ? recount({ ...row, updatedAt: new Date(now).toISOString() }, ledger) : row)),
  };
}

export function rivalryMatchFacts(
  fixtures: readonly Fixture[],
  relatedMatchIds: (id: string) => readonly string[],
  relatedTeamIds: (id: string) => readonly string[],
  limit = RIVALRY_SYNC_LIMIT,
): RivalryMatchFact[] {
  const claimed = new Set<string>();
  const rows: { kickoff: number; fact: RivalryMatchFact }[] = [];
  for (const fixture of fixtures) {
    if (fixture.status !== 'finished') continue;
    if (!Number.isInteger(fixture.homeScore) || !Number.isInteger(fixture.awayScore)) continue;
    const aliases = uniqueIds([fixture.id, ...relatedMatchIds(fixture.id)]);
    if (aliases.some((id) => claimed.has(id))) {
      for (const id of aliases) claimed.add(id);
      continue;
    }
    for (const id of aliases) claimed.add(id);
    if (!CLUB_ID_RE.test(fixture.id)) continue;
    rows.push({
      kickoff: Date.parse(fixture.kickoff) || 0,
      fact: {
        matchId: fixture.id,
        aliasIds: aliases.filter((id) => id !== fixture.id && CLUB_ID_RE.test(id)).slice(0, 8),
        homeTeamId: fixture.homeTeamId,
        awayTeamId: fixture.awayTeamId,
        homeAliasIds: uniqueIds(relatedTeamIds(fixture.homeTeamId)).filter((id) => id !== fixture.homeTeamId && CLUB_ID_RE.test(id)).slice(0, 8),
        awayAliasIds: uniqueIds(relatedTeamIds(fixture.awayTeamId)).filter((id) => id !== fixture.awayTeamId && CLUB_ID_RE.test(id)).slice(0, 8),
        homeScore: fixture.homeScore,
        awayScore: fixture.awayScore,
      },
    });
  }
  rows.sort((a, b) => b.kickoff - a.kickoff || a.fact.matchId.localeCompare(b.fact.matchId));
  return rows.slice(0, limit).reverse().map((row) => row.fact);
}

export function bondsForUser(book: RivalryBook, userId: string): RivalryBond[] {
  return book.bonds
    .filter((bond) => bond.userA === userId || bond.userB === userId)
    .filter((bond) => bond.status === 'invite' || bond.status === 'active')
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

export function recentLedger(entries: readonly RivalryLedgerEntry[], bondId: string, limit = 40): RivalryLedgerEntry[] {
  const rows = entries
    .filter((row) => row.bondId === bondId)
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id));
  return rows.slice(-limit);
}

export function scoreboardFor(bond: RivalryBond, viewerId: string): { left: RivalrySide; right: RivalrySide } | null {
  if (viewerId !== bond.userA && viewerId !== bond.userB) return null;
  const a: RivalrySide = { userId: bond.userA, club: bond.clubA, points: bond.pointsA, you: viewerId === bond.userA };
  const b: RivalrySide = { userId: bond.userB, club: bond.clubB, points: bond.pointsB, you: viewerId === bond.userB };
  return viewerId === bond.userA ? { left: a, right: b } : { left: b, right: a };
}

export function peerOnBond(bond: RivalryBond, viewerId: string): string | null {
  if (viewerId === bond.userA) return bond.userB;
  if (viewerId === bond.userB) return bond.userA;
  return null;
}

export function ledgerPointsForViewer(entry: RivalryLedgerEntry, bond: RivalryBond, viewerId: string): { you: number; them: number } | null {
  if (viewerId === bond.userA) return { you: entry.pointsA, them: entry.pointsB };
  if (viewerId === bond.userB) return { you: entry.pointsB, them: entry.pointsA };
  return null;
}

function replaceBond(book: RivalryBook, bond: RivalryBond, entry: RivalryLedgerEntry): RivalryBook {
  if (book.ledger.some((row) => row.bondId === bond.id && row.sourceKey && row.sourceKey === entry.sourceKey)) {
    return { ...book, bonds: book.bonds.map((row) => (row.id === bond.id ? bond : row)) };
  }
  return {
    ...book,
    bonds: book.bonds.map((row) => (row.id === bond.id ? bond : row)),
    ledger: [...book.ledger, entry],
  };
}

function uniqueIds(ids: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    const trimmed = id.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asClub(value: unknown): RivalryClub | null {
  const row = asRecord(value);
  if (!row || typeof row.clubId !== 'string' || typeof row.name !== 'string' || typeof row.code !== 'string') return null;
  if (!CLUB_ID_RE.test(row.clubId)) return null;
  const crest = typeof row.crestUrl === 'string' && CREST_RE.test(row.crestUrl) ? row.crestUrl : undefined;
  return {
    clubId: row.clubId,
    name: row.name.slice(0, 80),
    code: row.code.slice(0, 8) || 'FC',
    color: typeof row.color === 'string' && HEX_RE.test(row.color) ? row.color.toUpperCase() : '#152018',
    accent: typeof row.accent === 'string' && HEX_RE.test(row.accent) ? row.accent.toUpperCase() : '#22C55E',
    ...(crest ? { crestUrl: crest } : {}),
  };
}

export function parseRivalryBook(raw: unknown): RivalryBook {
  const row = asRecord(raw);
  if (!row) return emptyRivalryBook();
  const clubs: Record<string, RivalryClub> = {};
  const clubRow = asRecord(row.clubs);
  if (clubRow) {
    for (const [userId, value] of Object.entries(clubRow)) {
      const club = asClub(value);
      if (club && userId.trim()) clubs[userId] = club;
    }
  }
  const bonds = Array.isArray(row.bonds) ? row.bonds.map(parseBond).filter((bond): bond is RivalryBond => bond != null) : [];
  const ledger = Array.isArray(row.ledger)
    ? row.ledger.map(parseLedger).filter((entry): entry is RivalryLedgerEntry => entry != null)
    : [];
  return { clubs, bonds, ledger };
}

function parseBond(value: unknown): RivalryBond | null {
  const row = asRecord(value);
  if (!row) return null;
  const clubA = asClub(row.clubA);
  const clubB = asClub(row.clubB);
  if (!clubA || !clubB || clubA.clubId === clubB.clubId) return null;
  if (typeof row.id !== 'string' || typeof row.userA !== 'string' || typeof row.userB !== 'string') return null;
  if (row.userA >= row.userB) return null;
  if (row.status !== 'invite' && row.status !== 'active' && row.status !== 'ended') return null;
  if (typeof row.season !== 'string' || !/^[0-9]{4}\/[0-9]{2}$/.test(row.season)) return null;
  if (row.invitedBy !== row.userA && row.invitedBy !== row.userB) return null;
  if (typeof row.createdAt !== 'string' || typeof row.updatedAt !== 'string') return null;
  return {
    id: row.id,
    userA: row.userA,
    userB: row.userB,
    clubA,
    clubB,
    season: row.season,
    status: row.status,
    invitedBy: row.invitedBy,
    pointsA: typeof row.pointsA === 'number' && row.pointsA >= 0 ? row.pointsA : 0,
    pointsB: typeof row.pointsB === 'number' && row.pointsB >= 0 ? row.pointsB : 0,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function parseLedger(value: unknown): RivalryLedgerEntry | null {
  const row = asRecord(value);
  if (!row || typeof row.id !== 'string' || typeof row.bondId !== 'string' || typeof row.body !== 'string') return null;
  if (row.kind !== 'real_h2h' && row.kind !== 'prediction' && row.kind !== 'banter' && row.kind !== 'system') return null;
  if (typeof row.createdAt !== 'string') return null;
  return {
    id: row.id,
    bondId: row.bondId,
    kind: row.kind,
    ...(typeof row.matchId === 'string' ? { matchId: row.matchId } : {}),
    pointsA: typeof row.pointsA === 'number' ? row.pointsA : 0,
    pointsB: typeof row.pointsB === 'number' ? row.pointsB : 0,
    body: row.body.slice(0, 280),
    ...(typeof row.authorId === 'string' ? { authorId: row.authorId } : {}),
    ...(typeof row.sourceKey === 'string' ? { sourceKey: row.sourceKey } : {}),
    createdAt: row.createdAt,
  };
}

export function parseRemoteClub(value: unknown): { userId: string; club: RivalryClub } | null {
  const row = asRecord(value);
  if (!row || typeof row.user_id !== 'string') return null;
  const club = clubFromParts(row.club_id, row.club_name, row.club_code, row.crest_url, row.color, row.accent);
  if (!club) return null;
  return { userId: row.user_id, club };
}

export function parseRemoteBond(value: unknown): RivalryBond | null {
  const row = asRecord(value);
  if (!row || typeof row.id !== 'string') return null;
  const clubA = clubFromParts(row.club_a_id, row.club_a_name, row.club_a_code, row.club_a_crest, row.club_a_color, row.club_a_accent);
  const clubB = clubFromParts(row.club_b_id, row.club_b_name, row.club_b_code, row.club_b_crest, row.club_b_color, row.club_b_accent);
  if (!clubA || !clubB) return null;
  if (typeof row.user_a !== 'string' || typeof row.user_b !== 'string') return null;
  if (row.status !== 'invite' && row.status !== 'active' && row.status !== 'ended') return null;
  if (typeof row.season !== 'string' || typeof row.invited_by !== 'string') return null;
  return {
    id: row.id,
    userA: row.user_a,
    userB: row.user_b,
    clubA,
    clubB,
    season: row.season,
    status: row.status,
    invitedBy: row.invited_by,
    pointsA: typeof row.points_a === 'number' ? row.points_a : Number(row.points_a) || 0,
    pointsB: typeof row.points_b === 'number' ? row.points_b : Number(row.points_b) || 0,
    createdAt: typeof row.created_at === 'string' ? row.created_at : new Date(0).toISOString(),
    updatedAt: typeof row.updated_at === 'string' ? row.updated_at : new Date(0).toISOString(),
  };
}

export function parseRemoteLedger(value: unknown): RivalryLedgerEntry | null {
  const row = asRecord(value);
  if (!row || typeof row.id !== 'string' || typeof row.bond_id !== 'string') return null;
  if (row.kind !== 'real_h2h' && row.kind !== 'prediction' && row.kind !== 'banter' && row.kind !== 'system') return null;
  return {
    id: row.id,
    bondId: row.bond_id,
    kind: row.kind,
    ...(typeof row.match_id === 'string' ? { matchId: row.match_id } : {}),
    pointsA: typeof row.points_a === 'number' ? row.points_a : Number(row.points_a) || 0,
    pointsB: typeof row.points_b === 'number' ? row.points_b : Number(row.points_b) || 0,
    body: typeof row.body === 'string' ? row.body : '',
    ...(typeof row.author_id === 'string' ? { authorId: row.author_id } : {}),
    ...(typeof row.source_key === 'string' ? { sourceKey: row.source_key } : {}),
    createdAt: typeof row.created_at === 'string' ? row.created_at : new Date(0).toISOString(),
  };
}

function clubFromParts(
  id: unknown,
  name: unknown,
  code: unknown,
  crest: unknown,
  color: unknown,
  accent: unknown,
): RivalryClub | null {
  if (typeof id !== 'string' || typeof name !== 'string') return null;
  return clubFromTeam({
    id,
    name,
    shortName: typeof code === 'string' ? code : '',
    code: typeof code === 'string' ? code : '',
    color: typeof color === 'string' ? color : '#152018',
    accent: typeof accent === 'string' ? accent : '#22C55E',
    logoUrl: typeof crest === 'string' ? crest : undefined,
  });
}

export function rivalryFactsPayload(facts: readonly RivalryMatchFact[]): Record<string, unknown>[] {
  return facts.slice(0, RIVALRY_SYNC_LIMIT).map((fact) => ({
    match_id: fact.matchId,
    alias_ids: fact.aliasIds,
    home_team_id: fact.homeTeamId,
    away_team_id: fact.awayTeamId,
    home_alias_ids: fact.homeAliasIds,
    away_alias_ids: fact.awayAliasIds,
    home_score: fact.homeScore,
    away_score: fact.awayScore,
  }));
}

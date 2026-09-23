/**
 * Private mini-league fantasy (v1).
 *
 * One XI per fan per gameweek, shared by every league they join.
 * Formation is fixed 4-4-2: 1 GK, 4 DF, 4 MF, 2 FW. No budget, bench, or chips.
 * Points are 5 per goal in covered fixtures. Own goals score 0.
 * Assists are not scored: API-Football events name an assist without a player id.
 */

import type { MatchEvent, MatchStatus, Player, PlayerPosition, Team, User } from '@/data/types';
import { playerIdFor } from '@/data/mocks/players';
import { LIVE_LEAGUE_IDS, MOCK_LIVE_LEAGUE_ALIASES } from '@/lib/footballCoverage';
import { initialsFromName, isPersistedUserId } from '@/lib/userIdentity';

export const FANTASY_SCHEMA_VERSION = 1;
export const FANTASY_GOAL_POINTS = 5;
export const FANTASY_MEMBER_CAP = 20;
export const FANTASY_LEAGUE_CAP = 10;
export const FANTASY_XI_SIZE = 11;
/** Missing event lists loaded from the league screen. Not a full-window prefetch. */
export const FANTASY_EVENT_FETCH_CAP = 8;

export const DEMO_FANTASY_LEAGUE_ID = 'fl-neon';
export const DEMO_FANTASY_CODE = 'NEON11';
export const DEMO_FANTASY_NAME = 'Friday XI';

/** Covered competitions: live allowlist plus the mock ids that alias onto it. */
export const FANTASY_COVERAGE_LEAGUE_IDS: readonly string[] = [
  ...LIVE_LEAGUE_IDS,
  ...MOCK_LIVE_LEAGUE_ALIASES,
];

const COVERAGE = new Set<string>(FANTASY_COVERAGE_LEAGUE_IDS);

const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const FANTASY_FORMATION: readonly PlayerPosition[] = [
  'GK',
  'DF',
  'DF',
  'DF',
  'DF',
  'MF',
  'MF',
  'MF',
  'MF',
  'FW',
  'FW',
];

export interface FantasyLeague {
  id: string;
  name: string;
  inviteCode: string;
  ownerId: string;
  createdAt: string;
}

export interface FantasyMember {
  leagueId: string;
  userId: string;
  joinedAt: string;
}

export interface FantasySlot {
  pos: PlayerPosition;
  playerId: string;
  playerName: string;
  teamId: string;
}

/** One saved XI. `gameweekId` is the Friday (UTC) that opens the window, `YYYY-MM-DD`. */
export interface FantasyPick {
  userId: string;
  gameweekId: string;
  slots: FantasySlot[];
  updatedAt: string;
}

export interface FantasySnapshot {
  leagues: FantasyLeague[];
  members: FantasyMember[];
  picks: FantasyPick[];
}

export interface GameweekWindow {
  id: string;
  startsAt: string;
  endsAt: string;
}

export interface GameweekDeadline {
  deadlineAt: string | null;
  locked: boolean;
}

export type FantasyScoreFixture = {
  leagueId: string;
  kickoff: string;
  status: MatchStatus;
  events: Array<Pick<MatchEvent, 'type' | 'playerId' | 'detail'>>;
};

export interface FantasyGoalLine {
  playerId: string;
  playerName: string;
  goals: number;
  points: number;
}

export interface FantasyScore {
  points: number;
  goals: number;
  lines: FantasyGoalLine[];
}

export interface FantasyStanding {
  userId: string;
  rank: number;
  points: number;
  goals: number;
  name: string;
  handle: string;
  initials: string;
  avatarColor: string;
  isCurrentUser: boolean;
  hasXi: boolean;
}

export const EMPTY_FANTASY_SNAPSHOT: FantasySnapshot = {
  leagues: [],
  members: [],
  picks: [],
};

export function isFantasyCoverageLeague(leagueId: string): boolean {
  return COVERAGE.has(leagueId);
}

/** Friday 00:00 UTC through the next Friday 00:00 UTC. */
export function gameweekContaining(now: Date): GameweekWindow {
  const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const daysSinceFriday = (now.getUTCDay() + 2) % 7;
  const startMs = midnight - daysSinceFriday * 86_400_000;
  const start = new Date(startMs);
  const end = new Date(startMs + 7 * 86_400_000);
  return {
    id: start.toISOString().slice(0, 10),
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
  };
}

export function isGameweekId(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.getTime())) return false;
  if (date.toISOString().slice(0, 10) !== value) return false;
  return date.getUTCDay() === 5;
}

export function fantasyLockLabel(
  deadline: GameweekDeadline,
  formatKickoff: (iso: string) => string,
): string {
  if (deadline.locked && deadline.deadlineAt) {
    return `Locked at the first covered kickoff (${formatKickoff(deadline.deadlineAt)}).`;
  }
  if (deadline.deadlineAt) {
    return `Locks at the first covered kickoff (${formatKickoff(deadline.deadlineAt)}).`;
  }
  if (deadline.locked) return 'This gameweek has ended.';
  return 'No covered kickoff in this window yet. Your XI stays open until one appears.';
}

export function gameweekLabel(id: string): string {
  if (!isGameweekId(id)) return 'Gameweek';
  const [year, month, day] = id.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const label = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return `Gameweek · ${label}`;
}

function inWindow(kickoff: string, gw: GameweekWindow): boolean {
  return kickoff >= gw.startsAt && kickoff < gw.endsAt;
}

/**
 * Fixtures in this gameweek whose events are not cached yet, limited to clubs
 * someone in the league has picked. Caller should fetch each id at most once per visit.
 */
export function fantasyEventFetchIds(
  fixtures: ReadonlyArray<{
    id: string;
    leagueId: string;
    kickoff: string;
    status: MatchStatus;
    homeTeamId: string;
    awayTeamId: string;
    events: readonly unknown[];
  }>,
  teamIds: ReadonlySet<string>,
  gw: GameweekWindow,
  cap = FANTASY_EVENT_FETCH_CAP,
): string[] {
  if (teamIds.size === 0 || cap <= 0) return [];
  return fixtures
    .filter(
      (fixture) =>
        isFantasyCoverageLeague(fixture.leagueId) &&
        inWindow(fixture.kickoff, gw) &&
        fixture.status !== 'upcoming' &&
        fixture.events.length === 0 &&
        (teamIds.has(fixture.homeTeamId) || teamIds.has(fixture.awayTeamId)),
    )
    .sort((a, b) => b.kickoff.localeCompare(a.kickoff))
    .slice(0, cap)
    .map((fixture) => fixture.id);
}

/** Lock at the first covered kickoff in the window. No kickoff yet → open until the window ends. */
export function gameweekDeadline(
  fixtures: ReadonlyArray<Pick<FantasyScoreFixture, 'leagueId' | 'kickoff'>>,
  gw: GameweekWindow,
  now: Date,
): GameweekDeadline {
  let deadlineAt: string | null = null;
  for (const fixture of fixtures) {
    if (!isFantasyCoverageLeague(fixture.leagueId)) continue;
    if (!inWindow(fixture.kickoff, gw)) continue;
    if (!deadlineAt || fixture.kickoff < deadlineAt) deadlineAt = fixture.kickoff;
  }
  const nowIso = now.toISOString();
  if (deadlineAt) return { deadlineAt, locked: nowIso >= deadlineAt };
  return { deadlineAt: null, locked: nowIso >= gw.endsAt };
}

export function isOwnGoal(detail: string | undefined): boolean {
  return /own\s*goal/i.test(detail ?? '');
}

export function scoreFantasyXi(
  slots: readonly FantasySlot[],
  fixtures: readonly FantasyScoreFixture[],
  gw: GameweekWindow,
): FantasyScore {
  const byId = new Map(slots.map((slot) => [slot.playerId, slot]));
  const goals = new Map<string, number>();
  for (const fixture of fixtures) {
    if (!isFantasyCoverageLeague(fixture.leagueId)) continue;
    if (!inWindow(fixture.kickoff, gw)) continue;
    if (fixture.status === 'upcoming') continue;
    for (const event of fixture.events) {
      if (event.type !== 'goal' || !event.playerId) continue;
      if (!byId.has(event.playerId)) continue;
      if (isOwnGoal(event.detail)) continue;
      goals.set(event.playerId, (goals.get(event.playerId) ?? 0) + 1);
    }
  }
  const lines: FantasyGoalLine[] = [];
  let totalGoals = 0;
  for (const slot of slots) {
    const count = goals.get(slot.playerId) ?? 0;
    if (count === 0) continue;
    totalGoals += count;
    lines.push({
      playerId: slot.playerId,
      playerName: slot.playerName,
      goals: count,
      points: count * FANTASY_GOAL_POINTS,
    });
  }
  lines.sort((a, b) => b.goals - a.goals || a.playerName.localeCompare(b.playerName));
  return { points: totalGoals * FANTASY_GOAL_POINTS, goals: totalGoals, lines };
}

export function cleanLeagueName(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 40) return null;
  return name;
}

export function cleanInviteCode(raw: string): string | null {
  const code = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!/^[A-Z0-9]{6}$/.test(code)) return null;
  return code;
}

export function makeInviteCode(random: () => number = Math.random): string {
  let code = '';
  for (let i = 0; i < 6; i += 1) {
    code += INVITE_ALPHABET[Math.floor(random() * INVITE_ALPHABET.length)] ?? 'A';
  }
  return code;
}

export function makeFantasyLeagueId(random: () => number = Math.random): string {
  const chunk = () => Math.floor(random() * 0x1_0000_0000).toString(16).padStart(8, '0');
  return `fl_${chunk()}${chunk()}`;
}

export function blankXi(): Array<FantasySlot | null> {
  return FANTASY_FORMATION.map(() => null);
}

export function slotsFromDraft(draft: ReadonlyArray<FantasySlot | null>): FantasySlot[] | null {
  if (draft.length !== FANTASY_XI_SIZE) return null;
  const slots: FantasySlot[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < FANTASY_FORMATION.length; i += 1) {
    const slot = draft[i];
    const pos = FANTASY_FORMATION[i];
    if (!slot || slot.pos !== pos) return null;
    if (!slot.playerId || !slot.playerName || !slot.teamId) return null;
    if (seen.has(slot.playerId)) return null;
    seen.add(slot.playerId);
    slots.push({
      pos,
      playerId: slot.playerId,
      playerName: slot.playerName,
      teamId: slot.teamId,
    });
  }
  return slots;
}

export function draftFromPick(pick: FantasyPick | undefined): Array<FantasySlot | null> {
  if (!pick) return blankXi();
  const ordered = orderSlots(pick.slots);
  return ordered ?? blankXi();
}

export function orderSlots(slots: readonly FantasySlot[]): FantasySlot[] | null {
  if (slots.length !== FANTASY_XI_SIZE) return null;
  const buckets: Record<PlayerPosition, FantasySlot[]> = { GK: [], DF: [], MF: [], FW: [] };
  const seen = new Set<string>();
  for (const slot of slots) {
    if (!slot.playerId || seen.has(slot.playerId)) return null;
    if (slot.pos !== 'GK' && slot.pos !== 'DF' && slot.pos !== 'MF' && slot.pos !== 'FW') return null;
    seen.add(slot.playerId);
    buckets[slot.pos].push({ ...slot });
  }
  if (buckets.GK.length !== 1 || buckets.DF.length !== 4 || buckets.MF.length !== 4 || buckets.FW.length !== 2) {
    return null;
  }
  return [...buckets.GK, ...buckets.DF, ...buckets.MF, ...buckets.FW];
}

export function fantasyClubs(getTeams: (leagueId?: string) => Team[]): Team[] {
  const seen = new Set<string>();
  const clubs: Team[] = [];
  for (const leagueId of FANTASY_COVERAGE_LEAGUE_IDS) {
    for (const team of getTeams(leagueId)) {
      if (seen.has(team.id)) continue;
      seen.add(team.id);
      clubs.push(team);
    }
  }
  clubs.sort((a, b) => a.name.localeCompare(b.name));
  return clubs;
}

export function fantasyEligibleTeamIds(getTeams: (leagueId?: string) => Team[]): Set<string> {
  return new Set(fantasyClubs(getTeams).map((team) => team.id));
}

export function playersForFantasySlot(
  players: readonly Player[],
  eligibleTeamIds: ReadonlySet<string>,
  pos: PlayerPosition,
  query: string,
  taken: ReadonlySet<string>,
): Player[] {
  const needle = query.trim().toLowerCase();
  return players
    .filter((player) => player.pos === pos && eligibleTeamIds.has(player.teamId) && !taken.has(player.id))
    .filter((player) => {
      if (!needle) return true;
      return (
        player.name.toLowerCase().includes(needle) ||
        player.shortName.toLowerCase().includes(needle) ||
        String(player.number).includes(needle)
      );
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function parseFantasySlot(value: unknown): FantasySlot | null {
  if (!isPlainObject(value)) return null;
  const pos = value.pos;
  const playerId = asString(value.playerId);
  const playerName = asString(value.playerName);
  const teamId = asString(value.teamId);
  if (pos !== 'GK' && pos !== 'DF' && pos !== 'MF' && pos !== 'FW') return null;
  if (!playerId || !playerName || !teamId) return null;
  if (playerId.length > 80 || playerName.length > 80 || teamId.length > 80) return null;
  return { pos, playerId, playerName, teamId };
}

export function parseFantasyPick(value: unknown): FantasyPick | null {
  if (!isPlainObject(value)) return null;
  const userId = asString(value.userId) ?? asString(value.user_id);
  const gameweekId = asString(value.gameweekId) ?? asString(value.gameweek_id);
  if (!userId || !isPersistedUserId(userId) || !gameweekId || !isGameweekId(gameweekId)) return null;
  const rawSlots = value.slots;
  if (!Array.isArray(rawSlots)) return null;
  const slots = rawSlots.map(parseFantasySlot);
  if (slots.some((slot) => slot == null)) return null;
  const ordered = orderSlots(slots as FantasySlot[]);
  if (!ordered) return null;
  const updatedAt = asString(value.updatedAt) ?? asString(value.updated_at) ?? new Date(0).toISOString();
  return { userId, gameweekId, slots: ordered, updatedAt };
}

export function parseFantasyLeague(value: unknown): FantasyLeague | null {
  if (!isPlainObject(value)) return null;
  const id = asString(value.id);
  const name = asString(value.name);
  const inviteCode = asString(value.inviteCode) ?? asString(value.invite_code);
  const ownerId = asString(value.ownerId) ?? asString(value.owner_id);
  const createdAt = asString(value.createdAt) ?? asString(value.created_at) ?? new Date(0).toISOString();
  if (!id || !name || !inviteCode || !ownerId) return null;
  if (!isPersistedUserId(ownerId)) return null;
  const code = cleanInviteCode(inviteCode);
  const cleaned = cleanLeagueName(name);
  if (!code || !cleaned) return null;
  if (id.length < 4 || id.length > 80) return null;
  return { id, name: cleaned, inviteCode: code, ownerId, createdAt };
}

export function parseFantasyMember(value: unknown): FantasyMember | null {
  if (!isPlainObject(value)) return null;
  const leagueId = asString(value.leagueId) ?? asString(value.league_id);
  const userId = asString(value.userId) ?? asString(value.user_id);
  const joinedAt = asString(value.joinedAt) ?? asString(value.joined_at) ?? new Date(0).toISOString();
  if (!leagueId || !userId || !isPersistedUserId(userId)) return null;
  return { leagueId, userId, joinedAt };
}

export function leaguesForUser(snapshot: FantasySnapshot, userId: string): FantasyLeague[] {
  const ids = new Set(snapshot.members.filter((member) => member.userId === userId).map((member) => member.leagueId));
  return snapshot.leagues.filter((league) => ids.has(league.id)).sort((a, b) => a.name.localeCompare(b.name));
}

export function membersOf(snapshot: FantasySnapshot, leagueId: string): FantasyMember[] {
  return snapshot.members
    .filter((member) => member.leagueId === leagueId)
    .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt) || a.userId.localeCompare(b.userId));
}

export function pickFor(snapshot: FantasySnapshot, userId: string, gameweekId: string): FantasyPick | undefined {
  return snapshot.picks.find((pick) => pick.userId === userId && pick.gameweekId === gameweekId);
}

export function memberCount(snapshot: FantasySnapshot, leagueId: string): number {
  return snapshot.members.filter((member) => member.leagueId === leagueId).length;
}

export function rankFantasyLeague(opts: {
  snapshot: FantasySnapshot;
  leagueId: string;
  gameweek: GameweekWindow;
  fixtures: readonly FantasyScoreFixture[];
  users: readonly User[];
  currentUserId: string;
}): FantasyStanding[] {
  const users = new Map(opts.users.map((user) => [user.id, user]));
  const rows = membersOf(opts.snapshot, opts.leagueId).map((member) => {
    const user = users.get(member.userId);
    const pick = pickFor(opts.snapshot, member.userId, opts.gameweek.id);
    const score = pick ? scoreFantasyXi(pick.slots, opts.fixtures, opts.gameweek) : { points: 0, goals: 0, lines: [] };
    const name = user?.name ?? 'Fan';
    return {
      userId: member.userId,
      rank: 0,
      points: score.points,
      goals: score.goals,
      name,
      handle: user?.handle ?? member.userId.slice(0, 8),
      initials: user?.initials ?? initialsFromName(name),
      avatarColor: user?.avatarColor ?? '#22C55E',
      isCurrentUser: member.userId === opts.currentUserId,
      hasXi: Boolean(pick),
    };
  });
  rows.sort(
    (a, b) => b.points - a.points || b.goals - a.goals || a.name.localeCompare(b.name) || a.userId.localeCompare(b.userId),
  );
  rows.forEach((row, index) => {
    row.rank = index + 1;
  });
  return rows;
}

export type FantasyMutation = { ok: true; snapshot: FantasySnapshot } | { ok: false; error: string };

function membershipCount(snapshot: FantasySnapshot, userId: string): number {
  return snapshot.members.filter((member) => member.userId === userId).length;
}

export function createFantasyLeague(
  snapshot: FantasySnapshot,
  userId: string,
  rawName: string,
  now: Date,
  random: () => number = Math.random,
): FantasyMutation {
  if (!isPersistedUserId(userId)) return { ok: false, error: 'not_authenticated' };
  const name = cleanLeagueName(rawName);
  if (!name) return { ok: false, error: 'invalid_name' };
  if (membershipCount(snapshot, userId) >= FANTASY_LEAGUE_CAP) return { ok: false, error: 'too_many_leagues' };
  const used = new Set(snapshot.leagues.map((league) => league.inviteCode));
  let inviteCode = '';
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const next = makeInviteCode(random);
    if (!used.has(next)) {
      inviteCode = next;
      break;
    }
  }
  if (!inviteCode) return { ok: false, error: 'code_exhausted' };
  const league: FantasyLeague = {
    id: makeFantasyLeagueId(random),
    name,
    inviteCode,
    ownerId: userId,
    createdAt: now.toISOString(),
  };
  return {
    ok: true,
    snapshot: {
      ...snapshot,
      leagues: [...snapshot.leagues, league],
      members: [...snapshot.members, { leagueId: league.id, userId, joinedAt: now.toISOString() }],
    },
  };
}

export function joinFantasyLeague(
  snapshot: FantasySnapshot,
  userId: string,
  rawCode: string,
  now: Date,
): FantasyMutation {
  if (!isPersistedUserId(userId)) return { ok: false, error: 'not_authenticated' };
  const code = cleanInviteCode(rawCode);
  if (!code) return { ok: false, error: 'invalid_code' };
  const league = snapshot.leagues.find((row) => row.inviteCode === code);
  if (!league) return { ok: false, error: 'league_not_found' };
  if (snapshot.members.some((member) => member.leagueId === league.id && member.userId === userId)) {
    return { ok: true, snapshot };
  }
  if (memberCount(snapshot, league.id) >= FANTASY_MEMBER_CAP) return { ok: false, error: 'league_full' };
  if (membershipCount(snapshot, userId) >= FANTASY_LEAGUE_CAP) return { ok: false, error: 'too_many_leagues' };
  return {
    ok: true,
    snapshot: {
      ...snapshot,
      members: [...snapshot.members, { leagueId: league.id, userId, joinedAt: now.toISOString() }],
    },
  };
}

export function saveFantasyPick(
  snapshot: FantasySnapshot,
  userId: string,
  gameweekId: string,
  draft: ReadonlyArray<FantasySlot | null>,
  locked: boolean,
  now: Date,
): FantasyMutation {
  if (!isPersistedUserId(userId)) return { ok: false, error: 'not_authenticated' };
  if (!isGameweekId(gameweekId)) return { ok: false, error: 'invalid_gameweek' };
  if (locked) return { ok: false, error: 'gameweek_locked' };
  if (!snapshot.members.some((member) => member.userId === userId)) return { ok: false, error: 'invalid_xi' };
  const slots = slotsFromDraft(draft);
  if (!slots) return { ok: false, error: 'invalid_xi' };
  const pick: FantasyPick = { userId, gameweekId, slots, updatedAt: now.toISOString() };
  const picks = snapshot.picks.filter((row) => !(row.userId === userId && row.gameweekId === gameweekId));
  return { ok: true, snapshot: { ...snapshot, picks: [...picks, pick] } };
}

function slot(teamId: string, number: number, pos: PlayerPosition, playerName: string): FantasySlot {
  return { pos, playerId: playerIdFor(teamId, number), playerName, teamId };
}

/** Seeded Friday XI so demo standings have goals without an email account. */
export function demoFantasySeed(now: Date): FantasySnapshot {
  const gw = gameweekContaining(now);
  const createdAt = gw.startsAt;
  const maya: FantasySlot[] = [
    slot('liv', 1, 'GK', 'Alisson'),
    slot('liv', 4, 'DF', 'van Dijk'),
    slot('liv', 66, 'DF', 'Alexander-Arnold'),
    slot('liv', 26, 'DF', 'Robertson'),
    slot('liv', 5, 'DF', 'Konaté'),
    slot('liv', 8, 'MF', 'Szoboszlai'),
    slot('liv', 10, 'MF', 'Mac Allister'),
    slot('liv', 38, 'MF', 'Gravenberch'),
    slot('liv', 17, 'MF', 'Jones'),
    slot('liv', 11, 'FW', 'Salah'),
    slot('liv', 9, 'FW', 'Núñez'),
  ];
  const jordan: FantasySlot[] = [
    slot('mci', 31, 'GK', 'Ederson'),
    slot('mci', 3, 'DF', 'Dias'),
    slot('mci', 25, 'DF', 'Akanji'),
    slot('mci', 24, 'DF', 'Gvardiol'),
    slot('mci', 82, 'DF', 'Lewis'),
    slot('mci', 16, 'MF', 'Rodri'),
    slot('mci', 17, 'MF', 'De Bruyne'),
    slot('mci', 20, 'MF', 'Bernardo'),
    slot('che', 20, 'MF', 'Palmer'),
    slot('mci', 9, 'FW', 'Haaland'),
    slot('mci', 47, 'FW', 'Foden'),
  ];
  const omar: FantasySlot[] = [
    slot('rma', 1, 'GK', 'Courtois'),
    slot('rma', 22, 'DF', 'Rüdiger'),
    slot('rma', 3, 'DF', 'Militão'),
    slot('rma', 23, 'DF', 'Mendy'),
    slot('rma', 2, 'DF', 'Carvajal'),
    slot('rma', 8, 'MF', 'Valverde'),
    slot('rma', 14, 'MF', 'Tchouaméni'),
    slot('rma', 5, 'MF', 'Bellingham'),
    slot('bar', 8, 'MF', 'Pedri'),
    slot('rma', 7, 'FW', 'Vinícius Jr'),
    slot('bar', 19, 'FW', 'Yamal'),
  ];
  return {
    leagues: [
      {
        id: DEMO_FANTASY_LEAGUE_ID,
        name: DEMO_FANTASY_NAME,
        inviteCode: DEMO_FANTASY_CODE,
        ownerId: 'maya',
        createdAt,
      },
    ],
    members: [
      { leagueId: DEMO_FANTASY_LEAGUE_ID, userId: 'maya', joinedAt: createdAt },
      { leagueId: DEMO_FANTASY_LEAGUE_ID, userId: 'jordan', joinedAt: createdAt },
      { leagueId: DEMO_FANTASY_LEAGUE_ID, userId: 'omar', joinedAt: createdAt },
    ],
    picks: [
      { userId: 'maya', gameweekId: gw.id, slots: maya, updatedAt: createdAt },
      { userId: 'jordan', gameweekId: gw.id, slots: jordan, updatedAt: createdAt },
      { userId: 'omar', gameweekId: gw.id, slots: omar, updatedAt: createdAt },
    ],
  };
}

/**
 * Demo devices always include Friday XI.
 * A fan's own saved XI wins over the seed. Other fans' seed XIs follow the current gameweek.
 */
export function withDemoSeed(snapshot: FantasySnapshot, userId: string, now: Date): FantasySnapshot {
  const seed = demoFantasySeed(now);
  const leagues = snapshot.leagues.some((league) => league.id === DEMO_FANTASY_LEAGUE_ID)
    ? snapshot.leagues
    : [...seed.leagues, ...snapshot.leagues];
  const members = [...snapshot.members];
  for (const member of seed.members) {
    if (!members.some((row) => row.leagueId === member.leagueId && row.userId === member.userId)) {
      members.push(member);
    }
  }
  if (
    isPersistedUserId(userId) &&
    !members.some((member) => member.leagueId === DEMO_FANTASY_LEAGUE_ID && member.userId === userId)
  ) {
    members.push({ leagueId: DEMO_FANTASY_LEAGUE_ID, userId, joinedAt: now.toISOString() });
  }
  const gw = gameweekContaining(now);
  const picks = snapshot.picks.filter((pick) => !(pick.gameweekId === gw.id && seed.picks.some((row) => row.userId === pick.userId && pick.userId !== userId)));
  for (const seeded of seed.picks) {
    if (seeded.userId === userId && picks.some((pick) => pick.userId === userId && pick.gameweekId === gw.id)) {
      continue;
    }
    if (picks.some((pick) => pick.userId === seeded.userId && pick.gameweekId === seeded.gameweekId)) continue;
    picks.push(seeded);
  }
  return { leagues, members, picks };
}

export function parseFantasySnapshot(value: unknown): FantasySnapshot {
  if (!isPlainObject(value)) return EMPTY_FANTASY_SNAPSHOT;
  const leagues = Array.isArray(value.leagues) ? value.leagues.map(parseFantasyLeague).filter((row): row is FantasyLeague => row != null) : [];
  const members = Array.isArray(value.members) ? value.members.map(parseFantasyMember).filter((row): row is FantasyMember => row != null) : [];
  const picks = Array.isArray(value.picks) ? value.picks.map(parseFantasyPick).filter((row): row is FantasyPick => row != null) : [];
  const leagueIds = new Set(leagues.map((league) => league.id));
  return {
    leagues,
    members: members.filter((member) => leagueIds.has(member.leagueId)),
    picks,
  };
}

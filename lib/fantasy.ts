/**
 * Private mini-league fantasy.
 *
 * A league is one competition and one season (Premier League, Championship,
 * Niké Liga, or La Liga). The gameweek is that competition’s API-Football round.
 * One XI per member per round: 1 GK, at least 3 DEF, at least 3 MID, at least 1 FWD,
 * 11 players, at most 3 from the same club. No budget, bench, or chips.
 * Full time only: 4 per goal, 3 per assist when the event has an assist player id.
 */

import type { MatchStatus, Player, PlayerPosition, Team, User } from '@/data/types';
import { LIVE_LEAGUE_IDS, liveLeagueName } from '@/lib/footballCoverage';
import { canonicalLeagueId } from '@/services/footballMap';
import { initialsFromName, isPersistedUserId } from '@/lib/userIdentity';

export const FANTASY_GOAL_POINTS = 4;
export const FANTASY_ASSIST_POINTS = 3;
export const FANTASY_MEMBER_CAP = 20;
export const FANTASY_LEAGUE_CAP = 10;
export const FANTASY_XI_SIZE = 11;
export const FANTASY_CLUB_CAP = 3;
export const FANTASY_EVENT_FETCH_CAP = 8;

export const FANTASY_COMPETITION_IDS: readonly string[] = [...LIVE_LEAGUE_IDS];

const COMPETITIONS = new Set<string>(FANTASY_COMPETITION_IDS);
const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export interface FantasyLeague {
  id: string;
  name: string;
  inviteCode: string;
  ownerId: string;
  competitionId: string;
  season: number;
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
  number: number;
}

/** One XI for this league’s round. `roundId` is the API-Football round label. */
export interface FantasyPick {
  leagueId: string;
  userId: string;
  roundId: string;
  slots: FantasySlot[];
  updatedAt: string;
}

export interface FantasyRoundPoints {
  leagueId: string;
  userId: string;
  roundId: string;
  points: number;
  goals: number;
  assists: number;
}

export interface FantasySnapshot {
  leagues: FantasyLeague[];
  members: FantasyMember[];
  picks: FantasyPick[];
  points: FantasyRoundPoints[];
}

export const EMPTY_FANTASY_SNAPSHOT: FantasySnapshot = {
  leagues: [],
  members: [],
  picks: [],
  points: [],
};

export type FantasyScoreEvent = {
  type: string;
  playerId?: string;
  assistPlayerId?: string;
  ownGoal?: boolean;
  detail?: string;
};

export type FantasyFixtureRef = {
  id: string;
  leagueId: string;
  season?: number;
  round?: string;
  kickoff: string;
  status: MatchStatus;
  homeTeamId: string;
  awayTeamId: string;
  events: readonly FantasyScoreEvent[];
};

export interface FantasyGameweek {
  roundId: string;
  deadlineAt: string | null;
  locked: boolean;
}

export interface FantasyScoreLine {
  playerId: string;
  playerName: string;
  goals: number;
  assists: number;
  points: number;
}

export interface FantasyScore {
  points: number;
  goals: number;
  assists: number;
  lines: FantasyScoreLine[];
}

export interface FantasyStanding {
  userId: string;
  rank: number;
  gwPoints: number;
  total: number;
  goals: number;
  assists: number;
  name: string;
  handle: string;
  initials: string;
  avatarColor: string;
  isCurrentUser: boolean;
  hasXi: boolean;
}

export function isFantasyCompetition(id: string): boolean {
  return COMPETITIONS.has(id);
}

export function competitionLabel(id: string): string {
  return liveLeagueName(id);
}

export function seasonLabel(season: number): string {
  return `${season}/${String(season + 1).slice(2)}`;
}

export function isRoundId(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length >= 1 && trimmed.length <= 80 && !/[\n\r]/.test(trimmed);
}

export function isSeasonYear(value: number): boolean {
  return Number.isInteger(value) && value >= 2020 && value <= 2035;
}

function sameCompetition(fixtureLeagueId: string, competitionId: string): boolean {
  return fixtureLeagueId === competitionId || canonicalLeagueId(fixtureLeagueId) === competitionId;
}

function inSeason(fixture: FantasyFixtureRef, season: number): boolean {
  return fixture.season == null || fixture.season === season;
}

export function fixturesForLeague(
  fixtures: readonly FantasyFixtureRef[],
  competitionId: string,
  season: number,
): FantasyFixtureRef[] {
  return fixtures.filter(
    (fixture) =>
      sameCompetition(fixture.leagueId, competitionId) && inSeason(fixture, season) && Boolean(fixture.round?.trim()),
  );
}

function earliestUpcoming(fixtures: readonly FantasyFixtureRef[]): string | null {
  let deadline: string | null = null;
  for (const fixture of fixtures) {
    if (fixture.status !== 'upcoming') continue;
    if (!deadline || fixture.kickoff < deadline) deadline = fixture.kickoff;
  }
  return deadline;
}

/**
 * The open round is the one whose next not-started kickoff is soonest.
 * If every loaded fixture has started, the latest round stays on screen so FT points can show.
 */
export function selectGameweek(
  fixtures: readonly FantasyFixtureRef[],
  competitionId: string,
  season: number,
  now: Date,
): FantasyGameweek | null {
  const mine = fixturesForLeague(fixtures, competitionId, season);
  const byRound = new Map<string, FantasyFixtureRef[]>();
  for (const fixture of mine) {
    const roundId = fixture.round?.trim();
    if (!roundId) continue;
    const list = byRound.get(roundId) ?? [];
    list.push(fixture);
    byRound.set(roundId, list);
  }
  if (byRound.size === 0) return null;

  let open: { roundId: string; deadlineAt: string } | null = null;
  let latest: { roundId: string; kickoff: string } | null = null;
  for (const [roundId, rows] of byRound) {
    const deadlineAt = earliestUpcoming(rows);
    if (deadlineAt && (!open || deadlineAt < open.deadlineAt)) open = { roundId, deadlineAt };
    for (const row of rows) {
      if (!latest || row.kickoff > latest.kickoff) latest = { roundId, kickoff: row.kickoff };
    }
  }
  if (open) {
    return { roundId: open.roundId, deadlineAt: open.deadlineAt, locked: now.toISOString() >= open.deadlineAt };
  }
  if (!latest) return null;
  return { roundId: latest.roundId, deadlineAt: null, locked: true };
}

export function deadlineCountdown(deadlineAt: string | null, locked: boolean, now: Date): string {
  if (locked && !deadlineAt) return 'Picks are frozen. This round has kicked off.';
  if (!deadlineAt) return 'No kickoff in this round yet.';
  const ms = Date.parse(deadlineAt) - now.getTime();
  if (locked || ms <= 0) return 'Picks are frozen. The first kickoff has passed.';
  const minutes = Math.max(1, Math.floor(ms / 60_000));
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `Locks in ${days}d ${hours % 24}h`;
  if (hours > 0) return `Locks in ${hours}h ${minutes % 60}m`;
  return `Locks in ${minutes}m`;
}

export function isOwnGoal(event: FantasyScoreEvent): boolean {
  return event.ownGoal === true || /own\s*goal/i.test(event.detail ?? '');
}

export function scoreFantasyXi(
  slots: readonly FantasySlot[],
  fixtures: readonly FantasyFixtureRef[],
  roundId: string,
): FantasyScore {
  const byId = new Map(slots.map((slot) => [slot.playerId, slot]));
  const goals = new Map<string, number>();
  const assists = new Map<string, number>();
  for (const fixture of fixtures) {
    if (fixture.round?.trim() !== roundId) continue;
    if (fixture.status !== 'finished') continue;
    for (const event of fixture.events) {
      if (event.type !== 'goal') continue;
      if (isOwnGoal(event)) continue;
      if (event.playerId && byId.has(event.playerId)) {
        goals.set(event.playerId, (goals.get(event.playerId) ?? 0) + 1);
      }
      if (event.assistPlayerId && byId.has(event.assistPlayerId)) {
        assists.set(event.assistPlayerId, (assists.get(event.assistPlayerId) ?? 0) + 1);
      }
    }
  }
  const lines: FantasyScoreLine[] = [];
  let totalGoals = 0;
  let totalAssists = 0;
  for (const slot of slots) {
    const goalCount = goals.get(slot.playerId) ?? 0;
    const assistCount = assists.get(slot.playerId) ?? 0;
    if (goalCount === 0 && assistCount === 0) continue;
    totalGoals += goalCount;
    totalAssists += assistCount;
    lines.push({
      playerId: slot.playerId,
      playerName: slot.playerName,
      goals: goalCount,
      assists: assistCount,
      points: goalCount * FANTASY_GOAL_POINTS + assistCount * FANTASY_ASSIST_POINTS,
    });
  }
  lines.sort((a, b) => b.points - a.points || a.playerName.localeCompare(b.playerName));
  return {
    points: totalGoals * FANTASY_GOAL_POINTS + totalAssists * FANTASY_ASSIST_POINTS,
    goals: totalGoals,
    assists: totalAssists,
    lines,
  };
}

export function fantasyEventFetchIds(
  fixtures: readonly FantasyFixtureRef[],
  roundId: string,
  teamIds: ReadonlySet<string>,
  cap = FANTASY_EVENT_FETCH_CAP,
): string[] {
  if (teamIds.size === 0 || cap <= 0) return [];
  return fixtures
    .filter(
      (fixture) =>
        fixture.round?.trim() === roundId &&
        fixture.status !== 'upcoming' &&
        fixture.events.length === 0 &&
        (teamIds.has(fixture.homeTeamId) || teamIds.has(fixture.awayTeamId)),
    )
    .sort((a, b) => (a.status === 'finished' ? 0 : 1) - (b.status === 'finished' ? 0 : 1) || b.kickoff.localeCompare(a.kickoff))
    .slice(0, cap)
    .map((fixture) => fixture.id);
}

type Counts = { gk: number; df: number; mf: number; fw: number; total: number };

function countsOf(slots: readonly FantasySlot[]): Counts {
  const counts = { gk: 0, df: 0, mf: 0, fw: 0, total: slots.length };
  for (const slot of slots) {
    if (slot.pos === 'GK') counts.gk += 1;
    else if (slot.pos === 'DF') counts.df += 1;
    else if (slot.pos === 'MF') counts.mf += 1;
    else if (slot.pos === 'FW') counts.fw += 1;
  }
  return counts;
}

function deficits(counts: Counts): number {
  return (
    Math.max(0, 1 - counts.gk) + Math.max(0, 3 - counts.df) + Math.max(0, 3 - counts.mf) + Math.max(0, 1 - counts.fw)
  );
}

export function canAddPosition(slots: readonly FantasySlot[], pos: PlayerPosition): boolean {
  if (slots.length >= FANTASY_XI_SIZE) return false;
  if (pos === 'GK' && countsOf(slots).gk >= 1) return false;
  const counts = countsOf(slots);
  const next = { ...counts, total: counts.total + 1 };
  if (pos === 'GK') next.gk += 1;
  if (pos === 'DF') next.df += 1;
  if (pos === 'MF') next.mf += 1;
  if (pos === 'FW') next.fw += 1;
  return FANTASY_XI_SIZE - next.total >= deficits(next);
}

export function positionsStillAllowed(slots: readonly FantasySlot[]): PlayerPosition[] {
  return (['GK', 'DF', 'MF', 'FW'] as const).filter((pos) => canAddPosition(slots, pos));
}

export function clubCount(slots: readonly FantasySlot[], teamId: string): number {
  return slots.filter((slot) => slot.teamId === teamId).length;
}

export function validateXi(slots: readonly FantasySlot[]): string | null {
  if (slots.length !== FANTASY_XI_SIZE) return 'invalid_xi';
  const seen = new Set<string>();
  const clubs = new Map<string, number>();
  for (const slot of slots) {
    if (slot.pos !== 'GK' && slot.pos !== 'DF' && slot.pos !== 'MF' && slot.pos !== 'FW') return 'invalid_xi';
    if (!slot.playerId || !slot.playerName || !slot.teamId) return 'invalid_xi';
    if (slot.playerId.length > 80 || slot.playerName.length > 80 || slot.teamId.length > 80) return 'invalid_xi';
    if (!Number.isInteger(slot.number) || slot.number < 0 || slot.number > 99) return 'invalid_xi';
    if (seen.has(slot.playerId)) return 'invalid_xi';
    seen.add(slot.playerId);
    clubs.set(slot.teamId, (clubs.get(slot.teamId) ?? 0) + 1);
  }
  for (const count of clubs.values()) {
    if (count > FANTASY_CLUB_CAP) return 'club_cap';
  }
  const counts = countsOf(slots);
  if (counts.gk !== 1 || counts.df < 3 || counts.mf < 3 || counts.fw < 1) return 'invalid_xi';
  if (counts.gk + counts.df + counts.mf + counts.fw !== FANTASY_XI_SIZE) return 'invalid_xi';
  return null;
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

export function fantasyInviteLink(code: string): string {
  return `kickfeed://fantasy/join?code=${code}`;
}

export function fantasyInviteMessage(league: Pick<FantasyLeague, 'name' | 'inviteCode' | 'competitionId' | 'season'>): string {
  return `Join ${league.name} on KickFeed Fantasy (${competitionLabel(league.competitionId)} ${seasonLabel(league.season)}). Code ${league.inviteCode}. ${fantasyInviteLink(league.inviteCode)} Free mini-league. Not betting.`;
}

export function clubsForCompetition(getTeams: (leagueId?: string) => Team[], competitionId: string): Team[] {
  const seen = new Set<string>();
  const clubs: Team[] = [];
  for (const team of getTeams(competitionId)) {
    if (seen.has(team.id)) continue;
    seen.add(team.id);
    clubs.push(team);
  }
  clubs.sort((a, b) => a.name.localeCompare(b.name));
  return clubs;
}

export function playersForFantasyAdd(
  players: readonly Player[],
  teamId: string,
  pos: PlayerPosition,
  taken: ReadonlySet<string>,
  query: string,
): Player[] {
  const needle = query.trim().toLowerCase();
  return players
    .filter((player) => player.teamId === teamId && player.pos === pos && !taken.has(player.id))
    .filter((player) => {
      if (!needle) return true;
      return player.name.toLowerCase().includes(needle) || player.shortName.toLowerCase().includes(needle);
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function parseFantasySlot(value: unknown): FantasySlot | null {
  if (!isPlainObject(value)) return null;
  const pos = value.pos;
  const playerId = asString(value.playerId);
  const playerName = asString(value.playerName);
  const teamId = asString(value.teamId);
  const number = typeof value.number === 'number' ? value.number : 0;
  if (pos !== 'GK' && pos !== 'DF' && pos !== 'MF' && pos !== 'FW') return null;
  if (!playerId || !playerName || !teamId) return null;
  if (!Number.isInteger(number) || number < 0 || number > 99) return null;
  return { pos, playerId, playerName, teamId, number };
}

export function parseFantasyPick(value: unknown): FantasyPick | null {
  if (!isPlainObject(value)) return null;
  const leagueId = asString(value.leagueId) ?? asString(value.league_id);
  const userId = asString(value.userId) ?? asString(value.user_id);
  const roundId = asString(value.roundId) ?? asString(value.round_id);
  if (!leagueId || !userId || !isPersistedUserId(userId) || !roundId || !isRoundId(roundId)) return null;
  if (!Array.isArray(value.slots)) return null;
  const slots = value.slots.map(parseFantasySlot);
  if (slots.some((slot) => slot == null)) return null;
  const xi = slots as FantasySlot[];
  if (validateXi(xi)) return null;
  return {
    leagueId,
    userId,
    roundId: roundId.trim(),
    slots: xi,
    updatedAt: asString(value.updatedAt) ?? asString(value.updated_at) ?? new Date(0).toISOString(),
  };
}

export function parseFantasyLeague(value: unknown): FantasyLeague | null {
  if (!isPlainObject(value)) return null;
  const id = asString(value.id);
  const name = asString(value.name);
  const inviteCode = asString(value.inviteCode) ?? asString(value.invite_code);
  const ownerId = asString(value.ownerId) ?? asString(value.owner_id);
  const competitionId = asString(value.competitionId) ?? asString(value.competition_id);
  const seasonRaw = value.season;
  const season = typeof seasonRaw === 'number' ? seasonRaw : Number(seasonRaw);
  const createdAt = asString(value.createdAt) ?? asString(value.created_at) ?? new Date(0).toISOString();
  if (!id || !name || !inviteCode || !ownerId || !competitionId) return null;
  if (!isPersistedUserId(ownerId) || !isFantasyCompetition(competitionId) || !isSeasonYear(season)) return null;
  const code = cleanInviteCode(inviteCode);
  const cleaned = cleanLeagueName(name);
  if (!code || !cleaned || id.length < 4 || id.length > 80) return null;
  return { id, name: cleaned, inviteCode: code, ownerId, competitionId, season, createdAt };
}

export function parseFantasyMember(value: unknown): FantasyMember | null {
  if (!isPlainObject(value)) return null;
  const leagueId = asString(value.leagueId) ?? asString(value.league_id);
  const userId = asString(value.userId) ?? asString(value.user_id);
  if (!leagueId || !userId || !isPersistedUserId(userId)) return null;
  return {
    leagueId,
    userId,
    joinedAt: asString(value.joinedAt) ?? asString(value.joined_at) ?? new Date(0).toISOString(),
  };
}

export function parseFantasyRoundPoints(value: unknown): FantasyRoundPoints | null {
  if (!isPlainObject(value)) return null;
  const leagueId = asString(value.leagueId) ?? asString(value.league_id);
  const userId = asString(value.userId) ?? asString(value.user_id);
  const roundId = asString(value.roundId) ?? asString(value.round_id);
  const points = value.points;
  const goals = value.goals;
  const assists = value.assists;
  if (!leagueId || !userId || !isPersistedUserId(userId) || !roundId || !isRoundId(roundId)) return null;
  if (typeof points !== 'number' || typeof goals !== 'number' || typeof assists !== 'number') return null;
  if (points < 0 || points > 200 || goals < 0 || goals > 50 || assists < 0 || assists > 50) return null;
  return { leagueId, userId, roundId: roundId.trim(), points, goals, assists };
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

export function pickFor(
  snapshot: FantasySnapshot,
  leagueId: string,
  userId: string,
  roundId: string,
): FantasyPick | undefined {
  return snapshot.picks.find((pick) => pick.leagueId === leagueId && pick.userId === userId && pick.roundId === roundId);
}

export function memberCount(snapshot: FantasySnapshot, leagueId: string): number {
  return snapshot.members.filter((member) => member.leagueId === leagueId).length;
}

export function rankFantasyLeague(opts: {
  snapshot: FantasySnapshot;
  leagueId: string;
  roundId: string;
  fixtures: readonly FantasyFixtureRef[];
  users: readonly User[];
  currentUserId: string;
}): FantasyStanding[] {
  const users = new Map(opts.users.map((user) => [user.id, user]));
  const rows = membersOf(opts.snapshot, opts.leagueId).map((member) => {
    const user = users.get(member.userId);
    const pick = pickFor(opts.snapshot, opts.leagueId, member.userId, opts.roundId);
    const computed = pick ? scoreFantasyXi(pick.slots, opts.fixtures, opts.roundId) : null;
    const storedRound = opts.snapshot.points.find(
      (row) => row.leagueId === opts.leagueId && row.userId === member.userId && row.roundId === opts.roundId,
    );
    const gwPoints = computed?.points ?? storedRound?.points ?? 0;
    const goals = computed?.goals ?? storedRound?.goals ?? 0;
    const assists = computed?.assists ?? storedRound?.assists ?? 0;
    const previous = opts.snapshot.points
      .filter((row) => row.leagueId === opts.leagueId && row.userId === member.userId && row.roundId !== opts.roundId)
      .reduce((sum, row) => sum + row.points, 0);
    const name = user?.name ?? 'Fan';
    return {
      userId: member.userId,
      rank: 0,
      gwPoints,
      total: previous + gwPoints,
      goals,
      assists,
      name,
      handle: user?.handle ?? member.userId.slice(0, 8),
      initials: user?.initials ?? initialsFromName(name),
      avatarColor: user?.avatarColor ?? '#22C55E',
      isCurrentUser: member.userId === opts.currentUserId,
      hasXi: Boolean(pick),
    };
  });
  rows.sort(
    (a, b) => b.total - a.total || b.gwPoints - a.gwPoints || a.name.localeCompare(b.name) || a.userId.localeCompare(b.userId),
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

export function joinFantasyLeague(snapshot: FantasySnapshot, userId: string, rawCode: string, now: Date): FantasyMutation {
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
  leagueId: string,
  roundId: string,
  slots: readonly FantasySlot[],
  locked: boolean,
  now: Date,
): FantasyMutation {
  if (!isPersistedUserId(userId)) return { ok: false, error: 'not_authenticated' };
  if (!isRoundId(roundId)) return { ok: false, error: 'invalid_round' };
  if (locked) return { ok: false, error: 'gameweek_locked' };
  if (!snapshot.members.some((member) => member.leagueId === leagueId && member.userId === userId)) {
    return { ok: false, error: 'invalid_xi' };
  }
  const xiError = validateXi(slots);
  if (xiError) return { ok: false, error: xiError };
  const pick: FantasyPick = {
    leagueId,
    userId,
    roundId: roundId.trim(),
    slots: slots.map((slot) => ({ ...slot })),
    updatedAt: now.toISOString(),
  };
  const picks = snapshot.picks.filter(
    (row) => !(row.leagueId === leagueId && row.userId === userId && row.roundId === pick.roundId),
  );
  return { ok: true, snapshot: { ...snapshot, picks: [...picks, pick] } };
}

export type ContinentId =
  | 'europe'
  | 'south-america'
  | 'north-america'
  | 'africa'
  | 'asia'
  | 'oceania';

export type LeagueType = 'league' | 'cup' | 'international';

export type MatchStatus = 'upcoming' | 'live' | 'ht' | 'finished';

export type MatchEventType = 'goal' | 'yellow' | 'red' | 'sub' | 'var';

export type FormResult = 'W' | 'D' | 'L';

export type NotificationType =
  | 'goal'
  | 'kickoff'
  | 'follow'
  | 'comment'
  | 'friend_post'
  | 'prediction'
  | 'motm'
  | 'dm'
  | 'live_circle';

export interface Continent {
  id: ContinentId;
  name: string;
  blurb: string;
}

export interface Country {
  id: string;
  name: string;
  continentId: ContinentId;
  flag: string;
}

export interface League {
  id: string;
  name: string;
  shortName: string;
  countryId: string;
  type: LeagueType;
  featured?: boolean;
  /** Competition badge. Omitted when unknown; UI falls back to a short-name chip. */
  logoUrl?: string;
}

export interface Team {
  id: string;
  name: string;
  shortName: string;
  code: string;
  color: string;
  accent: string;
  countryId: string;
  /** Crest image. Omitted when unknown; UI falls back to the colored code chip. */
  logoUrl?: string;
}

export type PlayerPosition = 'GK' | 'DF' | 'MF' | 'FW';

export interface Player {
  id: string;
  name: string;
  shortName: string;
  teamId: string;
  number: number;
  pos: PlayerPosition;
  nationality: string;
  age: number;
}

export interface PlayerStats {
  appearances: number;
  goals: number;
  assists: number;
  minutes: number;
  yellows: number;
  reds: number;
  rating: number;
}

export interface PlayerAppearance {
  fixtureId: string;
  starter: boolean;
  minutes: number;
  goals: number;
  assists: number;
  rating: number;
}

export interface MatchEvent {
  id: string;
  type: MatchEventType;
  minute: number;
  teamId: string;
  playerName: string;
  playerId?: string;
  detail?: string;
  /** Set when the goal detail is an own goal. That player does not score fantasy points. */
  ownGoal?: boolean;
  /** Assist player id from the same goal event, when the payload includes one. */
  assistPlayerId?: string;
  assistPlayerName?: string;
}

export interface SeedFixture {
  id: string;
  leagueId: string;
  homeTeamId: string;
  awayTeamId: string;
  kickoffOffsetMin: number;
  venue: string;
  events: MatchEvent[];
  finishedHome?: number;
  finishedAway?: number;
}

export interface Fixture {
  id: string;
  leagueId: string;
  homeTeamId: string;
  awayTeamId: string;
  kickoff: string;
  status: MatchStatus;
  minute?: number;
  homeScore: number;
  awayScore: number;
  events: MatchEvent[];
  venue: string;
  /** API-Football `league.round`, e.g. `Regular Season - 8`. Absent on the mock catalog. */
  round?: string;
  /** API-Football season start year. Absent on the mock catalog. */
  season?: number;
}

export interface StandingRow {
  teamId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  points: number;
  form: FormResult[];
}

export interface Scorer {
  id: string;
  playerName: string;
  playerId?: string;
  teamId: string;
  goals: number;
  assists: number;
}

export interface LineupPlayer {
  name: string;
  number: number;
  pos: PlayerPosition;
  playerId?: string;
}

export interface Lineup {
  formation: string;
  /** Starting XI. MOTM ballots from this list, not the bench. */
  players: LineupPlayer[];
  /**
   * Substitutes from the same payload.
   * Omitted when the payload did not include a bench — never a guessed list.
   */
  bench?: LineupPlayer[];
  /** Head coach when a lineup payload already included one. */
  coach?: string;
  /**
   * `sheet` — XI returned by `/fixtures/lineups`.
   * `demo` — seeded mock catalog.
   * The payload does not say provisional vs confirmed, so the match UI does not label either.
   */
  source?: 'sheet' | 'demo';
}

/** Home / away / total counts. Missing sides stay absent — never filled with a guessed 0. */
export interface SideTotals {
  home?: number;
  away?: number;
  total?: number;
}

/**
 * One competition season from `GET /teams/statistics` (or the mock catalog).
 * Shots, possession, and xG are not part of this shape.
 */
export interface TeamSeasonStats {
  teamId: string;
  leagueId: string;
  season: number;
  /** Oldest → newest. Empty when the payload omitted a form string. */
  form: FormResult[];
  played?: SideTotals;
  wins?: SideTotals;
  draws?: SideTotals;
  losses?: SideTotals;
  goalsFor?: SideTotals;
  goalsAgainst?: SideTotals;
  goalsForAverage?: SideTotals;
  goalsAgainstAverage?: SideTotals;
  cleanSheets?: SideTotals;
  failedToScore?: SideTotals;
  /** Most-used shape when the payload listed lineups. */
  formation?: string;
  /** Stadium name only when a payload we already had included one. */
  venue?: string;
  /** Coach when `/teams/statistics` named one. A cached lineup is a separate fallback — `/coachs` is not called. */
  coach?: string;
}

export interface User {
  /** Demo seed id (`maya`) or Supabase `auth.users.id` (uuid). Leaderboards use this same key. */
  id: string;
  name: string;
  handle: string;
  bio: string;
  avatarColor: string;
  initials: string;
  favoriteTeamIds: string[];
  favoriteLeagueIds: string[];
  /** Launch-geo TV market (`gbr` / `svk` / `usa`, …). Missing → device locale, else Slovakia. */
  tvCountryId?: string;
  /** Present for real Supabase accounts; omitted on seeded demo fans. */
  email?: string;
}

export type TvChannelKind = 'tv' | 'streaming';

export interface TvCountry {
  id: string;
  name: string;
  shortName: string;
  flag: string;
  timeZone: string;
  localeRegions: string[];
  timeZones: string[];
}

export interface TvChannel {
  id: string;
  name: string;
  shortName: string;
  kind: TvChannelKind;
}

export interface TvAiring {
  channel: TvChannel;
  note?: string;
}

export interface TvCountryBroadcasts {
  country: TvCountry;
  airings: TvAiring[];
}

export interface TvScheduleEntry {
  fixture: Fixture;
  airings: TvAiring[];
}

/** Compose audience. Missing on seed posts → treat as `public` for back-compat. New posts default to `friends`. */
export type PostAudience = 'friends' | 'public';

export interface Post {
  id: string;
  authorId: string;
  text: string;
  imageUri?: string;
  imageTone?: string;
  createdAt: string;
  matchId?: string;
  /** Who can see this post on Home. Omitted on older seeds → public. */
  audience?: PostAudience;
  /** Optional explicit entity tags from compose (beyond match attachment). */
  taggedTeamIds?: string[];
  taggedPlayerIds?: string[];
  taggedLeagueIds?: string[];
}

export interface Comment {
  id: string;
  matchId: string;
  authorId: string;
  text: string;
  createdAt: string;
  parentId?: string;
}

/** Per-user score pick (demo id or Supabase uuid). Locked at kickoff / once the match is live. */
export interface ScorePrediction {
  matchId: string;
  userId: string;
  homeScore: number;
  awayScore: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * One Man of the Match vote per user per match (demo id or Supabase uuid).
 * `playerKey` is the catalog player id when known, else a stable lineup key.
 */
export interface MotmVote {
  matchId: string;
  userId: string;
  playerKey: string;
  playerId?: string;
  playerName: string;
  teamId: string;
  createdAt: string;
}

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
  /** User who should see this notification (demo id or Supabase uuid). */
  recipientId: string;
  matchId?: string;
  /** Actor or related user (never equal to recipientId for self-activity). */
  userId?: string;
  /** Set when this notification came from a group chat. */
  groupId?: string;
}

export const REPORT_TARGET_TYPES = ['post', 'profile', 'comment', 'dm', 'rivalry'] as const;

export type ReportTargetType = (typeof REPORT_TARGET_TYPES)[number];

/** Report of a post, profile, match-chat message, DM, or rivalry banter. Keyed by demo id or auth uuid. */
export interface UserReport {
  id: string;
  reporterId: string;
  targetType: ReportTargetType;
  targetId: string;
  /** Author of the post/comment/DM, or the profile being reported. */
  targetUserId: string;
  reason: string;
  createdAt: string;
}

/**
 * In-app post card inside a 1:1 or group message.
 * No URL — KickFeed has no public post route to deep-link.
 */
export interface SharedPostPayload {
  postId: string;
  authorId: string;
  authorName: string;
  authorHandle: string;
  snippet: string;
  matchLabel?: string;
  /** Real match route id when the post is attached to a fixture. */
  matchId?: string;
}

/** 1:1 direct message. Keyed by demo seed id or auth.users uuid. */
export interface DirectMessage {
  id: string;
  senderId: string;
  recipientId: string;
  text: string;
  createdAt: string;
  share?: SharedPostPayload;
}

/** Group thread. Members are demo ids or auth uuids. `title` null → derive from names. */
export interface DmGroup {
  id: string;
  title: string | null;
  createdBy: string;
  memberIds: string[];
  createdAt: string;
}

/** Message in a group. Stored beside 1:1 rows when synced (same `direct_messages` table). */
export interface GroupMessage {
  id: string;
  groupId: string;
  senderId: string;
  text: string;
  createdAt: string;
  share?: SharedPostPayload;
}

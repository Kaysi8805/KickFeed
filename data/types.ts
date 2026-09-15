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

export type NotificationType = 'goal' | 'kickoff' | 'follow' | 'comment' | 'friend_post';

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
}

export interface Team {
  id: string;
  name: string;
  shortName: string;
  code: string;
  color: string;
  accent: string;
  countryId: string;
}

export interface MatchEvent {
  id: string;
  type: MatchEventType;
  minute: number;
  teamId: string;
  playerName: string;
  detail?: string;
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
  teamId: string;
  goals: number;
  assists: number;
}

export interface LineupPlayer {
  name: string;
  number: number;
  pos: 'GK' | 'DF' | 'MF' | 'FW';
}

export interface Lineup {
  formation: string;
  players: LineupPlayer[];
}

export interface User {
  id: string;
  name: string;
  handle: string;
  bio: string;
  avatarColor: string;
  initials: string;
  favoriteTeamIds: string[];
  favoriteLeagueIds: string[];
}

export interface Post {
  id: string;
  authorId: string;
  text: string;
  imageUri?: string;
  imageTone?: string;
  createdAt: string;
  matchId?: string;
}

export interface Comment {
  id: string;
  matchId: string;
  authorId: string;
  text: string;
  createdAt: string;
  parentId?: string;
}

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
  matchId?: string;
  userId?: string;
}

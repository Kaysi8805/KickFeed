import type {
  Fixture,
  FormResult,
  League,
  Lineup,
  LineupPlayer,
  MatchEvent,
  MatchEventType,
  MatchStatus,
  Player,
  PlayerPosition,
  PlayerStats,
  Scorer,
  StandingRow,
  Team,
} from '@/data/types';
import { teams as mockTeams } from '@/data/mocks/catalog';
import { apiSportsTeamLogo, leagueLogoUrl } from '@/data/mocks/teamLogos';
import { foldName } from '@/data/mocks/players';
import type {
  ApiEvent,
  ApiFixture,
  ApiLineup,
  ApiScorer,
  ApiSquadPlayer,
  ApiStandingRow,
  ApiTeamRef,
} from '@/services/footballApi';
import {
  CHAMPIONSHIP_ID,
  LA_LIGA_ID,
  PREMIER_LEAGUE_ID,
  SLOVAK_SUPER_LIGA_ID,
  countryIdForLiveLeague,
  isEnglandLiveLeagueId,
  isLiveLeagueId,
} from '@/lib/footballCoverage';

const liveLeagueSeed: League[] = [
  {
    id: PREMIER_LEAGUE_ID,
    name: 'Premier League',
    shortName: 'EPL',
    countryId: 'eng',
    type: 'league',
    featured: true,
  },
  {
    id: CHAMPIONSHIP_ID,
    name: 'Championship',
    shortName: 'EFL',
    countryId: 'eng',
    type: 'league',
    featured: true,
  },
  {
    id: SLOVAK_SUPER_LIGA_ID,
    name: 'Niké Liga',
    shortName: 'Niké Liga',
    countryId: 'svk',
    type: 'league',
    featured: true,
  },
  {
    id: LA_LIGA_ID,
    name: 'La Liga',
    shortName: 'La Liga',
    countryId: 'esp',
    type: 'league',
    featured: true,
  },
];

export const LIVE_LEAGUES: League[] = liveLeagueSeed.map((league) => {
  const logoUrl = leagueLogoUrl(league.id);
  return logoUrl ? { ...league, logoUrl } : league;
});

const LEAGUE_ALIASES: Record<string, string> = {
  epl: PREMIER_LEAGUE_ID,
  pl: PREMIER_LEAGUE_ID,
  'premier league': PREMIER_LEAGUE_ID,
  [PREMIER_LEAGUE_ID]: PREMIER_LEAGUE_ID,
  elc: CHAMPIONSHIP_ID,
  efl: CHAMPIONSHIP_ID,
  championship: CHAMPIONSHIP_ID,
  'efl championship': CHAMPIONSHIP_ID,
  [CHAMPIONSHIP_ID]: CHAMPIONSHIP_ID,
  nikeliga: SLOVAK_SUPER_LIGA_ID,
  'nike liga': SLOVAK_SUPER_LIGA_ID,
  superliga: SLOVAK_SUPER_LIGA_ID,
  'super liga': SLOVAK_SUPER_LIGA_ID,
  [SLOVAK_SUPER_LIGA_ID]: SLOVAK_SUPER_LIGA_ID,
  laliga: LA_LIGA_ID,
  'la liga': LA_LIGA_ID,
  [LA_LIGA_ID]: LA_LIGA_ID,
};

const FINISHED = new Set(['FT', 'AET', 'PEN', 'AWD', 'WO']);
const LIVE = new Set(['1H', '2H', 'ET', 'BT', 'P', 'LIVE', 'INT', 'SUSP']);
const UPCOMING = new Set(['NS', 'TBD', 'PST']);

export function canonicalLeagueId(id: string): string | undefined {
  return LEAGUE_ALIASES[id.trim().toLowerCase()] ?? LEAGUE_ALIASES[id];
}

export function leagueAliases(canonicalId: string): string[] {
  const ids = new Set<string>([canonicalId]);
  for (const [alias, id] of Object.entries(LEAGUE_ALIASES)) {
    if (id === canonicalId) ids.add(alias);
  }
  return [...ids];
}

export function isLiveEnglandLeague(id: string): boolean {
  const canonical = canonicalLeagueId(id) ?? id;
  return isEnglandLiveLeagueId(canonical);
}

export function isLiveLeague(id: string): boolean {
  const canonical = canonicalLeagueId(id) ?? id;
  return isLiveLeagueId(canonical);
}

export function liveCountryIdForLeague(leagueId: string): string {
  const canonical = canonicalLeagueId(leagueId) ?? leagueId;
  return countryIdForLiveLeague(canonical) ?? 'eng';
}

export function mapMatchStatus(short: string | null | undefined): MatchStatus | 'skip' {
  const code = (short ?? '').toUpperCase();
  if (code === 'HT') return 'ht';
  if (LIVE.has(code)) return 'live';
  if (FINISHED.has(code)) return 'finished';
  if (UPCOMING.has(code) || !code) return 'upcoming';
  if (code === 'CANC' || code === 'ABD') return 'skip';
  return 'upcoming';
}

export function mapPosition(raw: string | null | undefined): PlayerPosition {
  const value = (raw ?? '').toLowerCase();
  if (value.startsWith('g') || value.includes('goal')) return 'GK';
  if (value.startsWith('d') || value.includes('defen') || value.includes('back')) return 'DF';
  if (value.startsWith('m') || value.includes('mid')) return 'MF';
  return 'FW';
}

export function shortPlayerName(name: string): string {
  const bits = name.trim().split(/\s+/);
  return bits[bits.length - 1] || name;
}

export function mapForm(form: string | null | undefined): FormResult[] {
  if (!form) return [];
  return [...form.toUpperCase()]
    .filter((ch): ch is FormResult => ch === 'W' || ch === 'D' || ch === 'L')
    .slice(-5);
}

function hashHue(seed: string): { color: string; accent: string } {
  let n = 0;
  for (let i = 0; i < seed.length; i += 1) n = (n * 31 + seed.charCodeAt(i)) >>> 0;
  const palette = [
    ['#C8102E', '#00B2A9'],
    ['#EF0107', '#063672'],
    ['#6CABDD', '#1C2C5B'],
    ['#034694', '#DBA111'],
    ['#241F20', '#FFFFFF'],
    ['#132257', '#FFFFFF'],
    ['#7A263A', '#1BB1E7'],
    ['#FDB913', '#231F20'],
  ];
  const pair = palette[n % palette.length]!;
  return { color: pair[0], accent: pair[1] };
}

export function mockClubStyle(name: string, code?: string | null): {
  color: string;
  accent: string;
  shortName: string;
  code: string;
  mockId?: string;
} {
  const q = foldName(name);
  const byName = mockTeams.find(
    (t) => foldName(t.name) === q || foldName(t.shortName) === q || (code && t.code.toLowerCase() === code.toLowerCase()),
  );
  if (byName) {
    return {
      color: byName.color,
      accent: byName.accent,
      shortName: byName.shortName,
      code: byName.code,
      mockId: byName.id,
    };
  }
  const hues = hashHue(name);
  const tla = (code || name.replace(/[^A-Za-z]/g, '').slice(0, 3) || 'FC').toUpperCase();
  return { ...hues, shortName: name.replace(/ Football Club$/i, '').replace(/ FC$/i, ''), code: tla.slice(0, 3) };
}

function teamLogoUrl(ref: ApiTeamRef): string | undefined {
  const fromApi = ref.logo?.trim();
  if (fromApi) return fromApi;
  if (ref.id > 0) return apiSportsTeamLogo(ref.id);
  return undefined;
}

export function mapTeam(ref: ApiTeamRef, countryId = 'eng'): Team {
  const style = mockClubStyle(ref.name, ref.code);
  const logoUrl = teamLogoUrl(ref);
  return {
    id: String(ref.id),
    name: ref.name,
    shortName: style.shortName,
    code: style.code,
    color: style.color,
    accent: style.accent,
    countryId,
    ...(logoUrl ? { logoUrl } : {}),
  };
}

export function mapFixture(row: ApiFixture): Fixture | undefined {
  const status = mapMatchStatus(row.fixture.status.short);
  if (status === 'skip') return undefined;
  const venue = [row.fixture.venue?.name, row.fixture.venue?.city].filter(Boolean).join(', ');
  const live = status === 'live' || status === 'ht';
  return {
    id: String(row.fixture.id),
    leagueId: String(row.league.id),
    homeTeamId: String(row.teams.home.id),
    awayTeamId: String(row.teams.away.id),
    kickoff: row.fixture.date,
    status,
    minute: live ? (row.fixture.status.elapsed ?? undefined) : undefined,
    homeScore: row.goals.home ?? 0,
    awayScore: row.goals.away ?? 0,
    events: [],
    venue: venue || 'TBD',
  };
}

export function mapStandingRow(row: ApiStandingRow): StandingRow {
  return {
    teamId: String(row.team.id),
    played: row.all.played,
    won: row.all.win,
    drawn: row.all.draw,
    lost: row.all.lose,
    gf: row.all.goals.for,
    ga: row.all.goals.against,
    points: row.points,
    form: mapForm(row.form),
  };
}

export function mapSquadPlayer(row: ApiSquadPlayer, teamId: string, nationality = 'ENG'): Player {
  return {
    id: String(row.id),
    name: row.name,
    shortName: shortPlayerName(row.name),
    teamId,
    number: row.number ?? 0,
    pos: mapPosition(row.position),
    nationality,
    age: row.age ?? 0,
  };
}

export function mapEventType(type: string, detail?: string | null): MatchEventType | undefined {
  const t = type.toLowerCase();
  const d = (detail ?? '').toLowerCase();
  if (t === 'goal') return 'goal';
  if (t === 'card' && (d.includes('red') || d.includes('second'))) return 'red';
  if (t === 'card') return 'yellow';
  if (t === 'subst' || t === 'substitution') return 'sub';
  if (t === 'var') return 'var';
  return undefined;
}

export function mapMatchEvent(row: ApiEvent, index: number): MatchEvent | undefined {
  const kind = mapEventType(row.type, row.detail);
  if (!kind) return undefined;
  const minute = (row.time.elapsed ?? 0) + (row.time.extra ?? 0);
  const name = row.player.name || row.assist?.name || 'Unknown';
  const detail =
    kind === 'goal' && row.assist?.name
      ? `Assist: ${row.assist.name}`
      : kind === 'sub' && row.assist?.name
        ? `On for ${row.assist.name}`
        : (row.detail ?? undefined);
  return {
    id: `ev-${row.team.id}-${minute}-${index}`,
    type: kind,
    minute,
    teamId: String(row.team.id),
    playerName: name,
    playerId: row.player.id != null ? String(row.player.id) : undefined,
    detail,
  };
}

export function mapLineup(row: ApiLineup): Lineup {
  const players: LineupPlayer[] = (row.startXI ?? []).map((slot) => ({
    name: slot.player.name,
    number: slot.player.number ?? 0,
    pos: mapPosition(slot.player.pos),
    playerId: String(slot.player.id),
  }));
  return { formation: row.formation || '4-3-3', players };
}

export function mapScorer(row: ApiScorer, index: number): Scorer | undefined {
  const stats = row.statistics[0];
  if (!stats) return undefined;
  return {
    id: `sc-${row.player.id}-${index}`,
    playerName: row.player.name,
    playerId: String(row.player.id),
    teamId: String(stats.team.id),
    goals: stats.goals?.total ?? 0,
    assists: stats.goals?.assists ?? 0,
  };
}

export function mapPlayerStats(row: ApiScorer): PlayerStats | undefined {
  const stats = row.statistics[0];
  if (!stats) return undefined;
  const appearances = stats.games?.appearences ?? stats.games?.appearances ?? 0;
  const rating = Number.parseFloat(stats.games?.rating ?? '');
  return {
    appearances,
    goals: stats.goals?.total ?? 0,
    assists: stats.goals?.assists ?? 0,
    minutes: stats.games?.minutes ?? 0,
    yellows: stats.cards?.yellow ?? 0,
    reds: stats.cards?.red ?? 0,
    rating: Number.isFinite(rating) ? Number(rating.toFixed(1)) : 0,
  };
}

export function emptyLineup(): Lineup {
  return { formation: '—', players: [] };
}

export function hasLiveFixture(fixtures: Fixture[]): boolean {
  return fixtures.some((f) => f.status === 'live' || f.status === 'ht');
}

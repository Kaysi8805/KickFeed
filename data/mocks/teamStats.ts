import type { FormResult, League, SideTotals, StandingRow, TeamSeasonStats } from '@/data/types';

import { leagues, leagueRosters } from './catalog';
import { standingsFor } from './stats';

/**
 * Grounds for the mock catalog. Live Overview does not use this map — it only
 * shows a stadium when fixtures or a statistics payload already included one.
 */
const VENUES: Record<string, string> = {
  ars: 'Emirates Stadium',
  avl: 'Villa Park',
  bou: 'Vitality Stadium',
  bre: 'Gtech Community Stadium',
  bha: 'American Express Stadium',
  che: 'Stamford Bridge',
  cry: 'Selhurst Park',
  eve: 'Hill Dickinson Stadium',
  ful: 'Craven Cottage',
  ips: 'Portman Road',
  lei: 'King Power Stadium',
  liv: 'Anfield',
  mci: 'Etihad Stadium',
  mun: 'Old Trafford',
  new: "St James' Park",
  nfo: 'City Ground',
  sou: "St Mary's Stadium",
  tot: 'Tottenham Hotspur Stadium',
  whu: 'London Stadium',
  wol: 'Molineux',
  slovan: 'Tehelné pole',
  trnava: 'Štadión Antona Malatinského',
  dac: 'MOL Aréna',
  zilina: 'Štadión pod Dubňom',
  kosice: 'Košická futbalová aréna',
  ruzomberok: 'Štadión MFK Ružomberok',
  rma: 'Santiago Bernabéu',
  bar: 'Camp Nou',
  atm: 'Riyadh Air Metropolitano',
  sev: 'Ramón Sánchez-Pizjuán',
  rso: 'Reale Arena',
  bet: 'Benito Villamarín',
  vil: 'Estadio de la Cerámica',
  ath: 'San Mamés',
  val: 'Mestalla',
  gir: 'Montilivi',
  int: 'San Siro',
  mil: 'San Siro',
  juv: 'Allianz Stadium',
  nap: 'Stadio Diego Armando Maradona',
  rom: 'Stadio Olimpico',
  laz: 'Stadio Olimpico',
  ata: 'Gewiss Stadium',
  fio: 'Stadio Artemio Franchi',
  bol: 'Stadio Renato Dall\'Ara',
  nap2: 'Stadio Olimpico Grande Torino',
  bay: 'Allianz Arena',
  dor: 'Signal Iduna Park',
  lev: 'BayArena',
  rbl: 'Red Bull Arena',
  stu: 'MHPArena',
  sge: 'Deutsche Bank Park',
  wob: 'Volkswagen Arena',
  scf: 'Europa-Park Stadion',
  psg: 'Parc des Princes',
  om: 'Orange Vélodrome',
  ol: 'Groupama Stadium',
  asm: 'Stade Louis-II',
  lil: 'Stade Pierre-Mauroy',
  ren: 'Roazhon Park',
  ajax: 'Johan Cruijff ArenA',
  psv: 'Philips Stadion',
  fey: 'De Kuip',
  ben: 'Estádio da Luz',
  porto: 'Estádio do Dragão',
  scp: 'Estádio José Alvalade',
  cel: 'Celtic Park',
  rangers: 'Ibrox',
  gs: 'RAMS Park',
  fb: 'Ülker Stadyumu',
  fla: 'Maracanã',
  pal: 'Allianz Parque',
  sao: 'MorumBIS',
  fla2: 'Maracanã',
  boc: 'La Bombonera',
  riv: 'Más Monumental',
  rc: 'El Cilindro',
  nal: 'Atanasio Girardot',
  milc: 'Estadio El Campín',
  mia: 'Chase Stadium',
  laf: 'BMO Stadium',
  nyc: 'Yankee Stadium',
  sea: 'Lumen Field',
  ame: 'Estadio Azteca',
  chiv: 'Estadio Akron',
  mty: 'Estadio BBVA',
  ahl: 'Cairo International Stadium',
  zam: 'Cairo International Stadium',
  eim: 'Enyimba International Stadium',
  kan: 'Sani Abacha Stadium',
  sun: 'Loftus Versfeld',
  kfc: 'FNB Stadium',
  kaw: 'Uvance Todoroki Stadium',
  ura: 'Saitama Stadium',
  vis: 'Noevir Stadium',
  hil: 'Kingdom Arena',
  itt: 'Alinma Stadium',
  nass: 'Al-Awwal Park',
  uls: 'Ulsan Munsu Stadium',
  jhn: 'Jeonju World Cup Stadium',
  mbs: 'Mumbai Football Arena',
  moh: 'Salt Lake Stadium',
  syd: 'Allianz Stadium',
  mel: 'AAMI Park',
  wel: 'Sky Stadium',
  auc: 'Go Media Stadium',
};

const SHAPES = ['4-3-3', '4-2-3-1', '3-4-2-1', '4-4-2', '3-5-2'] as const;

function hash(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i += 1) n = (n * 31 + s.charCodeAt(i)) >>> 0;
  return n;
}

function primaryMockLeague(teamId: string): League | undefined {
  const comps = leagues.filter((league) => (leagueRosters[league.id] ?? []).includes(teamId));
  return comps.find((league) => league.featured) ?? comps[0];
}

function splitCount(total: number, homeGames: number, seed: number): SideTotals {
  if (total <= 0) return { home: 0, away: 0, total: 0 };
  const bias = 0.45 + (seed % 5) * 0.05;
  const home = Math.max(0, Math.min(total, homeGames, Math.round(total * bias)));
  return { home, away: total - home, total };
}

/**
 * Home and away results that add back to the standings row.
 * Home matches are the larger half of games played.
 */
function splitRecord(row: StandingRow, seed: number): {
  played: SideTotals;
  wins: SideTotals;
  draws: SideTotals;
  losses: SideTotals;
} {
  const homePlayed = Math.ceil(row.played / 2);
  const awayPlayed = row.played - homePlayed;
  let homeWins = Math.min(row.won, homePlayed, Math.round(row.won * (0.55 + (seed % 3) * 0.05)));
  let homeDraws = Math.min(row.drawn, homePlayed - homeWins);
  let homeLosses = homePlayed - homeWins - homeDraws;
  if (homeLosses > row.lost) {
    const overflow = homeLosses - row.lost;
    homeLosses = row.lost;
    const drawRoom = row.drawn - homeDraws;
    const toDraws = Math.min(overflow, drawRoom);
    homeDraws += toDraws;
    const toWins = Math.min(overflow - toDraws, row.won - homeWins);
    homeWins += toWins;
    homeLosses = homePlayed - homeWins - homeDraws;
  }
  return {
    played: { home: homePlayed, away: awayPlayed, total: row.played },
    wins: { home: homeWins, away: row.won - homeWins, total: row.won },
    draws: { home: homeDraws, away: row.drawn - homeDraws, total: row.drawn },
    losses: { home: homeLosses, away: row.lost - homeLosses, total: row.lost },
  };
}

function perGame(goals: number | undefined, games: number | undefined): number | undefined {
  if (goals == null || games == null || games <= 0) return undefined;
  return Math.round((goals / games) * 10) / 10;
}

function averages(goals: SideTotals, played: SideTotals): SideTotals | undefined {
  const home = perGame(goals.home, played.home);
  const away = perGame(goals.away, played.away);
  const total = perGame(goals.total, played.total);
  if (home == null && away == null && total == null) return undefined;
  return {
    ...(home != null ? { home } : {}),
    ...(away != null ? { away } : {}),
    ...(total != null ? { total } : {}),
  };
}

function seasonForm(row: StandingRow, teamId: string, leagueId: string): FormResult[] {
  const opts: FormResult[] = ['W', 'D', 'L', 'W', 'W'];
  const seed = hash(`${teamId}:${leagueId}:form`);
  const prefix: FormResult[] = Array.from({ length: 3 }, (_, i) => opts[(seed + i) % opts.length]!);
  return [...prefix, ...row.form].slice(-8);
}

/** Rich season block for Expo Go. Numbers follow the mock table so W/D/L stay consistent. */
export function teamStatsFor(teamId: string, season = 2026): TeamSeasonStats | undefined {
  const league = primaryMockLeague(teamId);
  if (!league) return undefined;
  const row = standingsFor(league.id).find((standing) => standing.teamId === teamId);
  if (!row || row.played <= 0) return undefined;
  const seed = hash(`${teamId}:${league.id}`);
  const record = splitRecord(row, seed);
  const goalsFor = splitCount(row.gf, record.played.home ?? 0, seed + 1);
  const goalsAgainst = splitCount(row.ga, record.played.home ?? 0, seed + 2);
  const cleanTotal = Math.min(row.played, Math.max(0, Math.round((row.won + row.drawn * 0.5) * 0.45)));
  const cleanSheets = splitCount(cleanTotal, record.played.home ?? 0, seed + 3);
  const failedTotal = Math.min(row.played, Math.max(0, Math.round(row.lost * 0.7 + row.drawn * 0.15)));
  const failedToScore = splitCount(failedTotal, record.played.home ?? 0, seed + 4);
  const goalsForAverage = averages(goalsFor, record.played);
  const goalsAgainstAverage = averages(goalsAgainst, record.played);
  const venue = VENUES[teamId];
  return {
    teamId,
    leagueId: league.id,
    season,
    form: seasonForm(row, teamId, league.id),
    ...record,
    goalsFor,
    goalsAgainst,
    ...(goalsForAverage ? { goalsForAverage } : {}),
    ...(goalsAgainstAverage ? { goalsAgainstAverage } : {}),
    cleanSheets,
    failedToScore,
    formation: SHAPES[seed % SHAPES.length],
    ...(venue ? { venue } : {}),
  };
}

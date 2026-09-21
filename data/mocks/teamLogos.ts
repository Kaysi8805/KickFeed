/**
 * Mock crests point at the public API-Sports media CDN.
 * `https://media.api-sports.io/football/teams/{id}.png` is a stable image URL —
 * it does not call the API and does not spend the daily request quota.
 *
 * Ids are the API-Football team/league ids (persistent across seasons), curated
 * against published team dumps. Clubs without a confident id stay chipless and
 * fall back to the colored code badge.
 */

export const API_SPORTS_MEDIA = 'https://media.api-sports.io/football';

export function apiSportsTeamLogo(apiTeamId: number): string {
  return `${API_SPORTS_MEDIA}/teams/${apiTeamId}.png`;
}

export function apiSportsLeagueLogo(apiLeagueId: number): string {
  return `${API_SPORTS_MEDIA}/leagues/${apiLeagueId}.png`;
}

/** KickFeed mock team id → API-Football team id. */
export const MOCK_TEAM_API_IDS: Record<string, number> = {
  ars: 42,
  avl: 66,
  bou: 35,
  bre: 55,
  bha: 51,
  che: 49,
  cry: 52,
  eve: 45,
  ful: 36,
  ips: 57,
  lei: 46,
  liv: 40,
  mci: 50,
  mun: 33,
  new: 34,
  nfo: 65,
  sou: 41,
  tot: 47,
  whu: 48,
  wol: 39,

  slovan: 656,
  trnava: 1120,
  dac: 2257,
  zilina: 3554,
  kosice: 10534,
  ruzomberok: 3549,

  rma: 541,
  bar: 529,
  atm: 530,
  sev: 536,
  rso: 548,
  bet: 543,
  vil: 533,
  ath: 531,
  val: 532,
  gir: 547,

  int: 505,
  mil: 489,
  juv: 496,
  nap: 492,
  rom: 497,
  laz: 487,
  ata: 499,
  fio: 502,
  bol: 500,
  nap2: 503,

  bay: 157,
  dor: 165,
  lev: 168,
  rbl: 173,
  stu: 172,
  sge: 169,
  wob: 161,
  scf: 160,

  psg: 85,
  om: 81,
  ol: 80,
  asm: 91,
  lil: 79,
  ren: 94,

  ajax: 194,
  psv: 197,
  fey: 209,
  ben: 211,
  porto: 212,
  scp: 228,
  cel: 247,
  rangers: 257,
  gs: 645,
  fb: 611,

  fla: 127,
  pal: 121,
  sao: 126,
  fla2: 124,
  boc: 451,
  riv: 435,
  rc: 436,
  nal: 1137,
  milc: 1125,

  mia: 9568,
  laf: 1616,
  nyc: 1604,
  sea: 1595,
  ame: 2287,
  chiv: 2278,
  mty: 2282,

  ahl: 1029,
  zam: 1040,
  eim: 5177,
  kan: 5183,
  sun: 2699,
  kfc: 2691,

  hil: 2932,
  itt: 2938,
  nass: 2939,
  uls: 2767,
  jhn: 2762,

  syd: 943,
  mel: 945,
  wel: 942,
};

/**
 * Mock league id or live API league id → API-Football league id.
 * Championship (`40`) exists only on the live path.
 */
export const LEAGUE_LOGO_API_IDS: Record<string, number> = {
  epl: 39,
  '39': 39,
  '40': 40,
  facup: 45,
  nikeliga: 332,
  '332': 332,
  laliga: 140,
  '140': 140,
  seriea: 135,
  bundesliga: 78,
  ucl: 2,
  uel: 3,
  ligue1: 61,
  eredivisie: 88,
  primeira: 94,
  spl: 179,
  superlig: 203,
  brasileirao: 71,
  ligaarg: 128,
  ligacol: 239,
  libertadores: 13,
  mls: 253,
  ligamx: 235,
  egyptpl: 233,
  psl: 288,
  cafcl: 12,
  jleague: 98,
  splksa: 307,
  kleague: 292,
  isl: 323,
  aleague: 188,
};

export function mockTeamLogoUrl(mockTeamId: string): string | undefined {
  const apiId = MOCK_TEAM_API_IDS[mockTeamId];
  return apiId ? apiSportsTeamLogo(apiId) : undefined;
}

export function leagueLogoUrl(leagueId: string): string | undefined {
  const apiId = LEAGUE_LOGO_API_IDS[leagueId];
  return apiId ? apiSportsLeagueLogo(apiId) : undefined;
}

import type { MatchEvent, SeedFixture } from '../types';
import { leagueRosters } from './catalog';

function ev(
  id: string,
  type: MatchEvent['type'],
  minute: number,
  teamId: string,
  playerName: string,
  detail?: string,
): MatchEvent {
  return { id, type, minute, teamId, playerName, detail };
}

function fx(
  id: string,
  leagueId: string,
  homeTeamId: string,
  awayTeamId: string,
  kickoffOffsetMin: number,
  venue: string,
  events: MatchEvent[] = [],
  finished?: [number, number],
): SeedFixture {
  return {
    id,
    leagueId,
    homeTeamId,
    awayTeamId,
    kickoffOffsetMin,
    venue,
    events,
    finishedHome: finished?.[0],
    finishedAway: finished?.[1],
  };
}

const featured: SeedFixture[] = [
  fx(
    'fx-liv-ars',
    'epl',
    'liv',
    'ars',
    -34,
    'Anfield',
    [
      ev('e1', 'goal', 12, 'liv', 'Salah', 'Right-footed, near post'),
      ev('e2', 'yellow', 28, 'ars', 'Rice'),
      ev('e3', 'goal', 31, 'ars', 'Saka', 'Cut inside from the right'),
      ev('e4', 'goal', 52, 'liv', 'Mac Allister', 'Header from a corner'),
      ev('e5', 'sub', 61, 'ars', 'Trossard', 'On for Martinelli'),
    ],
  ),
  fx(
    'fx-mci-che',
    'epl',
    'mci',
    'che',
    -71,
    'Etihad Stadium',
    [
      ev('e6', 'goal', 9, 'mci', 'Haaland'),
      ev('e7', 'goal', 44, 'che', 'Palmer', 'Penalty'),
      ev('e8', 'yellow', 67, 'mci', 'Rodri'),
      ev('e9', 'var', 78, 'che', 'Jackson', 'Goal disallowed — offside'),
    ],
  ),
  fx(
    'fx-new-tot',
    'epl',
    'new',
    'tot',
    -8,
    "St James' Park",
    [ev('e10', 'yellow', 6, 'tot', 'Maddison')],
  ),
  fx(
    'fx-bha-mun',
    'epl',
    'bha',
    'mun',
    110,
    'Amex Stadium',
  ),
  fx(
    'fx-avl-whu',
    'epl',
    'avl',
    'whu',
    180,
    'Villa Park',
  ),
  fx(
    'fx-ful-eve',
    'epl',
    'ful',
    'eve',
    -220,
    'Craven Cottage',
    [
      ev('e11', 'goal', 19, 'ful', 'Jiménez'),
      ev('e12', 'goal', 71, 'eve', 'Calvert-Lewin'),
      ev('e13', 'goal', 88, 'ful', 'Iwobi'),
    ],
    [2, 1],
  ),
  fx(
    'fx-rma-bar',
    'laliga',
    'rma',
    'bar',
    -22,
    'Santiago Bernabéu',
    [
      ev('e14', 'goal', 7, 'rma', 'Vinícius Jr'),
      ev('e15', 'goal', 18, 'bar', 'Yamal'),
      ev('e16', 'red', 41, 'bar', 'Araujo', 'Second yellow'),
      ev('e17', 'goal', 55, 'rma', 'Bellingham'),
    ],
  ),
  fx(
    'fx-atm-gir',
    'laliga',
    'atm',
    'gir',
    95,
    'Metropolitano',
  ),
  fx(
    'fx-ath-rso',
    'laliga',
    'ath',
    'rso',
    -250,
    'San Mamés',
    [ev('e18', 'goal', 64, 'ath', 'Williams')],
    [1, 0],
  ),
  fx('fx-slovan-dac', 'nikeliga', 'slovan', 'dac', -18, 'Tehelné pole'),
  fx('fx-trnava-zilina', 'nikeliga', 'trnava', 'zilina', 160, 'City Arena'),
  fx(
    'fx-int-mil',
    'seriea',
    'int',
    'mil',
    -48,
    'San Siro',
    [
      ev('e19', 'goal', 23, 'int', 'Lautaro'),
      ev('e20', 'yellow', 39, 'mil', 'Reijnders'),
      ev('e21', 'goal', 45, 'mil', 'Pulisic'),
    ],
  ),
  fx(
    'fx-juv-nap',
    'seriea',
    'juv',
    'nap',
    200,
    'Allianz Stadium',
  ),
  fx(
    'fx-rom-ata',
    'seriea',
    'rom',
    'ata',
    -190,
    'Olimpico',
    [ev('e22', 'goal', 77, 'ata', 'Lookman')],
    [0, 1],
  ),
  fx(
    'fx-bay-dor',
    'bundesliga',
    'bay',
    'dor',
    -16,
    'Allianz Arena',
    [
      ev('e23', 'goal', 4, 'bay', 'Kane'),
      ev('e24', 'goal', 11, 'dor', 'Guirassy'),
      ev('e25', 'goal', 29, 'bay', 'Musiala'),
    ],
  ),
  fx(
    'fx-lev-rbl',
    'bundesliga',
    'lev',
    'rbl',
    260,
    'BayArena',
  ),
  fx(
    'fx-ucl-mci-rma',
    'ucl',
    'mci',
    'rma',
    -62,
    'Etihad Stadium',
    [
      ev('e26', 'goal', 15, 'mci', 'Foden'),
      ev('e27', 'goal', 38, 'rma', 'Mbappé'),
      ev('e28', 'goal', 70, 'rma', 'Valverde'),
      ev('e29', 'yellow', 81, 'mci', 'Dias'),
    ],
  ),
  fx(
    'fx-ucl-ars-bay',
    'ucl',
    'ars',
    'bay',
    40,
    'Emirates Stadium',
  ),
  fx(
    'fx-ucl-bar-int',
    'ucl',
    'bar',
    'int',
    1440,
    'Spotify Camp Nou',
  ),
  fx(
    'fx-ucl-psg-liv',
    'ucl',
    'psg',
    'liv',
    1500,
    'Parc des Princes',
  ),
  fx(
    'fx-psg-om',
    'ligue1',
    'psg',
    'om',
    -40,
    'Parc des Princes',
    [
      ev('e30', 'goal', 21, 'psg', 'Dembélé'),
      ev('e31', 'goal', 58, 'psg', 'Barcola'),
    ],
  ),
  fx(
    'fx-fla-pal',
    'brasileirao',
    'fla',
    'pal',
    75,
    'Maracanã',
  ),
  fx(
    'fx-boc-riv',
    'ligaarg',
    'boc',
    'riv',
    -210,
    'La Bombonera',
    [
      ev('e32', 'goal', 33, 'boc', 'Cavani'),
      ev('e33', 'goal', 90, 'riv', 'Colidio'),
    ],
    [1, 1],
  ),
  fx(
    'fx-mia-laf',
    'mls',
    'mia',
    'laf',
    320,
    'Chase Stadium',
  ),
  fx(
    'fx-hil-nass',
    'splksa',
    'hil',
    'nass',
    -55,
    'Kingdom Arena',
    [ev('e34', 'goal', 14, 'nass', 'Ronaldo'), ev('e35', 'goal', 49, 'hil', 'Mitrović')],
  ),
  fx(
    'fx-lib-fla-riv',
    'libertadores',
    'fla',
    'riv',
    2880,
    'Maracanã',
  ),
  fx(
    'fx-caf-ahl-sun',
    'cafcl',
    'ahl',
    'sun',
    1320,
    'Cairo International',
  ),
];

function pairLeague(leagueId: string, offsets: number[]): SeedFixture[] {
  const ids = leagueRosters[leagueId] ?? [];
  const out: SeedFixture[] = [];
  for (let i = 0; i + 1 < ids.length && out.length < offsets.length; i += 2) {
    const home = ids[i];
    const away = ids[i + 1];
    const already = featured.some(
      (f) => f.leagueId === leagueId && f.homeTeamId === home && f.awayTeamId === away,
    );
    if (already) continue;
    const offset = offsets[out.length];
    out.push(fx(`fx-${leagueId}-${home}-${away}`, leagueId, home, away, offset, 'Home stadium'));
  }
  return out;
}

const generated: SeedFixture[] = [
  ...pairLeague('epl', [420, 1480, 1560, -400, 2900, -360]),
  ...pairLeague('laliga', [130, 1700, -300, 3100]),
  ...pairLeague('seriea', [240, 1760, -280, 3200]),
  ...pairLeague('bundesliga', [300, 1820, -330]),
  ...pairLeague('ligue1', [360, 1900, -270]),
  ...pairLeague('eredivisie', [400, 2000]),
  ...pairLeague('primeira', [450, 2100]),
  ...pairLeague('spl', [500]),
  ...pairLeague('superlig', [540]),
  ...pairLeague('brasileirao', [600, 2200]),
  ...pairLeague('mls', [700, 2300]),
  ...pairLeague('ligamx', [760]),
  ...pairLeague('jleague', [820, 2400]),
  ...pairLeague('splksa', [880]),
  ...pairLeague('kleague', [940]),
  ...pairLeague('isl', [1000]),
  ...pairLeague('aleague', [1060]),
  ...pairLeague('egyptpl', [1120]),
  ...pairLeague('npfl', [1180]),
  ...pairLeague('psl', [1240]),
  ...pairLeague('facup', [3400]),
  ...pairLeague('uel', [3600]),
  ...pairLeague('ligacol', [3800]),
  ...pairLeague('nzf', [4000]),
];

export const seedFixtures: SeedFixture[] = [...featured, ...generated];

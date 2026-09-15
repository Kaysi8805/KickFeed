import type { FormResult, Scorer, StandingRow } from '../types';
import { leagueRosters } from './catalog';

function hash(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i += 1) n = (n * 31 + s.charCodeAt(i)) >>> 0;
  return n;
}

function formFromSeed(seed: number): FormResult[] {
  const opts: FormResult[] = ['W', 'W', 'W', 'D', 'L'];
  return Array.from({ length: 5 }, (_, i) => opts[(seed + i * 3) % opts.length]);
}

export function standingsFor(leagueId: string): StandingRow[] {
  const ids = leagueRosters[leagueId] ?? [];
  const rows = ids.map((teamId, index) => {
    const played = 10;
    const strength = ids.length - index;
    const won = Math.min(played, Math.max(1, Math.round(strength * 0.55)));
    const lost = Math.min(played - won, Math.max(0, Math.round(index * 0.35)));
    const drawn = Math.max(0, played - won - lost);
    const gf = won * 2 + drawn;
    const ga = lost * 2 + drawn;
    return {
      teamId,
      played,
      won,
      drawn,
      lost,
      gf,
      ga,
      points: won * 3 + drawn,
      form: formFromSeed(hash(teamId + leagueId)),
    };
  });
  return rows.sort((a, b) => b.points - a.points || b.gf - b.ga - (a.gf - a.ga));
}

const scorersByLeague: Record<string, Scorer[]> = {
  epl: [
    { id: 's-haaland', playerName: 'Erling Haaland', teamId: 'mci', goals: 14, assists: 2 },
    { id: 's-salah', playerName: 'Mohamed Salah', teamId: 'liv', goals: 12, assists: 6 },
    { id: 's-saka', playerName: 'Bukayo Saka', teamId: 'ars', goals: 10, assists: 7 },
    { id: 's-isak', playerName: 'Alexander Isak', teamId: 'new', goals: 9, assists: 3 },
    { id: 's-palmer', playerName: 'Cole Palmer', teamId: 'che', goals: 9, assists: 5 },
    { id: 's-son', playerName: 'Son Heung-min', teamId: 'tot', goals: 8, assists: 4 },
  ],
  laliga: [
    { id: 's-mbappe', playerName: 'Kylian Mbappé', teamId: 'rma', goals: 13, assists: 4 },
    { id: 's-lewa', playerName: 'Robert Lewandowski', teamId: 'bar', goals: 11, assists: 3 },
    { id: 's-alvarez', playerName: 'Julián Álvarez', teamId: 'atm', goals: 9, assists: 2 },
    { id: 's-williams', playerName: 'Nico Williams', teamId: 'ath', goals: 7, assists: 6 },
  ],
  seriea: [
    { id: 's-lautaro', playerName: 'Lautaro Martínez', teamId: 'int', goals: 11, assists: 3 },
    { id: 's-vlahovic', playerName: 'Dušan Vlahović', teamId: 'juv', goals: 9, assists: 1 },
    { id: 's-kvaratskhelia', playerName: 'Khvicha Kvaratskhelia', teamId: 'nap', goals: 8, assists: 5 },
    { id: 's-lookman', playerName: 'Ademola Lookman', teamId: 'ata', goals: 8, assists: 4 },
  ],
  bundesliga: [
    { id: 's-kane', playerName: 'Harry Kane', teamId: 'bay', goals: 16, assists: 5 },
    { id: 's-guirassy', playerName: 'Serhou Guirassy', teamId: 'dor', goals: 12, assists: 2 },
    { id: 's-wic', playerName: 'Victor Boniface', teamId: 'lev', goals: 9, assists: 3 },
  ],
  ucl: [
    { id: 's-ucl-haaland', playerName: 'Erling Haaland', teamId: 'mci', goals: 7, assists: 1 },
    { id: 's-ucl-kane', playerName: 'Harry Kane', teamId: 'bay', goals: 6, assists: 2 },
    { id: 's-ucl-vinicius', playerName: 'Vinícius Jr', teamId: 'rma', goals: 5, assists: 4 },
    { id: 's-ucl-saka', playerName: 'Bukayo Saka', teamId: 'ars', goals: 4, assists: 3 },
  ],
};

const genericNames = [
  'Noah Silva',
  'Mateo Cruz',
  'Kenji Mori',
  'Omar Farouk',
  'Luca Costa',
  'Andrei Petrov',
  'Jamal Okoye',
  'Felix Berg',
];

export function scorersFor(leagueId: string): Scorer[] {
  if (scorersByLeague[leagueId]) return scorersByLeague[leagueId];
  const ids = leagueRosters[leagueId] ?? [];
  return ids.slice(0, 5).map((teamId, i) => ({
    id: `s-${leagueId}-${teamId}`,
    playerName: genericNames[(hash(teamId) + i) % genericNames.length],
    teamId,
    goals: 8 - i,
    assists: 4 - Math.min(i, 3),
  }));
}

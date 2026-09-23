import type { Lineup, LineupGrid, LineupPlayer } from '@/data/types';

export interface PitchPoint {
  key: string;
  player: LineupPlayer;
  /** 0–1 across the pitch, left to right from the viewer. */
  x: number;
  /** 0–1 down the pitch. Home goalkeeper sits near 1; away goalkeeper near 0. */
  y: number;
}

const HOME_GK_Y = 0.9;
const HOME_FWD_Y = 0.56;
const AWAY_GK_Y = 0.1;
const AWAY_FWD_Y = 0.44;
const X_INSET = 0.14;

/** `row:col` from API-Football. Row 1 is the goalkeeper. */
export function parseLineupGrid(raw: string | null | undefined): LineupGrid | undefined {
  if (!raw) return undefined;
  const match = /^(\d{1,2}):(\d{1,2})$/.exec(raw.trim());
  if (!match) return undefined;
  const row = Number(match[1]);
  const col = Number(match[2]);
  if (row < 1 || col < 1) return undefined;
  return { row, col };
}

/** Outfield row sizes from a formation string (`4-2-3-1`). Undefined when it is not a 10-outfield shape. */
export function formationRows(formation: string): number[] | undefined {
  const parts = formation.split('-').map((part) => Number(part.trim()));
  if (parts.length < 2 || parts.some((n) => !Number.isInteger(n) || n <= 0)) return undefined;
  const outfield = parts.reduce((sum, n) => sum + n, 0);
  if (outfield !== 10) return undefined;
  return parts;
}

function yFor(along: number, side: 'home' | 'away'): number {
  if (side === 'home') return HOME_GK_Y - along * (HOME_GK_Y - HOME_FWD_Y);
  return AWAY_GK_Y + along * (AWAY_FWD_Y - AWAY_GK_Y);
}

function xFor(col: number, maxCol: number, side: 'home' | 'away'): number {
  const raw = (col - 0.5) / Math.max(1, maxCol);
  const mirrored = side === 'away' ? 1 - raw : raw;
  return X_INSET + mirrored * (1 - 2 * X_INSET);
}

function point(player: LineupPlayer, side: 'home' | 'away', x: number, y: number, index: number): PitchPoint {
  const id = player.playerId ?? `${player.number}-${player.name}`;
  return { key: `${side}-${id}-${index}`, player, x, y };
}

function pointsFromGrid(players: LineupPlayer[], side: 'home' | 'away'): PitchPoint[] | undefined {
  if (!players.length || players.some((player) => !player.grid)) return undefined;
  const byRow = new Map<number, LineupPlayer[]>();
  for (const player of players) {
    const row = player.grid!.row;
    const list = byRow.get(row) ?? [];
    list.push(player);
    byRow.set(row, list);
  }
  const rowNums = [...byRow.keys()];
  const maxRow = Math.max(...rowNums);
  const span = Math.max(1, maxRow - 1);
  return players.map((player, index) => {
    const row = player.grid!.row;
    const mates = byRow.get(row) ?? [player];
    const maxCol = Math.max(...mates.map((mate) => mate.grid!.col));
    const along = (row - 1) / span;
    return point(player, side, xFor(player.grid!.col, maxCol, side), yFor(along, side), index);
  });
}

/**
 * Place a full XI from formation order: goalkeeper, then each outfield row back to front.
 * Returns undefined when the count or the formation string cannot place every starter.
 */
function pointsFromFormation(players: LineupPlayer[], formation: string, side: 'home' | 'away'): PitchPoint[] | undefined {
  const rows = formationRows(formation);
  if (!rows || players.length !== 11) return undefined;
  const chunks: LineupPlayer[][] = [[players[0]!]];
  let index = 1;
  for (const size of rows) {
    const slice = players.slice(index, index + size);
    if (slice.length !== size) return undefined;
    chunks.push(slice);
    index += size;
  }
  if (index !== players.length) return undefined;
  const span = Math.max(1, chunks.length - 1);
  const points: PitchPoint[] = [];
  chunks.forEach((chunk, rowIndex) => {
    chunk.forEach((player, colIndex) => {
      const along = rowIndex / span;
      points.push(point(player, side, xFor(colIndex + 1, chunk.length, side), yFor(along, side), points.length));
    });
  });
  return points;
}

/**
 * Pitch coordinates for one side.
 * Grid cells win when every starter has one. Otherwise a complete formation of 11.
 * A partial sheet stays a list — positions are not guessed.
 */
export function pitchPoints(
  players: LineupPlayer[],
  formation: string,
  side: 'home' | 'away',
): PitchPoint[] | undefined {
  return pointsFromGrid(players, side) ?? pointsFromFormation(players, formation, side);
}

export function lineupIsSheet(lineup: Pick<Lineup, 'source' | 'players'>): boolean {
  return lineup.source === 'sheet' && lineup.players.length > 0;
}

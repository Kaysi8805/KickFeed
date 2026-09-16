import { leagues, teams } from '@/data/mocks/catalog';
import { namedPlayers } from '@/data/mocks/players';

export type TextSegment =
  | { kind: 'text'; value: string }
  | { kind: 'team'; id: string; value: string }
  | { kind: 'player'; id: string; value: string }
  | { kind: 'league'; id: string; value: string };

interface Term {
  kind: 'team' | 'player' | 'league';
  id: string;
  needle: string;
}

/** Lowercase ASCII fold that keeps 1:1 indices with the original string. */
export function foldPreserve(s: string): string {
  let out = '';
  for (const ch of s) {
    const base = ch.normalize('NFD').replace(/\p{M}/gu, '');
    out += (base[0] ?? ch).toLowerCase();
  }
  return out;
}

function isLetter(ch: string | undefined): boolean {
  return !!ch && /[A-Za-zÀ-ÿ]/.test(ch);
}

function addTerm(out: Term[], kind: Term['kind'], id: string, raw: string, minLen: number) {
  const needle = foldPreserve(raw);
  if (needle.replace(/[^a-z0-9]/g, '').length < minLen) return;
  out.push({ kind, id, needle });
}

function buildTerms(): Term[] {
  const terms: Term[] = [];
  for (const team of teams) {
    addTerm(terms, 'team', team.id, team.name, 3);
    addTerm(terms, 'team', team.id, team.shortName, 3);
    addTerm(terms, 'team', team.id, team.code, 3);
  }
  for (const league of leagues) {
    addTerm(terms, 'league', league.id, league.name, 2);
    addTerm(terms, 'league', league.id, league.shortName, 2);
  }
  for (const player of namedPlayers()) {
    addTerm(terms, 'player', player.id, player.name, 4);
    addTerm(terms, 'player', player.id, player.shortName, 4);
    const bits = player.name.split(/\s+/);
    const last = bits[bits.length - 1];
    const first = bits[0];
    if (last) addTerm(terms, 'player', player.id, last, 4);
    if (first) addTerm(terms, 'player', player.id, first, 5);
  }
  terms.sort((a, b) => b.needle.length - a.needle.length);
  return terms;
}

const TERMS = buildTerms();

function overlaps(start: number, end: number, spans: Array<{ start: number; end: number }>): boolean {
  return spans.some((s) => start < s.end && end > s.start);
}

/** Split post/body text into plain runs and team/player/league mentions. */
export function splitEntityText(text: string): TextSegment[] {
  if (!text) return [];
  const lower = foldPreserve(text);
  const spans: Array<{ start: number; end: number; kind: Term['kind']; id: string }> = [];

  for (const term of TERMS) {
    let from = 0;
    while (from < lower.length) {
      const idx = lower.indexOf(term.needle, from);
      if (idx === -1) break;
      const end = idx + term.needle.length;
      const before = lower[idx - 1];
      const after = lower[end];
      if (isLetter(before) || isLetter(after) || overlaps(idx, end, spans)) {
        from = idx + 1;
        continue;
      }
      spans.push({ start: idx, end, kind: term.kind, id: term.id });
      from = end;
    }
  }

  spans.sort((a, b) => a.start - b.start);
  const parts: TextSegment[] = [];
  let cursor = 0;
  for (const span of spans) {
    if (span.start > cursor) parts.push({ kind: 'text', value: text.slice(cursor, span.start) });
    parts.push({ kind: span.kind, id: span.id, value: text.slice(span.start, span.end) });
    cursor = span.end;
  }
  if (cursor < text.length) parts.push({ kind: 'text', value: text.slice(cursor) });
  return parts.length ? parts : [{ kind: 'text', value: text }];
}

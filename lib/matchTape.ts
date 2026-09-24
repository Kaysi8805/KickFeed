import type { Fixture, MatchEvent, MatchStatus, MatchTapeAnchor, MatchTapeAttachment } from '@/data/types';
import { isPersistedUserId } from '@/lib/userIdentity';

const GROUP_ID_RE = /^grp-[a-z0-9]{4,16}-[a-z0-9]{1,16}$/i;

export const TAPE_CAPTION_MAX = 160;
export const TAPE_LABEL_MAX = 80;
export const TAPE_EVENT_KEY_MAX = 80;

const MATCH_ID_RE = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,63}$/;
const TAPE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9:_-]{3,79}$/;
const ANCHOR_TYPES = new Set(['goal', 'yellow', 'red', 'sub']);

export type TapeKind = MatchTapeAttachment['kind'];

export type TapeTeams = Pick<MatchTapeAttachment, 'homeName' | 'awayName' | 'homeShort' | 'awayShort'>;

export type TapeScoreSnapshot = {
  homeScore?: number;
  awayScore?: number;
  minute?: number;
  matchStatus?: MatchStatus;
};

export type TapePlan<T> = { ok: true; value: T } | { ok: false; error: string };

export function dmTapeThreadKey(a: string, b: string): string {
  return a < b ? `${a}::${b}` : `${b}::${a}`;
}

function isTapeGroupId(id: string): boolean {
  return GROUP_ID_RE.test(id);
}

export function isTapeMatchId(id: string): boolean {
  return MATCH_ID_RE.test(id);
}

/** Newest attachment for a thread. Archived means the chat is a read-only tape. */
export function governingTape(
  rows: readonly MatchTapeAttachment[],
  threadKey: string,
): MatchTapeAttachment | null {
  let best: MatchTapeAttachment | null = null;
  for (const row of rows) {
    if (row.threadKey !== threadKey) continue;
    if (!best || tapeSortKey(row) >= tapeSortKey(best)) best = row;
  }
  return best;
}

function tapeSortKey(row: MatchTapeAttachment): string {
  return `${row.createdAt}\u0000${row.id}`;
}

export function tapeIsLocked(row: MatchTapeAttachment | null | undefined): boolean {
  return row?.status === 'archived';
}

export function anchorableEvents(events: readonly MatchEvent[]): MatchEvent[] {
  return events
    .filter((event) => ANCHOR_TYPES.has(event.type))
    .sort((a, b) => b.minute - a.minute || a.id.localeCompare(b.id));
}

export function eventKeyFor(event: Pick<MatchEvent, 'id' | 'minute' | 'type' | 'teamId' | 'playerName'>): string {
  const id = event.id.trim();
  const raw = id || `${event.minute}:${event.type}:${event.teamId}:${event.playerName}`;
  return raw.slice(0, TAPE_EVENT_KEY_MAX);
}

export function anchorLabel(event: Pick<MatchEvent, 'minute' | 'type' | 'playerName'>, side: string): string {
  const who = event.playerName.trim() || side.trim() || 'Player';
  const raw = `${event.minute}' ${who} ${event.type}`;
  if (raw.length <= TAPE_LABEL_MAX) return raw;
  return `${raw.slice(0, TAPE_LABEL_MAX - 1).trimEnd()}…`;
}

export function isSampleAnchor(anchor: Pick<MatchTapeAnchor, 'eventKey'>): boolean {
  return anchor.eventKey.startsWith('demo:');
}

/** Labeled stand-ins when demo mode has a fixture with no goal, card, or sub yet. */
export function sampleTapeEvents(matchId: string): MatchEvent[] {
  return [
    {
      id: `demo:${matchId}:goal:23`,
      type: 'goal',
      minute: 23,
      teamId: 'home',
      playerName: 'Sample striker',
      detail: 'Sample event',
    },
    {
      id: `demo:${matchId}:yellow:41`,
      type: 'yellow',
      minute: 41,
      teamId: 'away',
      playerName: 'Sample midfielder',
      detail: 'Sample event',
    },
    {
      id: `demo:${matchId}:sub:70`,
      type: 'sub',
      minute: 70,
      teamId: 'home',
      playerName: 'Sample winger',
      detail: 'Sample event',
    },
  ];
}

export function tapeEventsFor(
  events: readonly MatchEvent[],
  matchId: string,
  demo: boolean,
): { events: MatchEvent[]; sample: boolean } {
  const real = anchorableEvents(events);
  if (real.length > 0) return { events: real, sample: false };
  if (!demo || !isTapeMatchId(matchId)) return { events: [], sample: false };
  return { events: sampleTapeEvents(matchId), sample: true };
}

export function buildTapeAnchor(matchId: string, event: MatchEvent, side: string): MatchTapeAnchor | null {
  if (!isTapeMatchId(matchId) || !ANCHOR_TYPES.has(event.type)) return null;
  if (!Number.isInteger(event.minute) || event.minute < 0 || event.minute > 130) return null;
  const anchor: MatchTapeAnchor = {
    matchId,
    eventKey: eventKeyFor(event),
    minute: event.minute,
    eventType: event.type as MatchTapeAnchor['eventType'],
    label: anchorLabel(event, side),
  };
  return parseMatchTapeAnchor(anchor);
}

export function parseMatchTapeAnchor(value: unknown): MatchTapeAnchor | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const matchId = typeof row.matchId === 'string' ? row.matchId.trim() : '';
  const eventKey = typeof row.eventKey === 'string' ? row.eventKey.trim() : '';
  const label = typeof row.label === 'string' ? row.label.trim().replace(/\s+/g, ' ') : '';
  const eventType = row.eventType;
  const minute = typeof row.minute === 'number' ? row.minute : Number(row.minute);
  if (!isTapeMatchId(matchId)) return null;
  if (!eventKey || eventKey.length > TAPE_EVENT_KEY_MAX) return null;
  if (!label || label.length > TAPE_LABEL_MAX) return null;
  if (eventType !== 'goal' && eventType !== 'yellow' && eventType !== 'red' && eventType !== 'sub') return null;
  if (!Number.isInteger(minute) || minute < 0 || minute > 130) return null;
  if ('url' in row || 'href' in row || 'link' in row) return null;
  return { matchId, eventKey, minute, eventType, label };
}

function cleanName(value: string, max: number): string | null {
  const trimmed = value.trim().replace(/\s+/g, ' ');
  if (!trimmed || trimmed.length > max) return null;
  return trimmed;
}

function cleanShort(value: string): string | null {
  const trimmed = value.trim().replace(/\s+/g, '');
  if (!trimmed || trimmed.length > 8) return null;
  return trimmed.slice(0, 8);
}

export function tapeTeamsFrom(homeName: string, awayName: string, homeShort: string, awayShort: string): TapeTeams | null {
  const home = cleanName(homeName, 80);
  const away = cleanName(awayName, 80);
  const homeCode = cleanShort(homeShort);
  const awayCode = cleanShort(awayShort);
  if (!home || !away || !homeCode || !awayCode) return null;
  return { homeName: home, awayName: away, homeShort: homeCode, awayShort: awayCode };
}

export function createTapeId(now: number, userId: string): string {
  const suffix = userId.replace(/[^a-z0-9]/gi, '').slice(0, 12) || 'fan';
  return `tape-${now.toString(36)}-${suffix}`.slice(0, 80);
}

export function planMatchTapeAttach(input: {
  rows: readonly MatchTapeAttachment[];
  id: string;
  kind: TapeKind;
  threadKey: string;
  matchId: string;
  attachedBy: string;
  teams: TapeTeams;
  kickoff?: string;
  now: number;
}): TapePlan<MatchTapeAttachment> {
  if (!isPersistedUserId(input.attachedBy)) return { ok: false, error: 'Sign in to attach a match.' };
  if (!TAPE_ID_RE.test(input.id)) return { ok: false, error: 'Couldn’t start that Match Tape.' };
  if (!isTapeMatchId(input.matchId)) return { ok: false, error: 'Pick a match from the catalog.' };
  if (input.kind === 'group') {
    if (!isTapeGroupId(input.threadKey)) return { ok: false, error: 'This group isn’t on KickFeed.' };
  } else if (!isDmThreadKey(input.threadKey, input.attachedBy)) {
    return { ok: false, error: 'Only people in this chat can attach a match.' };
  }
  const current = governingTape(input.rows, input.threadKey);
  if (current?.status === 'active') {
    return { ok: false, error: 'This chat already has a match attached. Archive it before attaching another.' };
  }
  const kickoff =
    input.kickoff && Number.isFinite(Date.parse(input.kickoff)) ? new Date(Date.parse(input.kickoff)).toISOString() : undefined;
  const attachment: MatchTapeAttachment = {
    id: input.id,
    kind: input.kind,
    threadKey: input.threadKey,
    matchId: input.matchId,
    status: 'active',
    attachedBy: input.attachedBy,
    createdAt: new Date(input.now).toISOString(),
    ...input.teams,
    ...(kickoff ? { kickoff } : {}),
  };
  const parsed = parseMatchTapeAttachment(attachment);
  if (!parsed) return { ok: false, error: 'Couldn’t start that Match Tape.' };
  return { ok: true, value: parsed };
}

export function planMatchTapeArchive(
  rows: readonly MatchTapeAttachment[],
  id: string,
  now: number,
  snapshot?: TapeScoreSnapshot,
): TapePlan<MatchTapeAttachment> {
  const current = rows.find((row) => row.id === id);
  if (!current) return { ok: false, error: 'This Match Tape isn’t on KickFeed.' };
  if (current.status === 'archived') return { ok: true, value: current };
  const score = cleanSnapshot(snapshot);
  if (snapshot && !score) return { ok: false, error: 'Couldn’t archive that Match Tape.' };
  const next: MatchTapeAttachment = {
    ...current,
    status: 'archived',
    archivedAt: new Date(now).toISOString(),
    ...(score ?? {}),
  };
  const parsed = parseMatchTapeAttachment(next);
  if (!parsed) return { ok: false, error: 'Couldn’t archive that Match Tape.' };
  return { ok: true, value: parsed };
}

function cleanSnapshot(snapshot: TapeScoreSnapshot | undefined): TapeScoreSnapshot | null {
  if (!snapshot) return {};
  const next: TapeScoreSnapshot = {};
  if (snapshot.homeScore != null) {
    if (!Number.isInteger(snapshot.homeScore) || snapshot.homeScore < 0 || snapshot.homeScore > 30) return null;
    next.homeScore = snapshot.homeScore;
  }
  if (snapshot.awayScore != null) {
    if (!Number.isInteger(snapshot.awayScore) || snapshot.awayScore < 0 || snapshot.awayScore > 30) return null;
    next.awayScore = snapshot.awayScore;
  }
  if (snapshot.minute != null) {
    if (!Number.isInteger(snapshot.minute) || snapshot.minute < 0 || snapshot.minute > 130) return null;
    next.minute = snapshot.minute;
  }
  if (snapshot.matchStatus != null) {
    if (!isMatchStatus(snapshot.matchStatus)) return null;
    next.matchStatus = snapshot.matchStatus;
  }
  return next;
}

function isMatchStatus(value: string): value is MatchStatus {
  return value === 'upcoming' || value === 'live' || value === 'ht' || value === 'finished';
}

function isDmThreadKey(threadKey: string, userId: string): boolean {
  const parts = threadKey.split('::');
  if (parts.length !== 2) return false;
  const [left, right] = parts;
  if (!left || !right || !isPersistedUserId(left) || !isPersistedUserId(right) || left === right) return false;
  if (left >= right) return false;
  return userId === left || userId === right;
}

export function parseMatchTapeAttachment(value: unknown): MatchTapeAttachment | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const id = typeof row.id === 'string' ? row.id.trim() : '';
  const kind = row.kind === 'dm' || row.kind === 'group' ? row.kind : null;
  const threadKey = typeof row.threadKey === 'string' ? row.threadKey.trim() : '';
  const matchId = typeof row.matchId === 'string' ? row.matchId.trim() : '';
  const status = row.status === 'active' || row.status === 'archived' ? row.status : null;
  const attachedBy = typeof row.attachedBy === 'string' ? row.attachedBy.trim() : '';
  const createdAt =
    typeof row.createdAt === 'string' && Number.isFinite(Date.parse(row.createdAt)) ? row.createdAt : null;
  if (!TAPE_ID_RE.test(id) || !kind || !status || !createdAt || !isPersistedUserId(attachedBy)) return null;
  if (!isTapeMatchId(matchId)) return null;
  if (kind === 'group' && !isTapeGroupId(threadKey)) return null;
  if (kind === 'dm' && !isDmThreadKey(threadKey, attachedBy)) return null;
  const teams = tapeTeamsFrom(
    typeof row.homeName === 'string' ? row.homeName : '',
    typeof row.awayName === 'string' ? row.awayName : '',
    typeof row.homeShort === 'string' ? row.homeShort : '',
    typeof row.awayShort === 'string' ? row.awayShort : '',
  );
  if (!teams) return null;
  const attachment: MatchTapeAttachment = {
    id,
    kind,
    threadKey,
    matchId,
    status,
    attachedBy,
    createdAt,
    ...teams,
  };
  if (typeof row.archivedAt === 'string' && Number.isFinite(Date.parse(row.archivedAt))) {
    attachment.archivedAt = row.archivedAt;
  }
  if (status === 'archived' && !attachment.archivedAt) return null;
  if (typeof row.kickoff === 'string' && Number.isFinite(Date.parse(row.kickoff))) attachment.kickoff = row.kickoff;
  const score = cleanSnapshot({
    homeScore: optionalInt(row.homeScore),
    awayScore: optionalInt(row.awayScore),
    minute: optionalInt(row.minute),
    matchStatus: typeof row.matchStatus === 'string' && isMatchStatus(row.matchStatus) ? row.matchStatus : undefined,
  });
  if (!score) return null;
  return { ...attachment, ...score };
}

function optionalInt(value: unknown): number | undefined {
  if (value == null || value === '') return undefined;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Active tape: messages allowed, and an anchor must match that fixture.
 * Archived tape: no new messages. No tape: normal chat, anchors refused.
 */
export function gateTapeMessage(
  rows: readonly MatchTapeAttachment[],
  threadKey: string,
  text: string,
  anchor: MatchTapeAnchor | null | undefined,
): TapePlan<MatchTapeAnchor | undefined> {
  const current = governingTape(rows, threadKey);
  if (tapeIsLocked(current)) {
    return { ok: false, error: 'This Match Tape is read-only.' };
  }
  if (!anchor) return { ok: true, value: undefined };
  const parsed = parseMatchTapeAnchor(anchor);
  if (!parsed) return { ok: false, error: 'Pick a goal, card, or substitution.' };
  if (!current || current.status !== 'active') {
    return { ok: false, error: 'Attach this match before replying to an event.' };
  }
  if (parsed.matchId !== current.matchId) {
    return { ok: false, error: 'That event is from a different match.' };
  }
  if (text.trim().length > TAPE_CAPTION_MAX) {
    return { ok: false, error: `Keep the take under ${TAPE_CAPTION_MAX} characters.` };
  }
  return { ok: true, value: parsed };
}

export function shouldAutoArchive(status: MatchStatus | undefined): boolean {
  return status === 'finished';
}

export function tapeStatusLabel(status: MatchStatus | undefined, minute?: number): string {
  if (status === 'live') return minute != null ? `${minute}'` : 'Live';
  if (status === 'ht') return 'HT';
  if (status === 'finished') return 'FT';
  if (status === 'upcoming') return 'Upcoming';
  return 'Match';
}

export function tapeScoreline(input: {
  homeShort: string;
  awayShort: string;
  homeScore?: number;
  awayScore?: number;
  statusLabel: string;
  upcoming?: boolean;
}): string {
  const tail = input.statusLabel ? ` · ${input.statusLabel}` : '';
  if (input.upcoming) return `${input.homeShort} vs ${input.awayShort}${tail}`;
  const home = input.homeScore ?? 0;
  const away = input.awayScore ?? 0;
  return `${input.homeShort} ${home}–${away} ${input.awayShort}${tail}`;
}

export type TapeShareTake = {
  author: string;
  label: string;
  text: string;
  sample?: boolean;
};

/** OS share sheet body. No URL — KickFeed has no public tape route. */
export function buildMatchTapeShareMessage(input: {
  scoreline: string;
  takes: readonly TapeShareTake[];
}): string {
  const lines = ['Match Tape · Zápasová páska', input.scoreline];
  const takes = input.takes.slice(0, 3);
  for (const take of takes) {
    const prefix = take.sample ? 'Sample · ' : '';
    lines.push(`${prefix}${take.label} — ${take.author}: ${take.text}`);
  }
  if (takes.length === 0) lines.push('No anchored takes yet.');
  lines.push('Private chat memory. No public room. No video.');
  return lines.join('\n');
}

export type TapeFixtureChoice = {
  id: string;
  homeName: string;
  awayName: string;
  homeShort: string;
  awayShort: string;
  status: MatchStatus;
  minute?: number;
  homeScore: number;
  awayScore: number;
  kickoff: string;
};

export function fixturesForTapePicker(rows: readonly TapeFixtureChoice[], query: string): TapeFixtureChoice[] {
  const q = query.trim().toLowerCase();
  const filtered = rows.filter((row) => {
    if (!isTapeMatchId(row.id)) return false;
    if (!q) return true;
    const hay = `${row.homeName} ${row.awayName} ${row.homeShort} ${row.awayShort}`.toLowerCase();
    return hay.includes(q);
  });
  const rank = (status: MatchStatus) => (status === 'live' || status === 'ht' ? 0 : status === 'upcoming' ? 1 : 2);
  return filtered
    .sort((a, b) => {
      const byStatus = rank(a.status) - rank(b.status);
      if (byStatus !== 0) return byStatus;
      const ak = Date.parse(a.kickoff);
      const bk = Date.parse(b.kickoff);
      if (a.status === 'finished') return bk - ak;
      return ak - bk;
    })
    .slice(0, 30);
}

export function fixtureChoiceFrom(fixture: Fixture, teams: TapeTeams): TapeFixtureChoice {
  return {
    id: fixture.id,
    ...teams,
    status: fixture.status,
    minute: fixture.minute,
    homeScore: fixture.homeScore,
    awayScore: fixture.awayScore,
    kickoff: fixture.kickoff,
  };
}

export function mergeMatchTapes(
  local: readonly MatchTapeAttachment[],
  remote: readonly MatchTapeAttachment[],
): MatchTapeAttachment[] {
  const byId = new Map<string, MatchTapeAttachment>();
  for (const row of local) byId.set(row.id, row);
  for (const row of remote) {
    const prev = byId.get(row.id);
    if (!prev) {
      byId.set(row.id, row);
      continue;
    }
    if (prev.status === 'archived' || row.status === 'archived') {
      const archived = row.status === 'archived' ? row : prev;
      byId.set(row.id, {
        ...prev,
        ...row,
        status: 'archived',
        archivedAt: archived.archivedAt ?? row.archivedAt ?? prev.archivedAt,
        homeScore: row.homeScore ?? prev.homeScore,
        awayScore: row.awayScore ?? prev.awayScore,
        minute: row.minute ?? prev.minute,
        matchStatus: row.matchStatus ?? prev.matchStatus,
      });
    }
  }
  return [...byId.values()];
}

const TAPE_ERROR_COPY: Record<string, string> = {
  tape_active: 'This chat already has a match attached. Archive it before attaching another.',
  tape_locked: 'This Match Tape is read-only.',
  tape_anchor: 'Attach this match before replying to an event.',
  tape_caption: `Keep the take under ${TAPE_CAPTION_MAX} characters.`,
  not_member: 'Only people in this chat can attach a match.',
  blocked: 'You can’t attach a match in a chat that has a block.',
  bad_thread: 'Only people in this chat can attach a match.',
  bad_match: 'Pick a match from the catalog.',
  not_authenticated: 'Sign in to attach a match.',
  not_configured: 'KickFeed Postgres is not configured on this build.',
};

export function tapeErrorMessage(raw: string): string {
  const lower = raw.toLowerCase();
  const code = Object.keys(TAPE_ERROR_COPY).find((key) => lower.includes(key));
  return code ? TAPE_ERROR_COPY[code] : 'Couldn’t save that Match Tape. Try again.';
}

export function parseRemoteMatchTape(value: unknown): MatchTapeAttachment | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  return parseMatchTapeAttachment({
    id: row.id,
    kind: row.kind,
    threadKey: row.thread_key,
    matchId: row.match_id,
    status: row.status,
    attachedBy: row.attached_by,
    createdAt: row.created_at,
    archivedAt: row.archived_at,
    homeName: row.home_name,
    awayName: row.away_name,
    homeShort: row.home_short,
    awayShort: row.away_short,
    kickoff: row.kickoff,
    homeScore: row.home_score,
    awayScore: row.away_score,
    minute: row.minute,
    matchStatus: row.match_status,
  });
}

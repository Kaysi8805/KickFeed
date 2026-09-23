/**
 * Server-owned fantasy round deadlines.
 * No Deno / Supabase imports so Vitest and the Edge Function can share it.
 * Kickoff status codes match remoteMatchStatus in remotePushPlan.ts.
 */

export const FANTASY_DEADLINE_FRESH_MS = 10 * 60_000;
export const FANTASY_DEADLINE_COMPETITIONS = ['39', '40', '332', '140'] as const;

const FINISHED = new Set(['FT', 'AET', 'PEN', 'AWD', 'WO']);
const LIVE = new Set(['1H', '2H', 'ET', 'BT', 'P', 'LIVE', 'INT', 'SUSP']);
const UPCOMING = new Set(['NS', 'TBD', 'PST']);

export type FantasyDeadlineStatus = 'upcoming' | 'live' | 'ht' | 'finished' | 'skip';

export type FantasyRoundDeadline = {
  roundId: string;
  deadlineAt: string;
};

/** Same mapping as remoteMatchStatus. Unknown codes stay upcoming; CANC/ABD are ignored. */
export function fantasyKickoffStatus(short: string | null | undefined): FantasyDeadlineStatus {
  const code = (short ?? '').toUpperCase();
  if (code === 'HT') return 'ht';
  if (LIVE.has(code)) return 'live';
  if (FINISHED.has(code)) return 'finished';
  if (UPCOMING.has(code) || !code) return 'upcoming';
  if (code === 'CANC' || code === 'ABD') return 'skip';
  return 'upcoming';
}

export function readFantasySyncRequest(body: unknown): { competitionId: string; season: number } | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const row = body as Record<string, unknown>;
  const competitionId = typeof row.competitionId === 'string' ? row.competitionId.trim() : '';
  const season = typeof row.season === 'number' ? row.season : Number(row.season);
  if (!(FANTASY_DEADLINE_COMPETITIONS as readonly string[]).includes(competitionId)) return null;
  if (!Number.isInteger(season) || season < 2020 || season > 2035) return null;
  return { competitionId, season };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function envelopeFailed(payload: unknown): boolean {
  const row = asRecord(payload);
  if (!row) return true;
  const errors = row.errors;
  if (errors == null) return false;
  if (Array.isArray(errors)) return errors.length > 0;
  if (typeof errors === 'string') return errors.trim().length > 0;
  if (typeof errors === 'object') return Object.keys(errors as object).length > 0;
  return false;
}

export type DeadlineFixture = {
  season?: number;
  round?: string;
  kickoff: string;
  status: FantasyDeadlineStatus;
};

/**
 * Deadline for a round is the earliest kickoff that has not started.
 * If every loaded fixture has started, the earliest kickoff stays so the round remains locked.
 * Cancelled fixtures are omitted. A later sync must not be able to move this later; Postgres least() enforces that.
 */
export function deadlinesFromFixtures(
  fixtures: readonly DeadlineFixture[],
  season: number,
): FantasyRoundDeadline[] {
  const byRound = new Map<string, DeadlineFixture[]>();
  for (const fixture of fixtures) {
    if (fixture.season != null && fixture.season !== season) continue;
    if (fixture.status === 'skip') continue;
    const roundId = fixture.round?.trim() ?? '';
    if (roundId.length < 1 || roundId.length > 80 || /[\n\r]/.test(roundId)) continue;
    if (!Number.isFinite(Date.parse(fixture.kickoff))) continue;
    const list = byRound.get(roundId) ?? [];
    list.push(fixture);
    byRound.set(roundId, list);
  }
  const rows: FantasyRoundDeadline[] = [];
  for (const [roundId, list] of byRound) {
    let upcoming: number | null = null;
    let earliest: number | null = null;
    for (const fixture of list) {
      const kick = Date.parse(fixture.kickoff);
      if (earliest == null || kick < earliest) earliest = kick;
      if (fixture.status === 'upcoming' && (upcoming == null || kick < upcoming)) upcoming = kick;
    }
    const deadline = upcoming ?? earliest;
    if (deadline == null) continue;
    rows.push({ roundId, deadlineAt: new Date(deadline).toISOString() });
  }
  rows.sort((a, b) => a.roundId.localeCompare(b.roundId));
  return rows;
}

export function deadlinesFromBffPayload(payload: unknown, season: number): FantasyRoundDeadline[] | null {
  if (envelopeFailed(payload)) return null;
  const row = asRecord(payload);
  const response = row ? row.response : payload;
  if (!Array.isArray(response)) return null;
  const fixtures: DeadlineFixture[] = [];
  for (const item of response) {
    const fixtureRow = asRecord(item);
    if (!fixtureRow) continue;
    const fixture = asRecord(fixtureRow.fixture);
    const league = asRecord(fixtureRow.league);
    if (!fixture) continue;
    const status = fantasyKickoffStatus(
      fixture.status && typeof fixture.status === 'object'
        ? ((asRecord(fixture.status)?.short as string | undefined) ?? undefined)
        : undefined,
    );
    if (status === 'skip') continue;
    const kickoff = typeof fixture.date === 'string' ? fixture.date : '';
    const round = typeof league?.round === 'string' ? league.round : undefined;
    const fixtureSeason = typeof league?.season === 'number' ? league.season : undefined;
    if (!kickoff) continue;
    fixtures.push({ season: fixtureSeason, round, kickoff, status });
    if (fixtures.length >= 400) break;
  }
  return deadlinesFromFixtures(fixtures, season);
}

export function fantasyFixturesUrl(bffUrl: string, competitionId: string, now: Date, season: number): string {
  const root = bffUrl.trim().replace(/\/+$/, '');
  const from = new Date(now);
  from.setUTCDate(from.getUTCDate() - 14);
  const to = new Date(now);
  to.setUTCDate(to.getUTCDate() + 21);
  const iso = (date: Date) => date.toISOString().slice(0, 10);
  const params = new URLSearchParams();
  params.set('league', competitionId);
  params.set('season', String(season));
  params.set('from', iso(from));
  params.set('to', iso(to));
  return `${root}/fixtures?${params.toString()}`;
}

export async function runFantasyDeadlineSync(input: {
  competitionId: string;
  season: number;
  now: number;
  bffUrl: string;
  fetchImpl?: typeof fetch;
  loadFetchedAt: () => Promise<number | null>;
  saveDeadlines: (rows: FantasyRoundDeadline[]) => Promise<void>;
}): Promise<{ ok: true; fetched: boolean; rounds: number } | { ok: false; reason: string }> {
  const request = readFantasySyncRequest({ competitionId: input.competitionId, season: input.season });
  if (!request) return { ok: false, reason: 'invalid_competition' };
  const fetchedAt = await input.loadFetchedAt();
  if (fetchedAt != null && input.now - fetchedAt >= 0 && input.now - fetchedAt < FANTASY_DEADLINE_FRESH_MS) {
    return { ok: true, fetched: false, rounds: 0 };
  }
  const fetchImpl = input.fetchImpl ?? fetch;
  let payload: unknown;
  try {
    const response = await fetchImpl(fantasyFixturesUrl(input.bffUrl, request.competitionId, new Date(input.now), request.season));
    if (!response.ok) return { ok: false, reason: 'deadline_unavailable' };
    payload = await response.json();
  } catch {
    return { ok: false, reason: 'deadline_unavailable' };
  }
  const rows = deadlinesFromBffPayload(payload, request.season);
  if (!rows) return { ok: false, reason: 'deadline_unavailable' };
  await input.saveDeadlines(rows);
  return { ok: true, fetched: true, rounds: rows.length };
}

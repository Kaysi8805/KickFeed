/**
 * Pure favorite-push planning and dispatch.
 * No Deno / Expo / Supabase imports so Vitest and the Edge Function can share it.
 * Timing constants are locked to lib/matchSocial.ts by unit tests.
 */

export const REMOTE_KICKOFF_SOON_MS = 30 * 60_000;
export const REMOTE_KICKOFF_LEAD_MS = 15 * 60_000;
export const REMOTE_KICKOFF_HORIZON_MS = 6 * 60 * 60_000;
export const REMOTE_LIVE_KICKOFF_GRACE_MS = 10 * 60_000;
/** Same spirit as MAX_DEVICE_ALERTS_PER_SYNC. */
export const REMOTE_MAX_ALERTS_PER_USER = 3;
export const REMOTE_MAX_MESSAGES_PER_RUN = 60;
export const REMOTE_MAX_PRESENTED = 80;
export const REMOTE_MAX_FAVORITE_TEAMS = 40;
/** Live / kickoff-soon leagues. Stays inside the free BFF budget. */
export const REMOTE_FETCH_LIVE_MS = 10 * 60_000;
/** Idle leagues. Discovery only — not a live ticker. */
export const REMOTE_FETCH_IDLE_MS = 60 * 60_000;
export const REMOTE_INTERESTING_BEFORE_MS = 45 * 60_000;
export const REMOTE_PUSH_LEAGUE_IDS = ['39', '40', '332', '140'] as const;
export const EXPO_PUSH_SEND_URL = 'https://exp.host/--/api/v2/push/send';
export const MATCHES_CHANNEL_ID = 'matches';
export const DISPATCH_SECRET_HEADER = 'x-kickfeed-dispatch-secret';

const EXPO_PUSH_TOKEN_RE = /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,140}\]$/;
const FINISHED = new Set(['FT', 'AET', 'PEN', 'AWD', 'WO']);
const LIVE = new Set(['1H', '2H', 'ET', 'BT', 'P', 'LIVE', 'INT', 'SUSP']);
const UPCOMING = new Set(['NS', 'TBD', 'PST']);

export type RemoteMatchStatus = 'upcoming' | 'live' | 'ht' | 'finished';

export type RemoteMatch = {
  id: string;
  status: RemoteMatchStatus;
  kickoff: string;
  homeTeamId: string;
  awayTeamId: string;
  homeCode: string;
  awayCode: string;
  homeScore: number;
  awayScore: number;
};

export type RemotePushPrefs = {
  enabled: boolean;
  kickoff: boolean;
  goals: boolean;
};

export type RemoteSnapshot = {
  scores: Record<string, { home: number; away: number }>;
  presented: string[];
  scheduled: Record<string, number>;
};

export type RemotePlanAlert =
  | {
      action: 'present';
      type: 'kickoff' | 'goal';
      fingerprint: string;
      matchId: string;
      title: string;
      body: string;
    }
  | {
      action: 'schedule';
      type: 'kickoff';
      fingerprint: string;
      matchId: string;
      title: string;
      body: string;
      at: number;
    }
  | { action: 'cancel'; fingerprint: string };

export type RemotePushDevice = {
  id: string;
  userId: string;
  expoPushToken: string;
  platform: 'ios' | 'android';
  enabled: boolean;
  kickoff: boolean;
  goals: boolean;
  favoriteTeamIds: string[];
};

export type LeagueCache = {
  leagueId: string;
  fetchedAt: number;
  matches: RemoteMatch[];
};

export type ExpoPushMessage = {
  to: string;
  title: string;
  body: string;
  sound: null;
  channelId: typeof MATCHES_CHANNEL_ID;
  priority: 'high';
  ttl: number;
  data: {
    matchId?: string;
    type: 'kickoff' | 'goal' | 'test';
    fingerprint?: string;
  };
};

export type ExpoPushTicket = {
  token: string;
  ok: boolean;
  error?: string;
};

export function emptyRemoteSnapshot(): RemoteSnapshot {
  return { scores: {}, presented: [], scheduled: {} };
}

export function isExpoPushToken(value: unknown): value is string {
  return typeof value === 'string' && EXPO_PUSH_TOKEN_RE.test(value.trim());
}

export function normalizeExpoPushToken(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const token = value.trim();
  return isExpoPushToken(token) ? token : null;
}

export function remoteKickoffFingerprint(userId: string, matchId: string): string {
  return `kickoff:${userId}:${matchId}`;
}

export function remoteGoalFingerprint(userId: string, matchId: string, home: number, away: number): string {
  return `goal:${userId}:${matchId}:${home}-${away}`;
}

export function secretsMatch(expected: string | undefined, provided: string | null | undefined): boolean {
  const a = expected ?? '';
  const b = provided ?? '';
  if (a.length < 16 || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function authorizeDispatch(input: {
  dispatchSecret: string | undefined;
  headerSecret: string | null;
  mode: unknown;
  userId: string | null;
}): { ok: true; mode: 'dispatch' } | { ok: true; mode: 'test'; userId: string } | { ok: false; status: number; reason: string } {
  if (secretsMatch(input.dispatchSecret, input.headerSecret)) {
    return { ok: true, mode: 'dispatch' };
  }
  if (input.mode === 'test' && input.userId) {
    return { ok: true, mode: 'test', userId: input.userId };
  }
  return { ok: false, status: 401, reason: 'unauthorized' };
}

export function pushFavoriteTeamIds(input: {
  teamIds: readonly string[];
  playerIds?: readonly string[];
  relatedTeamIds: (teamId: string) => readonly string[];
  teamIdForPlayer?: (playerId: string) => string | undefined;
}): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (id: string | undefined) => {
    const trimmed = id?.trim();
    if (!trimmed || trimmed.length > 64 || seen.has(trimmed)) return;
    seen.add(trimmed);
    out.push(trimmed);
  };
  const addTeam = (teamId: string | undefined) => {
    if (!teamId) return;
    const related = input.relatedTeamIds(teamId);
    if (!related.length) add(teamId);
    for (const rel of related) add(rel);
  };
  for (const id of input.teamIds) addTeam(id);
  for (const playerId of input.playerIds ?? []) {
    addTeam(input.teamIdForPlayer?.(playerId));
  }
  return out.slice(0, REMOTE_MAX_FAVORITE_TEAMS);
}

export function alertsForLocalDelivery<T extends { action: 'present' | 'schedule' | 'cancel'; fingerprint: string }>(
  alerts: T[],
  remote: { synced: boolean; appActive: boolean },
): T[] {
  if (!remote.synced) return alerts;
  const out: T[] = [];
  for (const alert of alerts) {
    if (alert.action === 'schedule') {
      out.push({ action: 'cancel', fingerprint: alert.fingerprint } as T);
      continue;
    }
    if (alert.action === 'present' && !remote.appActive) continue;
    out.push(alert);
  }
  return out;
}

/**
 * Once Expo push is saved, the server owns T−15 reminders.
 * Drop them from the on-device snapshot and cancel any DATE trigger already armed,
 * so a later offline fallback can schedule them again.
 */
export function handoffSchedulesToRemote<T extends { action: string; fingerprint: string }, S extends { scheduled: Record<string, number> }>(
  alerts: T[],
  snapshot: S,
  synced: boolean,
): { alerts: T[]; snapshot: S } {
  if (!synced) return { alerts, snapshot };
  const extra = Object.keys(snapshot.scheduled)
    .filter((fp) => !alerts.some((alert) => alert.action === 'cancel' && alert.fingerprint === fp))
    .map((fp) => ({ action: 'cancel', fingerprint: fp }) as T);
  return {
    alerts: [...alerts, ...extra],
    snapshot: { ...snapshot, scheduled: {} },
  };
}

export function remoteMatchStatus(short: string | null | undefined): RemoteMatchStatus | 'skip' {
  const code = (short ?? '').toUpperCase();
  if (code === 'HT') return 'ht';
  if (LIVE.has(code)) return 'live';
  if (FINISHED.has(code)) return 'finished';
  if (UPCOMING.has(code) || !code) return 'upcoming';
  if (code === 'CANC' || code === 'ABD') return 'skip';
  return 'upcoming';
}

export function europeanSeasonYear(now: Date): number {
  const year = now.getUTCFullYear();
  return now.getUTCMonth() >= 6 ? year : year - 1;
}

export function remoteFixtureQuery(now: Date, seasonOverride?: number): { season: number; from: string; to: string } {
  const from = new Date(now);
  from.setUTCDate(from.getUTCDate() - 14);
  const to = new Date(now);
  to.setUTCDate(to.getUTCDate() + 21);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return {
    season: seasonOverride ?? europeanSeasonYear(now),
    from: iso(from),
    to: iso(to),
  };
}

export function remoteFixturesUrl(bffUrl: string, leagueId: string, now: Date, seasonOverride?: number): string {
  const root = bffUrl.trim().replace(/\/+$/, '');
  const q = remoteFixtureQuery(now, seasonOverride);
  const params = new URLSearchParams();
  params.set('league', leagueId);
  params.set('season', String(q.season));
  params.set('from', q.from);
  params.set('to', q.to);
  return `${root}/fixtures?${params.toString()}`;
}

function teamCode(ref: Record<string, unknown> | undefined): string {
  const code = ref && typeof ref.code === 'string' ? ref.code.trim() : '';
  if (code) return code.toUpperCase().slice(0, 3);
  const name = ref && typeof ref.name === 'string' ? ref.name : '';
  const letters = name.replace(/[^A-Za-z]/g, '');
  return (letters.slice(0, 3) || 'FC').toUpperCase();
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

export function bffEnvelopeFailed(payload: unknown): boolean {
  const row = asRecord(payload);
  if (!row) return true;
  const errors = row.errors;
  if (errors == null) return false;
  if (Array.isArray(errors)) return errors.length > 0;
  if (typeof errors === 'string') return errors.trim().length > 0;
  if (typeof errors === 'object') return Object.keys(errors as object).length > 0;
  return false;
}

export function parseBffFixtures(payload: unknown): RemoteMatch[] {
  if (bffEnvelopeFailed(payload)) return [];
  const row = asRecord(payload);
  const response = row ? row.response : payload;
  if (!Array.isArray(response)) return [];
  const matches: RemoteMatch[] = [];
  const seen = new Set<string>();
  for (const item of response) {
    const fixtureRow = asRecord(item);
    if (!fixtureRow) continue;
    const fixture = asRecord(fixtureRow.fixture);
    const teams = asRecord(fixtureRow.teams);
    const goals = asRecord(fixtureRow.goals);
    const home = asRecord(teams?.home);
    const away = asRecord(teams?.away);
    if (!fixture || !home || !away) continue;
    const status = remoteMatchStatus(typeof fixture.status === 'object' && fixture.status
      ? (asRecord(fixture.status)?.short as string | undefined)
      : undefined);
    if (status === 'skip') continue;
    const id = fixture.id == null ? '' : String(fixture.id).trim();
    const homeId = home.id == null ? '' : String(home.id).trim();
    const awayId = away.id == null ? '' : String(away.id).trim();
    const kickoff = typeof fixture.date === 'string' ? fixture.date : '';
    if (!id || !homeId || !awayId || !kickoff || seen.has(id)) continue;
    seen.add(id);
    const homeScore = typeof goals?.home === 'number' ? goals.home : 0;
    const awayScore = typeof goals?.away === 'number' ? goals.away : 0;
    matches.push({
      id,
      status,
      kickoff,
      homeTeamId: homeId,
      awayTeamId: awayId,
      homeCode: teamCode(home),
      awayCode: teamCode(away),
      homeScore,
      awayScore,
    });
    if (matches.length >= 400) break;
  }
  return matches;
}

export function parseRemoteSnapshot(value: unknown): RemoteSnapshot {
  const empty = emptyRemoteSnapshot();
  const row = asRecord(value);
  if (!row) return empty;
  const scores: RemoteSnapshot['scores'] = {};
  const rawScores = asRecord(row.scores);
  if (rawScores) {
    for (const [id, entry] of Object.entries(rawScores)) {
      const score = asRecord(entry);
      if (!score || typeof score.home !== 'number' || typeof score.away !== 'number') continue;
      scores[id] = { home: score.home, away: score.away };
    }
  }
  const presented = Array.isArray(row.presented)
    ? row.presented.filter((id): id is string => typeof id === 'string').slice(-REMOTE_MAX_PRESENTED)
    : [];
  const scheduled: Record<string, number> = {};
  const rawScheduled = asRecord(row.scheduled);
  if (rawScheduled) {
    for (const [id, at] of Object.entries(rawScheduled)) {
      if (typeof at === 'number' && Number.isFinite(at)) scheduled[id] = at;
    }
  }
  return { scores, presented, scheduled };
}

function scoreLabel(match: RemoteMatch): string {
  if (match.status === 'upcoming') return `${match.homeCode} vs ${match.awayCode}`;
  return `${match.homeCode} ${match.homeScore}–${match.awayScore} ${match.awayCode}`;
}

function kickoffCopy(match: RemoteMatch, kind: 'soon' | 'live'): { title: string; body: string } {
  const label = scoreLabel(match);
  if (kind === 'soon') {
    return { title: `Kickoff soon — ${label}`, body: 'Starts soon. Open the match hub.' };
  }
  return { title: `Kickoff — ${label}`, body: `${label} is live. Join the match hub.` };
}

function goalCopy(match: RemoteMatch): { title: string; body: string } {
  const label = scoreLabel(match);
  return { title: `GOAL — ${label}`, body: `${label} · score update` };
}

function cloneSnapshot(snapshot: RemoteSnapshot): RemoteSnapshot {
  return {
    scores: { ...snapshot.scores },
    presented: [...snapshot.presented],
    scheduled: { ...snapshot.scheduled },
  };
}

function markPresented(snapshot: RemoteSnapshot, fingerprint: string): void {
  if (!snapshot.presented.includes(fingerprint)) snapshot.presented.push(fingerprint);
  delete snapshot.scheduled[fingerprint];
  if (snapshot.presented.length > REMOTE_MAX_PRESENTED) {
    snapshot.presented = snapshot.presented.slice(-REMOTE_MAX_PRESENTED);
  }
}

function touches(match: RemoteMatch, teamIds: readonly string[]): boolean {
  if (!teamIds.length) return false;
  const ids = new Set(teamIds);
  return ids.has(match.homeTeamId) || ids.has(match.awayTeamId);
}

function emitKickoffPresent(
  alerts: RemotePlanAlert[],
  snapshot: RemoteSnapshot,
  match: RemoteMatch,
  fingerprint: string,
  copy: { title: string; body: string },
): void {
  if (snapshot.scheduled[fingerprint] != null) alerts.push({ action: 'cancel', fingerprint });
  alerts.push({
    action: 'present',
    type: 'kickoff',
    fingerprint,
    matchId: match.id,
    title: copy.title,
    body: copy.body,
  });
  markPresented(snapshot, fingerprint);
}

export function planRemoteFavoritePushes(input: {
  userId: string;
  teamIds: readonly string[];
  prefs: RemotePushPrefs;
  matches: readonly RemoteMatch[];
  snapshot: RemoteSnapshot;
  now?: number;
  retainUnseen?: boolean;
}): { alerts: RemotePlanAlert[]; snapshot: RemoteSnapshot } {
  const now = input.now ?? Date.now();
  const snapshot = cloneSnapshot(input.snapshot);
  const alerts: RemotePlanAlert[] = [];
  const seenMatch = new Set<string>();
  const keepScheduled = new Set<string>();
  const notify = input.prefs.enabled;
  const wantKickoff = notify && input.prefs.kickoff;
  const wantGoals = notify && input.prefs.goals;

  for (const match of input.matches) {
    if (!touches(match, input.teamIds)) continue;
    seenMatch.add(match.id);
    const prev = snapshot.scores[match.id];
    const live = match.status === 'live' || match.status === 'ht';
    const ko = Date.parse(match.kickoff);
    const until = Number.isFinite(ko) ? ko - now : Number.POSITIVE_INFINITY;

    if (live) {
      if (
        wantGoals &&
        prev &&
        (match.homeScore > prev.home || match.awayScore > prev.away) &&
        match.homeScore + match.awayScore > 0
      ) {
        const fp = remoteGoalFingerprint(input.userId, match.id, match.homeScore, match.awayScore);
        if (!snapshot.presented.includes(fp)) {
          const copy = goalCopy(match);
          alerts.push({
            action: 'present',
            type: 'goal',
            fingerprint: fp,
            matchId: match.id,
            title: copy.title,
            body: copy.body,
          });
          markPresented(snapshot, fp);
        }
      }
      snapshot.scores[match.id] = { home: match.homeScore, away: match.awayScore };
    } else if (match.status === 'upcoming') {
      snapshot.scores[match.id] = prev ?? { home: 0, away: 0 };
    }

    const fpKick = remoteKickoffFingerprint(input.userId, match.id);
    const alreadyKick = snapshot.presented.includes(fpKick);
    if (wantKickoff && !alreadyKick) {
      if (live && until >= -REMOTE_LIVE_KICKOFF_GRACE_MS) {
        emitKickoffPresent(alerts, snapshot, match, fpKick, kickoffCopy(match, 'live'));
      } else if (
        match.status === 'upcoming' &&
        until <= REMOTE_KICKOFF_SOON_MS &&
        until >= -REMOTE_LIVE_KICKOFF_GRACE_MS
      ) {
        emitKickoffPresent(alerts, snapshot, match, fpKick, kickoffCopy(match, 'soon'));
      } else if (
        match.status === 'upcoming' &&
        until > REMOTE_KICKOFF_SOON_MS &&
        until <= REMOTE_KICKOFF_HORIZON_MS
      ) {
        const at = ko - REMOTE_KICKOFF_LEAD_MS;
        keepScheduled.add(fpKick);
        if (snapshot.scheduled[fpKick] !== at) {
          const copy = kickoffCopy(match, 'soon');
          alerts.push({
            action: 'schedule',
            type: 'kickoff',
            fingerprint: fpKick,
            matchId: match.id,
            at,
            ...copy,
          });
          snapshot.scheduled[fpKick] = at;
        }
      }
    } else if (alreadyKick) {
      delete snapshot.scheduled[fpKick];
    } else if (wantKickoff && snapshot.scheduled[fpKick] && match.status === 'upcoming') {
      keepScheduled.add(fpKick);
    }
  }

  for (const fp of Object.keys(snapshot.scheduled)) {
    if (keepScheduled.has(fp)) continue;
    if (input.retainUnseen) {
      const matchId = fp.startsWith(`kickoff:${input.userId}:`) ? fp.slice(`kickoff:${input.userId}:`.length) : '';
      if (matchId && !seenMatch.has(matchId)) continue;
    }
    alerts.push({ action: 'cancel', fingerprint: fp });
    delete snapshot.scheduled[fp];
  }

  if (!input.retainUnseen) {
    for (const id of Object.keys(snapshot.scores)) {
      if (!seenMatch.has(id)) delete snapshot.scores[id];
    }
  }

  const present = alerts.filter((alert) => alert.action === 'present');
  if (present.length <= REMOTE_MAX_ALERTS_PER_USER) return { alerts, snapshot };
  const kept = new Set(present.slice(0, REMOTE_MAX_ALERTS_PER_USER).map((alert) => alert.fingerprint));
  const trimmed: RemotePlanAlert[] = [];
  for (const alert of alerts) {
    if (alert.action === 'present' && !kept.has(alert.fingerprint)) {
      snapshot.presented = snapshot.presented.filter((id) => id !== alert.fingerprint);
      continue;
    }
    trimmed.push(alert);
  }
  return { alerts: trimmed, snapshot };
}

export function leagueIsInteresting(matches: readonly RemoteMatch[], now: number): boolean {
  for (const match of matches) {
    if (match.status === 'live' || match.status === 'ht') return true;
    if (match.status !== 'upcoming') continue;
    const ko = Date.parse(match.kickoff);
    if (!Number.isFinite(ko)) continue;
    const until = ko - now;
    if (until <= REMOTE_INTERESTING_BEFORE_MS && until >= -REMOTE_LIVE_KICKOFF_GRACE_MS) return true;
  }
  return false;
}

export function leagueNeedsFetch(cache: LeagueCache | undefined, now: number): boolean {
  if (!cache) return true;
  const age = now - cache.fetchedAt;
  if (!Number.isFinite(age) || age < 0) return true;
  return age >= (leagueIsInteresting(cache.matches, now) ? REMOTE_FETCH_LIVE_MS : REMOTE_FETCH_IDLE_MS);
}

export function selectLeaguesToFetch(input: {
  now: number;
  leagueIds: readonly string[];
  cache: readonly LeagueCache[];
}): { fetchIds: string[]; matches: RemoteMatch[] } {
  const byId = new Map(input.cache.map((row) => [row.leagueId, row]));
  const fetchIds: string[] = [];
  const matches: RemoteMatch[] = [];
  for (const id of input.leagueIds) {
    const row = byId.get(id);
    if (leagueNeedsFetch(row, input.now)) fetchIds.push(id);
    else if (row) matches.push(...row.matches);
  }
  return { fetchIds, matches };
}

export function expoMessageForAlert(
  token: string,
  alert: Extract<RemotePlanAlert, { action: 'present' }>,
): ExpoPushMessage {
  return {
    to: token,
    title: alert.title,
    body: alert.body,
    sound: null,
    channelId: MATCHES_CHANNEL_ID,
    priority: 'high',
    ttl: alert.type === 'goal' ? 600 : 1800,
    data: { matchId: alert.matchId, type: alert.type, fingerprint: alert.fingerprint },
  };
}

export function expoTestMessage(token: string): ExpoPushMessage {
  return {
    to: token,
    title: 'KickFeed',
    body: 'Remote match alerts are on for your favorite clubs.',
    sound: null,
    channelId: MATCHES_CHANNEL_ID,
    priority: 'high',
    ttl: 300,
    data: { type: 'test' },
  };
}

export function parseExpoPushTickets(body: unknown, tokens: string[]): ExpoPushTicket[] {
  const row = asRecord(body);
  const data = row ? row.data : undefined;
  const list = Array.isArray(data) ? data : data ? [data] : [];
  return tokens.map((token, index) => {
    const ticket = asRecord(list[index]);
    if (!ticket) return { token, ok: false, error: 'missing-ticket' };
    if (ticket.status === 'ok') return { token, ok: true };
    const details = asRecord(ticket.details);
    const detailError = typeof details?.error === 'string' ? details.error : undefined;
    const message = typeof ticket.message === 'string' ? ticket.message : undefined;
    const error = detailError ?? (message?.includes('DeviceNotRegistered') ? 'DeviceNotRegistered' : message) ?? 'error';
    return { token, ok: false, error };
  });
}

export async function postExpoPush(
  messages: ExpoPushMessage[],
  fetchImpl: typeof fetch,
  accessToken?: string,
): Promise<ExpoPushTicket[]> {
  const tickets: ExpoPushTicket[] = [];
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
    if (accessToken?.trim()) headers.Authorization = `Bearer ${accessToken.trim()}`;
    const res = await fetchImpl(EXPO_PUSH_SEND_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(chunk),
    });
    if (!res.ok) {
      throw new Error(`Expo push HTTP ${res.status}`);
    }
    const json: unknown = await res.json();
    tickets.push(...parseExpoPushTickets(json, chunk.map((message) => message.to)));
  }
  return tickets;
}

export type PushDispatchStore = {
  listEnabledDevices(): Promise<RemotePushDevice[]>;
  loadSnapshots(userIds: string[]): Promise<Record<string, RemoteSnapshot>>;
  saveSnapshot(userId: string, snapshot: RemoteSnapshot): Promise<void>;
  disableTokens(tokens: string[]): Promise<void>;
  loadFixtureCache(): Promise<LeagueCache[]>;
  saveFixtureCache(row: LeagueCache): Promise<void>;
};

export type DispatchResult = {
  ok: boolean;
  mode: 'dispatch' | 'test';
  sent: number;
  reason?: string;
  fetchedLeagues: string[];
  cachedLeagues: string[];
};

function dedupeMatches(matches: RemoteMatch[]): RemoteMatch[] {
  const byId = new Map<string, RemoteMatch>();
  for (const match of matches) byId.set(match.id, match);
  return [...byId.values()];
}

function deviceWantsAlert(device: RemotePushDevice, alert: Extract<RemotePlanAlert, { action: 'present' }>, match: RemoteMatch | undefined): boolean {
  if (!match || !isExpoPushToken(device.expoPushToken)) return false;
  const ids = new Set(device.favoriteTeamIds);
  if (!ids.has(match.homeTeamId) && !ids.has(match.awayTeamId)) return false;
  if (alert.type === 'kickoff') return device.kickoff;
  return device.goals;
}

async function disableRegistered(store: PushDispatchStore, tickets: ExpoPushTicket[]): Promise<void> {
  const dead = tickets.filter((ticket) => ticket.error === 'DeviceNotRegistered').map((ticket) => ticket.token);
  if (dead.length) await store.disableTokens(dead);
}

export async function runFavoritePushDispatch(input: {
  mode: 'dispatch' | 'test';
  testUserId?: string;
  now?: number;
  bffUrl: string;
  season?: number;
  store: PushDispatchStore;
  fetchImpl?: typeof fetch;
  expoAccessToken?: string;
  leagueIds?: readonly string[];
}): Promise<DispatchResult> {
  const now = input.now ?? Date.now();
  const fetchImpl = input.fetchImpl ?? fetch;
  const leagueIds = input.leagueIds ?? REMOTE_PUSH_LEAGUE_IDS;
  const devices = (await input.store.listEnabledDevices()).filter((device) => device.enabled && isExpoPushToken(device.expoPushToken));

  if (input.mode === 'test') {
    const mine = devices.filter((device) => device.userId === input.testUserId).slice(0, 3);
    if (!mine.length) {
      return { ok: false, mode: 'test', sent: 0, reason: 'no-device', fetchedLeagues: [], cachedLeagues: [] };
    }
    const tickets = await postExpoPush(mine.map((device) => expoTestMessage(device.expoPushToken)), fetchImpl, input.expoAccessToken);
    await disableRegistered(input.store, tickets);
    return {
      ok: tickets.some((ticket) => ticket.ok),
      mode: 'test',
      sent: tickets.filter((ticket) => ticket.ok).length,
      reason: tickets.some((ticket) => ticket.ok) ? undefined : 'expo',
      fetchedLeagues: [],
      cachedLeagues: [],
    };
  }

  if (!devices.length) {
    return { ok: true, mode: 'dispatch', sent: 0, reason: 'no-devices', fetchedLeagues: [], cachedLeagues: [] };
  }

  const cache = await input.store.loadFixtureCache();
  const selection = selectLeaguesToFetch({ now, leagueIds, cache });
  const fetched: RemoteMatch[] = [];
  const fetchedLeagues: string[] = [];
  const failed = new Set<string>();
  for (const leagueId of selection.fetchIds) {
    const stale = cache.find((row) => row.leagueId === leagueId);
    try {
      const res = await fetchImpl(remoteFixturesUrl(input.bffUrl, leagueId, new Date(now), input.season));
      if (!res.ok) throw new Error(`bff ${res.status}`);
      const payload: unknown = await res.json();
      if (bffEnvelopeFailed(payload)) throw new Error('bff envelope');
      const matches = parseBffFixtures(payload);
      fetched.push(...matches);
      fetchedLeagues.push(leagueId);
      await input.store.saveFixtureCache({ leagueId, fetchedAt: now, matches });
    } catch {
      failed.add(leagueId);
      if (stale) fetched.push(...stale.matches);
    }
  }

  const matches = dedupeMatches([...selection.matches, ...fetched]);
  if (!matches.length && failed.size === selection.fetchIds.length && selection.fetchIds.length > 0) {
    return {
      ok: false,
      mode: 'dispatch',
      sent: 0,
      reason: 'fixtures-unavailable',
      fetchedLeagues,
      cachedLeagues: leagueIds.filter((id) => !selection.fetchIds.includes(id)),
    };
  }

  const byUser = new Map<string, RemotePushDevice[]>();
  for (const device of devices) {
    const list = byUser.get(device.userId) ?? [];
    list.push(device);
    byUser.set(device.userId, list);
  }
  const snapshots = await input.store.loadSnapshots([...byUser.keys()]);
  const matchById = new Map(matches.map((match) => [match.id, match]));
  const messages: ExpoPushMessage[] = [];
  const pending: { userId: string; snapshot: RemoteSnapshot; sends: boolean }[] = [];

  for (const [userId, userDevices] of byUser) {
    if (messages.length >= REMOTE_MAX_MESSAGES_PER_RUN) break;
    const teamIds: string[] = [];
    const seenTeams = new Set<string>();
    for (const device of userDevices) {
      for (const id of device.favoriteTeamIds) {
        if (seenTeams.has(id)) continue;
        seenTeams.add(id);
        teamIds.push(id);
      }
    }
    const plan = planRemoteFavoritePushes({
      userId,
      teamIds: teamIds.slice(0, REMOTE_MAX_FAVORITE_TEAMS),
      prefs: {
        enabled: true,
        kickoff: userDevices.some((device) => device.kickoff),
        goals: userDevices.some((device) => device.goals),
      },
      matches,
      snapshot: snapshots[userId] ?? emptyRemoteSnapshot(),
      now,
      retainUnseen: failed.size > 0,
    });
    const userMessages: ExpoPushMessage[] = [];
    for (const alert of plan.alerts) {
      if (alert.action !== 'present') continue;
      const match = matchById.get(alert.matchId);
      for (const device of userDevices) {
        if (!deviceWantsAlert(device, alert, match)) continue;
        userMessages.push(expoMessageForAlert(device.expoPushToken, alert));
      }
    }
    if (messages.length + userMessages.length > REMOTE_MAX_MESSAGES_PER_RUN) break;
    messages.push(...userMessages);
    pending.push({ userId, snapshot: plan.snapshot, sends: userMessages.length > 0 });
  }

  let sent = 0;
  let expoFailed = false;
  if (messages.length) {
    try {
      const tickets = await postExpoPush(messages, fetchImpl, input.expoAccessToken);
      await disableRegistered(input.store, tickets);
      sent = tickets.filter((ticket) => ticket.ok).length;
    } catch {
      expoFailed = true;
    }
  }

  for (const row of pending) {
    if (expoFailed && row.sends) continue;
    await input.store.saveSnapshot(row.userId, row.snapshot);
  }

  const cachedLeagues = leagueIds.filter((id) => !selection.fetchIds.includes(id));
  return {
    ok: !expoFailed,
    mode: 'dispatch',
    sent,
    reason: expoFailed ? 'expo' : undefined,
    fetchedLeagues,
    cachedLeagues,
  };
}

// Favorite kickoff/goal push. Deploy with --no-verify-jwt.
// Dispatch requires PUSH_DISPATCH_SECRET. mode=test requires the caller's user JWT.
// Football scores come from FOOTBALL_BFF_URL (default: the public KickFeed BFF). No API key here.
import { createClient } from 'npm:@supabase/supabase-js@2.116.0';

import {
  DISPATCH_SECRET_HEADER,
  REMOTE_PUSH_LEAGUE_IDS,
  authorizeDispatch,
  isExpoPushToken,
  parseRemoteSnapshot,
  runFavoritePushDispatch,
  type LeagueCache,
  type PushDispatchStore,
  type RemoteMatch,
  type RemotePushDevice,
  type RemoteSnapshot,
} from '../_shared/remotePushPlan.ts';

const LEAGUES = new Set<string>(REMOTE_PUSH_LEAGUE_IDS);

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function asMatches(value: unknown): RemoteMatch[] {
  if (!Array.isArray(value)) return [];
  const matches: RemoteMatch[] = [];
  for (const item of value) {
    const row = asRecord(item);
    if (!row) continue;
    const status = row.status;
    if (status !== 'upcoming' && status !== 'live' && status !== 'ht' && status !== 'finished') continue;
    if (typeof row.id !== 'string' || typeof row.kickoff !== 'string') continue;
    if (typeof row.homeTeamId !== 'string' || typeof row.awayTeamId !== 'string') continue;
    matches.push({
      id: row.id,
      status,
      kickoff: row.kickoff,
      homeTeamId: row.homeTeamId,
      awayTeamId: row.awayTeamId,
      homeCode: typeof row.homeCode === 'string' ? row.homeCode : 'FC',
      awayCode: typeof row.awayCode === 'string' ? row.awayCode : 'FC',
      homeScore: typeof row.homeScore === 'number' ? row.homeScore : 0,
      awayScore: typeof row.awayScore === 'number' ? row.awayScore : 0,
    });
  }
  return matches;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ ok: false, reason: 'method' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !serviceKey) return json({ ok: false, reason: 'config' }, 500);

  let body: Record<string, unknown> = {};
  try {
    const parsed: unknown = await req.json();
    body = asRecord(parsed) ?? {};
  } catch {
    body = {};
  }

  const headerSecret = req.headers.get(DISPATCH_SECRET_HEADER);
  const dispatchSecret = Deno.env.get('PUSH_DISPATCH_SECRET');
  let userId: string | null = null;
  const secretOk = authorizeDispatch({
    dispatchSecret,
    headerSecret,
    mode: 'dispatch',
    userId: null,
  }).ok;
  if (!secretOk && body.mode === 'test') {
    const header = req.headers.get('Authorization') ?? '';
    const jwt = header.replace(/^Bearer\s+/i, '').trim();
    if (jwt) {
      const adminAuth = createClient(supabaseUrl, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data, error } = await adminAuth.auth.getUser(jwt);
      if (!error && data.user?.id) userId = data.user.id;
    }
  }

  const auth = authorizeDispatch({
    dispatchSecret,
    headerSecret,
    mode: body.mode,
    userId,
  });
  if (!auth.ok) return json({ ok: false, reason: auth.reason }, auth.status);

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const store: PushDispatchStore = {
    async listEnabledDevices() {
      const { data, error } = await admin
        .from('push_devices')
        .select('id,user_id,expo_push_token,platform,enabled,kickoff,goals,favorite_team_ids')
        .eq('enabled', true)
        .limit(500);
      if (error) throw new Error(error.message);
      const devices: RemotePushDevice[] = [];
      for (const row of data ?? []) {
        const record = asRecord(row);
        if (!record || !isExpoPushToken(record.expo_push_token)) continue;
        const platform = record.platform === 'ios' || record.platform === 'android' ? record.platform : null;
        if (!platform || typeof record.user_id !== 'string' || typeof record.id !== 'string') continue;
        const teams = Array.isArray(record.favorite_team_ids)
          ? record.favorite_team_ids.filter((id): id is string => typeof id === 'string')
          : [];
        devices.push({
          id: record.id,
          userId: record.user_id,
          expoPushToken: record.expo_push_token.trim(),
          platform,
          enabled: record.enabled !== false,
          kickoff: record.kickoff !== false,
          goals: record.goals !== false,
          favoriteTeamIds: teams,
        });
      }
      return devices;
    },
    async loadSnapshots(userIds) {
      const out: Record<string, RemoteSnapshot> = {};
      if (!userIds.length) return out;
      const { data, error } = await admin
        .from('push_dispatch_state')
        .select('user_id,scores,presented,scheduled')
        .in('user_id', userIds);
      if (error) throw new Error(error.message);
      for (const row of data ?? []) {
        const record = asRecord(row);
        if (!record || typeof record.user_id !== 'string') continue;
        out[record.user_id] = parseRemoteSnapshot({
          scores: record.scores,
          presented: record.presented,
          scheduled: record.scheduled,
        });
      }
      return out;
    },
    async saveSnapshot(userId, snapshot) {
      const { error } = await admin.rpc('kickfeed_save_push_dispatch_state', {
        p_user_id: userId,
        p_scores: snapshot.scores,
        p_presented: snapshot.presented,
        p_scheduled: snapshot.scheduled,
      });
      if (error) throw new Error(error.message);
    },
    async disableTokens(tokens) {
      if (!tokens.length) return;
      const { error } = await admin
        .from('push_devices')
        .update({ enabled: false, updated_at: new Date().toISOString() })
        .in('expo_push_token', tokens);
      if (error) throw new Error(error.message);
    },
    async loadFixtureCache() {
      const { data, error } = await admin.from('push_fixture_cache').select('league_id,matches,fetched_at');
      if (error) throw new Error(error.message);
      const rows: LeagueCache[] = [];
      for (const row of data ?? []) {
        const record = asRecord(row);
        if (!record || typeof record.league_id !== 'string' || !LEAGUES.has(record.league_id)) continue;
        const fetchedAt = typeof record.fetched_at === 'string' ? Date.parse(record.fetched_at) : Number.NaN;
        if (!Number.isFinite(fetchedAt)) continue;
        rows.push({
          leagueId: record.league_id,
          fetchedAt,
          matches: asMatches(record.matches),
        });
      }
      return rows;
    },
    async saveFixtureCache(row) {
      const { error } = await admin.from('push_fixture_cache').upsert({
        league_id: row.leagueId,
        matches: row.matches,
        fetched_at: new Date(row.fetchedAt).toISOString(),
      });
      if (error) throw new Error(error.message);
    },
  };

  const seasonRaw = Deno.env.get('FOOTBALL_SEASON')?.trim();
  const season = seasonRaw && /^\d{4}$/.test(seasonRaw) ? Number(seasonRaw) : undefined;
  const bffUrl = (Deno.env.get('FOOTBALL_BFF_URL') ?? 'https://kickfeed-football-bff.kaysi8805.workers.dev').trim();

  try {
    const result = await runFavoritePushDispatch({
      mode: auth.mode,
      testUserId: auth.mode === 'test' ? auth.userId : undefined,
      bffUrl,
      season,
      store,
      expoAccessToken: Deno.env.get('EXPO_ACCESS_TOKEN') ?? undefined,
    });
    return json(result, result.ok ? 200 : 502);
  } catch (err) {
    console.log('dispatch-favorite-push failed', err instanceof Error ? err.message : 'error');
    return json({ ok: false, reason: 'dispatch' }, 500);
  }
});

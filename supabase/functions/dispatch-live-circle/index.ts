// Friend-went-live push. JWT verification stays on at the gateway.
// The caller must already have a fresh Live Circle heartbeat on this fixture.
import { createClient } from 'npm:@supabase/supabase-js@2.116.0';

import { liveCirclePushBody, LIVE_CIRCLE_PUSH_TITLE } from '../../../lib/liveCircle.ts';
import {
  isExpoPushToken,
  postExpoPush,
  type ExpoPushMessage,
} from '../_shared/remotePushPlan.ts';

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function cleanId(value: unknown, max = 80): string | null {
  if (typeof value !== 'string') return null;
  const id = value.trim();
  if (!id || id.length > max || /\s/.test(id)) return null;
  return id;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ ok: false, reason: 'method' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !serviceKey) return json({ ok: false, reason: 'config' }, 500);

  const header = req.headers.get('Authorization') ?? '';
  const jwt = header.replace(/^Bearer\s+/i, '').trim();
  if (!jwt) return json({ ok: false, reason: 'auth' }, 401);

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await admin.auth.getUser(jwt);
  const actorId = !userError ? userData.user?.id : undefined;
  if (!actorId) return json({ ok: false, reason: 'auth' }, 401);

  let body: Record<string, unknown> = {};
  try {
    body = asRecord(await req.json()) ?? {};
  } catch {
    body = {};
  }

  const fixtureId = cleanId(body.fixtureId);
  const homeTeamId = cleanId(body.homeTeamId, 64);
  const awayTeamId = cleanId(body.awayTeamId, 64);
  const fixtureLabel = typeof body.fixtureLabel === 'string' ? body.fixtureLabel.trim().slice(0, 80) : '';
  if (!fixtureId || !homeTeamId || !awayTeamId) return json({ ok: false, reason: 'fixture' }, 400);

  const { data: presence, error: presenceError } = await admin
    .from('live_circle_presence')
    .select('display_name,fixture_id,heartbeat_at')
    .eq('user_id', actorId)
    .maybeSingle();
  if (presenceError) return json({ ok: false, reason: 'presence' }, 500);
  const row = asRecord(presence);
  if (!row || row.fixture_id !== fixtureId) return json({ ok: false, reason: 'presence' }, 403);
  const beat = typeof row.heartbeat_at === 'string' ? Date.parse(row.heartbeat_at) : Number.NaN;
  if (!Number.isFinite(beat) || Date.now() - beat > 5 * 60 * 1000) {
    return json({ ok: false, reason: 'presence' }, 403);
  }
  const actorName = typeof row.display_name === 'string' ? row.display_name : 'A friend';

  const { data: claimed, error: claimError } = await admin.rpc('kickfeed_claim_live_circle_pushes', {
    p_actor_id: actorId,
    p_fixture_id: fixtureId,
    p_home_team_id: homeTeamId,
    p_away_team_id: awayTeamId,
  });
  if (claimError) return json({ ok: false, reason: 'claim' }, 500);

  const bodyCopy = liveCirclePushBody(actorName, fixtureLabel);
  const messages: ExpoPushMessage[] = [];
  const seen = new Set<string>();
  for (const item of Array.isArray(claimed) ? claimed : []) {
    const record = asRecord(item);
    if (!record || typeof record.recipient_id !== 'string') continue;
    const token = typeof record.expo_push_token === 'string' ? record.expo_push_token.trim() : '';
    if (!isExpoPushToken(token) || seen.has(token)) continue;
    seen.add(token);
    messages.push({
      to: token,
      title: LIVE_CIRCLE_PUSH_TITLE,
      body: bodyCopy,
      sound: null,
      channelId: 'matches',
      priority: 'high',
      ttl: 600,
      data: {
        matchId: fixtureId,
        type: 'live_circle',
        fingerprint: `live:${record.recipient_id}:${actorId}:${fixtureId}`,
      },
    });
  }

  if (!messages.length) return json({ ok: true, sent: 0 });

  try {
    const tickets = await postExpoPush(messages, fetch, Deno.env.get('EXPO_ACCESS_TOKEN') ?? undefined);
    const dead = tickets.filter((ticket) => ticket.error === 'DeviceNotRegistered').map((ticket) => ticket.token);
    if (dead.length) {
      await admin.from('push_devices').update({ enabled: false, updated_at: new Date().toISOString() }).in('expo_push_token', dead);
    }
    return json({ ok: true, sent: tickets.filter((ticket) => ticket.ok).length });
  } catch (err) {
    console.log('dispatch-live-circle failed', err instanceof Error ? err.message : 'error');
    return json({ ok: false, reason: 'dispatch' }, 502);
  }
});

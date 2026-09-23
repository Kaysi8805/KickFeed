// Stores fantasy round kickoffs from the football BFF. Leave JWT verification ON.
// The caller must be a member of a league for that competition and season.
// Deadlines are written with the service role. Clients cannot pass a deadline.
// FOOTBALL_BFF_URL defaults to the public KickFeed BFF. No API-Football key here.
import { createClient } from 'npm:@supabase/supabase-js@2.116.0';

import {
  readFantasySyncRequest,
  runFantasyDeadlineSync,
  type FantasyRoundDeadline,
} from '../_shared/fantasyDeadline.ts';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ ok: false, reason: 'method' }, 405);
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!url || !anon || !serviceKey) return json({ ok: false, reason: 'not_configured' }, 500);

  const authHeader = req.headers.get('Authorization') ?? '';
  const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return json({ ok: false, reason: 'not_authenticated' }, 401);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, reason: 'invalid_competition' }, 400);
  }
  const request = readFantasySyncRequest(body);
  if (!request) return json({ ok: false, reason: 'invalid_competition' }, 400);

  const { data: leagues, error: leagueError } = await userClient
    .from('fantasy_leagues')
    .select('id')
    .eq('competition_id', request.competitionId)
    .eq('season', request.season)
    .limit(1);
  if (leagueError || !leagues?.length) return json({ ok: false, reason: 'league_not_found' }, 403);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const bffUrl = (Deno.env.get('FOOTBALL_BFF_URL') ?? 'https://kickfeed-football-bff.kaysi8805.workers.dev').trim();
  try {
    const result = await runFantasyDeadlineSync({
      competitionId: request.competitionId,
      season: request.season,
      now: Date.now(),
      bffUrl,
      loadFetchedAt: async () => {
        const { data, error } = await admin
          .from('fantasy_deadline_sync')
          .select('fetched_at')
          .eq('competition_id', request.competitionId)
          .eq('season', request.season)
          .maybeSingle();
        if (error || !data) return null;
        const fetchedAt = Date.parse(String((data as { fetched_at?: unknown }).fetched_at ?? ''));
        return Number.isFinite(fetchedAt) ? fetchedAt : null;
      },
      saveDeadlines: async (rows: FantasyRoundDeadline[]) => {
        const { error } = await admin.rpc('kickfeed_sync_fantasy_round_deadlines', {
          p_competition: request.competitionId,
          p_season: request.season,
          p_rows: rows,
        });
        if (error) throw new Error(error.message);
      },
    });
    return json(result, result.ok ? 200 : 502);
  } catch (err) {
    console.log('sync-fantasy-deadlines failed', err instanceof Error ? err.message : 'error');
    return json({ ok: false, reason: 'deadline_unavailable' }, 500);
  }
});

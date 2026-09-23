import type { AuthMode } from '@/lib/userIdentity';
import { isExpoPushToken } from '@/lib/remotePush';

export type PushRemoteStatus = 'off' | 'pending' | 'synced' | 'error' | 'demo' | 'unconfigured' | 'local';

export function shouldPersistPushDevice(supabaseConfigured: boolean, authMode: AuthMode | null): boolean {
  return supabaseConfigured && authMode === 'supabase';
}

export function pushPlatform(os: string): 'ios' | 'android' | null {
  if (os === 'ios') return 'ios';
  if (os === 'android') return 'android';
  return null;
}

export type PushDeviceWriter = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

export function asPushDeviceClient(client: { rpc: PushDeviceWriter['rpc'] } | null): PushDeviceWriter | null {
  if (!client) return null;
  return client;
}

export function ackableFingerprints(userId: string, fingerprints: readonly string[]): string[] {
  const kick = `kickoff:${userId}:`;
  const goal = `goal:${userId}:`;
  const out: string[] = [];
  for (const fp of fingerprints) {
    if (fp.length < 8 || fp.length > 120 || /\s/.test(fp)) continue;
    if (!fp.startsWith(kick) && !fp.startsWith(goal)) continue;
    if (!out.includes(fp)) out.push(fp);
    if (out.length >= 10) break;
  }
  return out;
}

export async function upsertRemotePushDevice(
  client: PushDeviceWriter,
  input: {
    token: string;
    platform: 'ios' | 'android';
    enabled: boolean;
    kickoff: boolean;
    goals: boolean;
    favoriteTeamIds: readonly string[];
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isExpoPushToken(input.token)) return { ok: false, error: 'token' };
  try {
    const { error } = await client.rpc('kickfeed_upsert_push_device', {
      p_token: input.token.trim(),
      p_platform: input.platform,
      p_enabled: input.enabled,
      p_kickoff: input.kickoff,
      p_goals: input.goals,
      p_favorite_team_ids: input.favoriteTeamIds.slice(0, 40),
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'push device' };
  }
}

export async function ackRemotePushFingerprints(
  client: PushDeviceWriter,
  userId: string,
  fingerprints: readonly string[],
): Promise<void> {
  const incoming = ackableFingerprints(userId, fingerprints);
  if (!incoming.length) return;
  try {
    await client.rpc('kickfeed_ack_push_fingerprints', { p_fingerprints: incoming });
  } catch {
    /* next dispatch can still dedupe from its own snapshot */
  }
}

export type PushTestInvoker = {
  functions: {
    invoke: (
      name: string,
      options: { body: Record<string, unknown> },
    ) => Promise<{ data: unknown; error: { message: string } | null }>;
  };
};

export function remotePushTestMessage(data: unknown, error: { message: string } | null): { ok: boolean; message: string } {
  const row = data && typeof data === 'object' ? (data as { sent?: unknown; reason?: unknown; ok?: unknown }) : undefined;
  const reason = typeof row?.reason === 'string' ? row.reason : undefined;
  if (reason === 'no-device') {
    return {
      ok: false,
      message: 'No Expo token is saved for this account yet. Enable alerts on this phone, then try again.',
    };
  }
  const sent = typeof row?.sent === 'number' ? row.sent : 0;
  if (!error && row?.ok !== false && sent > 0) {
    return { ok: true, message: 'Remote test sent. Close KickFeed if you want to see it arrive as a banner.' };
  }
  return {
    ok: false,
    message: 'Remote test didn’t send. Deploy dispatch-favorite-push (see README) and try again.',
  };
}

export async function requestRemotePushTest(client: PushTestInvoker): Promise<{ ok: boolean; message: string }> {
  try {
    const { data, error } = await client.functions.invoke('dispatch-favorite-push', { body: { mode: 'test' } });
    return remotePushTestMessage(data, error);
  } catch {
    return {
      ok: false,
      message: 'Remote test didn’t send. Check your connection and the Supabase function deploy.',
    };
  }
}

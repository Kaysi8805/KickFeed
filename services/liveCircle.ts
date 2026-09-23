import type { LiveCirclePerson } from '@/lib/liveCircle';
import { isLiveCircleFixtureId, liveCircleProfilePayload } from '@/lib/liveCircle';
import { isPersistedUserId } from '@/lib/userIdentity';
import { getSupabaseClient } from '@/services/supabase';

export type LiveCircleRowError = { message: string };

export type LiveCircleClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
  from: (table: string) => {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
    };
  };
};

export type LiveCirclePushInvoker = {
  functions: {
    invoke: (
      name: string,
      options: { body: Record<string, unknown> },
    ) => Promise<{ data: unknown; error: { message: string } | null }>;
  };
};

const demoPresence = new Map<string, LiveCirclePerson>();

export function resetDemoPresenceForTests(): void {
  demoPresence.clear();
}

export function writeDemoPresence(row: LiveCirclePerson): void {
  demoPresence.set(row.userId, { ...row, optedIn: true });
}

export function clearDemoPresence(userId: string): void {
  demoPresence.delete(userId);
}

export function readDemoPresence(): LiveCirclePerson[] {
  return [...demoPresence.values()];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function parseRemoteLiveCircle(value: unknown): LiveCirclePerson | null {
  if (!isPlainObject(value)) return null;
  const userId = asString(value.user_id) ?? asString(value.userId);
  const fixtureId = asString(value.fixture_id) ?? asString(value.fixtureId);
  if (!userId || !isPersistedUserId(userId) || !fixtureId || !isLiveCircleFixtureId(fixtureId)) return null;
  const profile = liveCircleProfilePayload({
    name: asString(value.display_name) ?? asString(value.displayName) ?? 'Fan',
    handle: asString(value.handle) ?? 'fan',
    initials: asString(value.initials) ?? 'KF',
    avatarColor: asString(value.avatar_color) ?? asString(value.avatarColor) ?? '#22C55E',
  });
  const heartbeatAt = asString(value.heartbeat_at) ?? asString(value.heartbeatAt);
  if (!heartbeatAt || !Number.isFinite(Date.parse(heartbeatAt))) return null;
  return {
    userId,
    fixtureId,
    displayName: profile.displayName,
    handle: profile.handle,
    initials: profile.initials,
    avatarColor: profile.avatarColor,
    heartbeatAt,
    optedIn: true,
  };
}

export function asLiveCircleClient(
  client: {
    rpc?: LiveCircleClient['rpc'];
    from?: (table: string) => unknown;
  } | null,
): LiveCircleClient | null {
  if (!client?.rpc || !client.from) return null;
  const rpc = client.rpc.bind(client);
  const from = client.from.bind(client);
  return {
    rpc,
    from: (table: string) => {
      const query = from(table) as {
        select: (columns: string) => {
          eq: (
            column: string,
            value: string,
          ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
        };
      };
      return {
        select: (columns: string) => ({
          eq: (column: string, value: string) => query.select(columns).eq(column, value),
        }),
      };
    },
  };
}

export function liveCircleClient(): LiveCircleClient | null {
  return asLiveCircleClient(getSupabaseClient());
}

export async function setRemoteLiveCircle(
  client: LiveCircleClient | null,
  enabled: boolean,
): Promise<{ error: string | null }> {
  if (!client) return { error: 'not_configured' };
  try {
    const { error } = await client.rpc('kickfeed_set_live_circle', { p_enabled: enabled });
    return { error: error ? error.message : null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'live circle' };
  }
}

export async function fetchRemoteLiveCircleEnabled(client: LiveCircleClient | null, userId: string): Promise<boolean | null> {
  if (!client || !isPersistedUserId(userId)) return null;
  try {
    const { data, error } = await client.from('live_circle_settings').select('user_id,enabled').eq('user_id', userId);
    if (error) return null;
    const rows = Array.isArray(data) ? data : [];
    const row = rows.find((item) => isPlainObject(item) && item.user_id === userId);
    if (!row || !isPlainObject(row)) return false;
    return row.enabled === true;
  } catch {
    return null;
  }
}

export async function syncRemoteFollows(
  client: LiveCircleClient | null,
  followeeIds: readonly string[],
): Promise<{ error: string | null }> {
  if (!client) return { error: 'not_configured' };
  try {
    const { error } = await client.rpc('kickfeed_sync_follows', {
      p_followee_ids: followeeIds.filter((id) => isPersistedUserId(id)).slice(0, 200),
    });
    return { error: error ? error.message : null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'follows' };
  }
}

export async function touchRemoteLiveCircle(
  client: LiveCircleClient | null,
  input: {
    fixtureId: string;
    displayName: string;
    handle: string;
    initials: string;
    avatarColor: string;
  },
): Promise<{ started: boolean } | { error: string }> {
  if (!client) return { error: 'not_configured' };
  if (!isLiveCircleFixtureId(input.fixtureId)) return { error: 'bad_fixture' };
  const profile = liveCircleProfilePayload({
    name: input.displayName,
    handle: input.handle,
    initials: input.initials,
    avatarColor: input.avatarColor,
  });
  try {
    const { data, error } = await client.rpc('kickfeed_touch_live_circle', {
      p_fixture_id: input.fixtureId,
      p_display_name: profile.displayName,
      p_handle: profile.handle,
      p_initials: profile.initials,
      p_avatar_color: profile.avatarColor,
    });
    if (error) return { error: error.message };
    return { started: data === true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'presence' };
  }
}

export async function clearRemoteLiveCircle(client: LiveCircleClient | null): Promise<void> {
  if (!client) return;
  try {
    await client.rpc('kickfeed_clear_live_circle');
  } catch {
    /* the 5 minute idle window still hides a stuck row */
  }
}

export async function fetchRemoteLiveCircle(
  client: LiveCircleClient | null,
  fixtureId: string,
): Promise<LiveCirclePerson[]> {
  if (!client || !isLiveCircleFixtureId(fixtureId)) return [];
  try {
    const { data, error } = await client
      .from('live_circle_presence')
      .select('user_id,fixture_id,display_name,handle,initials,avatar_color,heartbeat_at')
      .eq('fixture_id', fixtureId);
    if (error || !Array.isArray(data)) return [];
    return data.map(parseRemoteLiveCircle).filter((row): row is LiveCirclePerson => row != null);
  } catch {
    return [];
  }
}

export async function requestLiveCirclePush(
  client: LiveCirclePushInvoker | null,
  input: { fixtureId: string; fixtureLabel: string; homeTeamId: string; awayTeamId: string },
): Promise<void> {
  if (!client || !isLiveCircleFixtureId(input.fixtureId)) return;
  try {
    await client.functions.invoke('dispatch-live-circle', {
      body: {
        fixtureId: input.fixtureId,
        fixtureLabel: input.fixtureLabel.slice(0, 80),
        homeTeamId: input.homeTeamId.slice(0, 64),
        awayTeamId: input.awayTeamId.slice(0, 64),
      },
    });
  } catch {
    /* in-app notice still lands for friends who have the match open */
  }
}

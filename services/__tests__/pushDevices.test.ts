import { describe, expect, it } from 'vitest';

import {
  ackableFingerprints,
  asPushDeviceClient,
  pushPlatform,
  remotePushTestMessage,
  requestRemotePushTest,
  shouldPersistPushDevice,
  upsertRemotePushDevice,
} from '@/services/pushDevices';

const USER = '22222222-2222-4222-8222-222222222222';
const TOKEN = 'ExponentPushToken[abcdefghijklmnopqrst]';

describe('push device client', () => {
  it('persists only for an email session and only on iOS or Android', () => {
    expect(shouldPersistPushDevice(true, 'supabase')).toBe(true);
    expect(shouldPersistPushDevice(true, 'demo')).toBe(false);
    expect(shouldPersistPushDevice(false, 'supabase')).toBe(false);
    expect(pushPlatform('ios')).toBe('ios');
    expect(pushPlatform('android')).toBe('android');
    expect(pushPlatform('web')).toBeNull();
    expect(asPushDeviceClient(null)).toBeNull();
  });

  it('acks only this user’s kickoff and goal fingerprints', () => {
    expect(
      ackableFingerprints(USER, [
        `kickoff:${USER}:9001`,
        `goal:${USER}:9001:2-0`,
        `kickoff:other:9001`,
        'nope',
        `goal:${USER}:9001:2-0`,
      ]),
    ).toEqual([`kickoff:${USER}:9001`, `goal:${USER}:9001:2-0`]);
  });

  it('upserts through the RPC and refuses a bad token', async () => {
    const calls: unknown[] = [];
    const client = {
      rpc: async (fn: string, args: Record<string, unknown>) => {
        calls.push({ fn, args });
        return { data: 'device-id', error: null };
      },
    };
    expect(
      await upsertRemotePushDevice(client, {
        token: 'nope',
        platform: 'ios',
        enabled: true,
        kickoff: true,
        goals: true,
        favoriteTeamIds: ['40'],
      }),
    ).toEqual({ ok: false, error: 'token' });
    const saved = await upsertRemotePushDevice(client, {
      token: TOKEN,
      platform: 'android',
      enabled: true,
      kickoff: false,
      goals: true,
      favoriteTeamIds: ['40', 'liv'],
    });
    expect(saved).toEqual({ ok: true });
    expect(calls).toEqual([
      {
        fn: 'kickfeed_upsert_push_device',
        args: {
          p_token: TOKEN,
          p_platform: 'android',
          p_enabled: true,
          p_kickoff: false,
          p_goals: true,
          p_favorite_team_ids: ['40', 'liv'],
        },
      },
    ]);
  });

  it('explains a remote test from the function payload', async () => {
    expect(remotePushTestMessage({ ok: true, sent: 1 }, null).ok).toBe(true);
    expect(remotePushTestMessage({ ok: false, reason: 'no-device', sent: 0 }, { message: 'nope' }).message).toMatch(
      /No Expo token/i,
    );
    const result = await requestRemotePushTest({
      functions: {
        invoke: async () => ({ data: { ok: false, reason: 'expo', sent: 0 }, error: { message: 'fail' } }),
      },
    });
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/Deploy dispatch-favorite-push/i);
  });
});

import {
  avatarColorFromId,
  displayNameFromEmail,
  handleFromEmail,
  handleFromName,
  handleSuffixFromUserId,
  inferAuthMode,
  initialsFromName,
  isDemoUserId,
  isPersistedUserId,
  isSupabaseUserId,
  uniqueHandleFromEmailAndUserId,
  userFromProfile,
} from '@/lib/userIdentity';
import { describe, expect, it } from 'vitest';

const UUID = '11111111-1111-4111-8111-111111111111';

describe('user identity', () => {
  it('keeps demo ids and supabase uuids, drops junk', () => {
    expect(isDemoUserId('maya')).toBe(true);
    expect(isSupabaseUserId(UUID)).toBe(true);
    expect(isPersistedUserId('maya')).toBe(true);
    expect(isPersistedUserId(UUID)).toBe(true);
    expect(isPersistedUserId('ghost')).toBe(false);
    expect(isSupabaseUserId('maya')).toBe(false);
  });

  it('infers auth mode from stored value or id shape', () => {
    expect(inferAuthMode('maya')).toBe('demo');
    expect(inferAuthMode(UUID)).toBe('supabase');
    expect(inferAuthMode('maya', 'supabase')).toBe('supabase');
    expect(inferAuthMode(null)).toBeNull();
  });

  it('builds display fields from name and email', () => {
    expect(initialsFromName('Karol Urban')).toBe('KU');
    expect(initialsFromName('Maya')).toBe('MA');
    expect(handleFromName('Maya Chen')).toBe('maya_chen');
    expect(handleFromEmail('Fan.Name@example.com')).toBe('fan_name');
    expect(displayNameFromEmail('fan.name@example.com')).toBe('Fan Name');
    expect(avatarColorFromId(UUID)).toMatch(/^#/);
  });

  it('suffixes handles with user id so the same local-part does not collide', () => {
    const gmail = uniqueHandleFromEmailAndUserId('fan@gmail.com', UUID);
    const yahoo = uniqueHandleFromEmailAndUserId('fan@yahoo.com', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    expect(gmail).toBe('fan_11111111');
    expect(yahoo).toBe('fan_aaaaaaaa');
    expect(gmail).not.toBe(yahoo);
    expect(handleSuffixFromUserId(UUID)).toBe('11111111');
  });

  it('fills a User from a profile slice keyed by supabase id', () => {
    const user = userFromProfile(
      UUID,
      { name: 'Karol', handle: 'karol', email: 'fan@example.com' },
      { teams: ['ars'], leagues: ['epl'], players: [] },
    );
    expect(user.id).toBe(UUID);
    expect(user.favoriteTeamIds).toEqual(['ars']);
    expect(user.email).toBe('fan@example.com');
    expect(user.initials).toBe('KA');
  });
});

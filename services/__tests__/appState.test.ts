import {
  addPost,
  defaults,
  follow,
  hydratePersisted,
  markNotificationsRead,
  signInDemo,
  toggleLike,
  unreadCountFor,
} from '@/services/appState';
import { describe, expect, it } from 'vitest';

describe('hydratePersisted', () => {
  it('returns defaults for missing, corrupt, or unversioned blobs', () => {
    expect(hydratePersisted(null).currentUserId).toBeNull();
    expect(hydratePersisted('not-json').schemaVersion).toBe(1);
    expect(hydratePersisted('{}').currentUserId).toBeNull();
    expect(hydratePersisted(JSON.stringify({ ...defaults(), schemaVersion: 99 })).currentUserId).toBeNull();
  });

  it('keeps a known demo user and drops unknown ids', () => {
    const saved = { ...defaults(), currentUserId: 'maya' as const };
    expect(hydratePersisted(JSON.stringify(saved)).currentUserId).toBe('maya');
    expect(hydratePersisted(JSON.stringify({ ...saved, currentUserId: 'ghost' })).currentUserId).toBeNull();
  });
});

describe('AppProvider mutations', () => {
  it('scopes unread notifications to the signed-in demo user', () => {
    const base = defaults();
    const mayaUnread = unreadCountFor(base, 'maya');
    expect(mayaUnread).toBeGreaterThan(0);
    expect(unreadCountFor(base, 'omar')).toBe(0);

    let state = signInDemo(base, 'omar');
    state = follow(state, 'maya', 'Maya Chen', 1_000);
    expect(unreadCountFor(state, 'omar')).toBe(1);
    expect(unreadCountFor(state, 'maya')).toBe(mayaUnread);

    state = markNotificationsRead(state);
    expect(unreadCountFor(state, 'omar')).toBe(0);
    expect(unreadCountFor(state, 'maya')).toBe(mayaUnread);
  });

  it('adds posts and likes for the current user only', () => {
    let state = signInDemo(defaults(), 'luca');
    state = addPost(state, 'Forza Inter', undefined, 2_000);
    expect(state.posts[0]?.authorId).toBe('luca');
    expect(state.posts[0]?.text).toBe('Forza Inter');
    expect(unreadCountFor(state, 'luca')).toBe(1);
    expect(unreadCountFor(state, 'maya')).toBeGreaterThan(0);

    state = toggleLike(state, 'p1');
    expect(state.likes.luca).toContain('p1');
    const liked = toggleLike(state, 'p1');
    expect(liked.likes.luca).not.toContain('p1');
  });
});

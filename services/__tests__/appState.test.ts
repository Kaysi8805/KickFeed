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
  it('returns defaults for missing or corrupt JSON', () => {
    expect(hydratePersisted(null).currentUserId).toBeNull();
    expect(hydratePersisted('not-json').schemaVersion).toBe(1);
    expect(hydratePersisted('{}').posts.length).toBeGreaterThan(0);
  });

  it('keeps a known demo user and drops unknown ids', () => {
    const saved = { ...defaults(), currentUserId: 'maya' as const };
    expect(hydratePersisted(JSON.stringify(saved)).currentUserId).toBe('maya');
    expect(hydratePersisted(JSON.stringify({ ...saved, currentUserId: 'ghost' })).currentUserId).toBeNull();
  });

  it('keeps valid slices when schemaVersion does not match', () => {
    const blob = {
      schemaVersion: 99,
      currentUserId: 'omar',
      following: { omar: ['maya'] },
      posts: [{ id: 'keep-me', authorId: 'omar', text: 'still here', createdAt: '2026-01-01T00:00:00.000Z' }],
    };
    const next = hydratePersisted(JSON.stringify(blob));
    expect(next.schemaVersion).toBe(1);
    expect(next.currentUserId).toBe('omar');
    expect(next.following.omar).toEqual(['maya']);
    expect(next.posts[0]?.id).toBe('keep-me');
    expect(next.comments.length).toBeGreaterThan(0);
  });
});

describe('AppProvider mutations', () => {
  it('notifies the followed user, not the actor', () => {
    const base = defaults();
    const mayaUnread = unreadCountFor(base, 'maya');
    expect(mayaUnread).toBeGreaterThan(0);
    expect(unreadCountFor(base, 'omar')).toBe(0);

    let state = signInDemo(base, 'omar');
    state = follow(state, 'maya', 'Omar Haddad', 1_000);
    expect(unreadCountFor(state, 'omar')).toBe(0);
    expect(unreadCountFor(state, 'maya')).toBe(mayaUnread + 1);

    state = markNotificationsRead(state);
    expect(unreadCountFor(state, 'omar')).toBe(0);
    expect(unreadCountFor(state, 'maya')).toBe(mayaUnread + 1);
  });

  it('adds posts without notifying the author', () => {
    const base = defaults();
    const mayaUnread = unreadCountFor(base, 'maya');
    let state = signInDemo(base, 'luca');
    state = addPost(state, 'Forza Inter', undefined, 2_000);
    expect(state.posts[0]?.authorId).toBe('luca');
    expect(state.posts[0]?.text).toBe('Forza Inter');
    expect(unreadCountFor(state, 'luca')).toBe(0);
    expect(unreadCountFor(state, 'maya')).toBe(mayaUnread + 1);

    state = toggleLike(state, 'p1');
    expect(state.likes.luca).toContain('p1');
    const liked = toggleLike(state, 'p1');
    expect(liked.likes.luca).not.toContain('p1');
  });
});

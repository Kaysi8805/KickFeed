import {
  addComment,
  addPost,
  defaults,
  follow,
  hydratePersisted,
  markNotificationsRead,
  mergeMatchAlerts,
  signInDemo,
  toggleFavoritePlayer,
  toggleFavoriteTeam,
  toggleLike,
  unreadCountFor,
  updateProfile,
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

  it('fills missing favorite players on old persisted slices', () => {
    const blob = {
      schemaVersion: 1,
      currentUserId: 'maya',
      favorites: { maya: { teams: ['ars'], leagues: ['epl'] } },
    };
    const next = hydratePersisted(JSON.stringify(blob));
    expect(next.favorites.maya).toEqual({ teams: ['ars'], leagues: ['epl'], players: [] });
  });

  it('keeps a saved TV country on the profile slice', () => {
    let state = signInDemo(defaults(), 'maya');
    state = updateProfile(state, { tvCountryId: 'gbr' });
    expect(state.profiles.maya?.tvCountryId).toBe('gbr');
    const again = hydratePersisted(JSON.stringify(state));
    expect(again.profiles.maya?.tvCountryId).toBe('gbr');
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

  it('toggles favorite players without dropping clubs or leagues', () => {
    let state = signInDemo(defaults(), 'maya');
    expect(state.favorites.maya.players).toEqual([]);
    state = toggleFavoritePlayer(state, 'p-liv-11');
    expect(state.favorites.maya.players).toEqual(['p-liv-11']);
    expect(state.favorites.maya.teams).toContain('ars');
    expect(state.favorites.maya.leagues).toContain('epl');
    state = toggleFavoritePlayer(state, 'p-liv-11');
    expect(state.favorites.maya.players).toEqual([]);
    expect(state.favorites.maya.teams).toContain('ars');
  });

  it('attaches a match id to a post and follower notification', () => {
    let state = signInDemo(defaults(), 'luca');
    state = addPost(state, 'Come on Inter', undefined, 3_000, 'fx-int-mil');
    expect(state.posts[0]?.matchId).toBe('fx-int-mil');
    const forMaya = state.notifications.find((n) => n.id === 'n-post-3000-maya');
    expect(forMaya?.matchId).toBe('fx-int-mil');
    expect(forMaya?.userId).toBe('luca');
  });

  it('notifies the parent author on a match-chat reply, not the actor', () => {
    const base = defaults();
    const jordanUnread = unreadCountFor(base, 'jordan');
    let state = signInDemo(base, 'maya');
    state = addComment(state, 'fx-liv-ars', 'Mac Allister from that corner — textbook.', 'c1', 4_000);
    expect(state.comments.at(-1)?.matchId).toBe('fx-liv-ars');
    expect(unreadCountFor(state, 'maya')).toBe(unreadCountFor(base, 'maya'));
    expect(unreadCountFor(state, 'jordan')).toBe(jordanUnread + 1);
    const note = state.notifications.find((n) => n.id === 'n-reply-4000-jordan');
    expect(note?.type).toBe('comment');
    expect(note?.matchId).toBe('fx-liv-ars');
    expect(note?.recipientId).toBe('jordan');
  });

  it('merges demo match alerts without duplicating seed goal/kickoff rows', () => {
    const base = defaults();
    const mayaUnread = unreadCountFor(base, 'maya');
    const next = mergeMatchAlerts(base, [
      {
        type: 'goal',
        recipientId: 'maya',
        matchId: 'fx-liv-ars',
        relatedMatchIds: ['fx-liv-ars', '9001'],
        title: 'GOAL — LIV 2-1 ARS',
        body: 'already seeded',
      },
      {
        type: 'kickoff',
        recipientId: 'jordan',
        matchId: 'fx-liv-ars',
        relatedMatchIds: ['fx-liv-ars'],
        title: 'Kickoff — LIV vs ARS',
        body: 'Anfield is live.',
      },
    ]);
    expect(unreadCountFor(next, 'maya')).toBe(mayaUnread);
    expect(next.notifications.some((n) => n.id === 'n-demo-kickoff-fx-liv-ars-jordan')).toBe(true);
    const again = mergeMatchAlerts(next, [
      {
        type: 'kickoff',
        recipientId: 'jordan',
        matchId: 'fx-liv-ars',
        relatedMatchIds: ['fx-liv-ars'],
        title: 'Kickoff — LIV vs ARS',
        body: 'Anfield is live.',
      },
    ]);
    expect(again.notifications.filter((n) => n.recipientId === 'jordan' && n.type === 'kickoff')).toHaveLength(1);
  });

  it('keeps stored mock match ids on hydrate (no rewrite)', () => {
    const blob = {
      schemaVersion: 1,
      currentUserId: 'maya',
      posts: [{ id: 'keep-match', authorId: 'maya', text: 'old', createdAt: '2026-01-01T00:00:00.000Z', matchId: 'fx-liv-ars' }],
    };
    const next = hydratePersisted(JSON.stringify(blob));
    expect(next.posts[0]?.matchId).toBe('fx-liv-ars');
  });

  it('treats mock and live team ids as the same favorite', () => {
    let state = signInDemo(defaults(), 'maya');
    expect(state.favorites.maya.teams).toContain('ars');
    state = toggleFavoriteTeam(state, '42', ['42', 'ars']);
    expect(state.favorites.maya.teams).not.toContain('ars');
    expect(state.favorites.maya.teams).not.toContain('42');
    state = toggleFavoriteTeam(state, '42', ['42', 'ars']);
    expect(state.favorites.maya.teams).toContain('42');
  });
});

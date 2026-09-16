import {
  addComment,
  addPost,
  defaults,
  follow,
  hydratePersisted,
  markNotificationsRead,
  mergeMatchAlerts,
  setMotmVote,
  setPrediction,
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
    expect(hydratePersisted('not-json').schemaVersion).toBe(2);
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
    expect(next.schemaVersion).toBe(2);
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

describe('score predictions', () => {
  const open = { status: 'upcoming' as const, kickoff: '2026-09-16T18:00:00.000Z' };
  const now = Date.parse('2026-09-16T12:00:00.000Z');

  it('lets Maya pick a pre-kickoff score and hydrates it back', () => {
    let state = signInDemo(defaults(), 'maya');
    expect(state.predictions.some((p) => p.userId === 'maya' && p.matchId === 'fx-bha-mun')).toBe(false);
    state = setPrediction(state, 'fx-bha-mun', 2, 1, now, open);
    const mine = state.predictions.find((p) => p.userId === 'maya' && p.matchId === 'fx-bha-mun');
    expect(mine).toMatchObject({ homeScore: 2, awayScore: 1 });
    expect(state.notifications.some((n) => n.type === 'prediction' && n.recipientId === 'maya')).toBe(true);
    expect(unreadCountFor(state, 'maya')).toBeGreaterThan(unreadCountFor(defaults(), 'maya'));

    const again = hydratePersisted(JSON.stringify(state));
    expect(again.schemaVersion).toBe(2);
    expect(again.predictions.find((p) => p.userId === 'maya' && p.matchId === 'fx-bha-mun')).toMatchObject({
      homeScore: 2,
      awayScore: 1,
    });
  });

  it('upserts before lock and rejects after kickoff or live', () => {
    let state = signInDemo(defaults(), 'maya');
    state = setPrediction(state, 'fx-bha-mun', 2, 1, now, open);
    state = setPrediction(state, 'fx-bha-mun', 3, 0, now + 1, open);
    expect(state.predictions.filter((p) => p.userId === 'maya' && p.matchId === 'fx-bha-mun')).toHaveLength(1);
    expect(state.predictions.find((p) => p.userId === 'maya' && p.matchId === 'fx-bha-mun')?.homeScore).toBe(3);
    expect(state.notifications.filter((n) => n.type === 'prediction' && n.recipientId === 'maya')).toHaveLength(1);

    const locked = setPrediction(state, 'fx-bha-mun', 0, 0, Date.parse('2026-09-16T18:00:00.000Z'), open);
    expect(locked.predictions.find((p) => p.userId === 'maya' && p.matchId === 'fx-bha-mun')?.homeScore).toBe(3);

    const live = setPrediction(state, 'fx-liv-ars', 1, 0, now, { status: 'live', kickoff: '2026-09-16T11:00:00.000Z' });
    expect(live.predictions.some((p) => p.userId === 'maya' && p.matchId === 'fx-liv-ars')).toBe(false);
  });

  it('treats related mock/live match ids as the same prediction', () => {
    let state = signInDemo(defaults(), 'maya');
    state = setPrediction(state, '9001', 2, 1, now, open, ['9001', 'fx-liv-ars']);
    state = setPrediction(state, 'fx-liv-ars', 1, 1, now + 5, open, ['9001', 'fx-liv-ars']);
    const mine = state.predictions.filter((p) => p.userId === 'maya' && (p.matchId === '9001' || p.matchId === 'fx-liv-ars'));
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ matchId: 'fx-liv-ars', homeScore: 1, awayScore: 1 });
  });

  it('fills seed community predictions when hydrating a v1 blob', () => {
    const next = hydratePersisted(JSON.stringify({ schemaVersion: 1, currentUserId: 'maya' }));
    expect(next.predictions.length).toBeGreaterThan(0);
    expect(next.motmVotes.length).toBeGreaterThan(0);
    expect(next.predictions.some((p) => p.userId === 'maya')).toBe(false);
  });

  it('keeps intentional empty prediction/MOTM arrays instead of reseeding', () => {
    const next = hydratePersisted(
      JSON.stringify({ schemaVersion: 2, currentUserId: 'maya', predictions: [], motmVotes: [] }),
    );
    expect(next.predictions).toEqual([]);
    expect(next.motmVotes).toEqual([]);
  });

  it('does not reseed when every stored engagement row fails to parse', () => {
    const next = hydratePersisted(
      JSON.stringify({
        schemaVersion: 2,
        currentUserId: 'maya',
        predictions: [{ matchId: 1 }],
        motmVotes: [{ playerName: 'Salah' }],
      }),
    );
    expect(next.predictions).toEqual([]);
    expect(next.motmVotes).toEqual([]);
  });

  it('soft-skips a prediction when the fixture is omitted', () => {
    let state = signInDemo(defaults(), 'maya');
    const before = state.predictions.length;
    state = setPrediction(state, 'fx-bha-mun', 2, 1, now);
    expect(state.predictions).toHaveLength(before);
    expect(state.predictions.some((p) => p.userId === 'maya' && p.matchId === 'fx-bha-mun')).toBe(false);
  });
});

describe('MOTM votes', () => {
  const salah = {
    playerKey: 'p-liv-11',
    playerId: 'p-liv-11',
    playerName: 'Mohamed Salah',
    teamId: 'liv',
  };

  it('records one vote per demo user per match and notifies the voter', () => {
    let state = signInDemo(defaults(), 'maya');
    state = setMotmVote(state, 'fx-liv-ars', salah, 5_000, 'live');
    expect(state.motmVotes.filter((v) => v.userId === 'maya' && v.matchId === 'fx-liv-ars')).toHaveLength(1);
    expect(state.notifications.some((n) => n.type === 'motm' && n.recipientId === 'maya' && n.body.includes('Salah'))).toBe(
      true,
    );

    const blocked = setMotmVote(
      state,
      'fx-liv-ars',
      { playerKey: 'p-ars-7', playerId: 'p-ars-7', playerName: 'Bukayo Saka', teamId: 'ars' },
      6_000,
      'live',
    );
    expect(blocked.motmVotes.filter((v) => v.userId === 'maya' && v.matchId === 'fx-liv-ars')).toHaveLength(1);
    expect(blocked.motmVotes.find((v) => v.userId === 'maya')?.playerKey).toBe('p-liv-11');

    const again = hydratePersisted(JSON.stringify(state));
    expect(again.motmVotes.find((v) => v.userId === 'maya' && v.matchId === 'fx-liv-ars')?.playerKey).toBe('p-liv-11');
  });

  it('rejects votes before kickoff', () => {
    let state = signInDemo(defaults(), 'maya');
    state = setMotmVote(state, 'fx-bha-mun', salah, 7_000, 'upcoming');
    expect(state.motmVotes.some((v) => v.userId === 'maya' && v.matchId === 'fx-bha-mun')).toBe(false);
  });

  it('soft-skips a vote when match status is omitted', () => {
    let state = signInDemo(defaults(), 'maya');
    const before = state.motmVotes.length;
    state = setMotmVote(state, 'fx-liv-ars', salah, 7_500);
    expect(state.motmVotes).toHaveLength(before);
    expect(state.motmVotes.some((v) => v.userId === 'maya' && v.matchId === 'fx-liv-ars')).toBe(false);
  });

  it('rejects a second vote when the same match is stored under a live alias id', () => {
    let state = signInDemo(defaults(), 'maya');
    state = setMotmVote(state, '9001', salah, 8_000, 'finished', ['9001', 'fx-liv-ars']);
    const again = setMotmVote(state, 'fx-liv-ars', salah, 9_000, 'finished', ['9001', 'fx-liv-ars']);
    expect(again.motmVotes.filter((v) => v.userId === 'maya')).toHaveLength(1);
    expect(again.motmVotes[again.motmVotes.length - 1]?.matchId).toBe('9001');
  });
});


import {
  addComment,
  addPost,
  addReport,
  applyAuthStateChange,
  applyRestoredSession,
  blockUser,
  blockedIdsFor,
  canMessagePeer,
  cannotDmPeerIds,
  defaults,
  follow,
  hydratePersisted,
  markDmThreadRead,
  markNotificationsRead,
  mergeMatchAlerts,
  mergeRemoteDirectMessages,
  mergeRemoteModeration,
  rememberProfiles,
  sendDirectMessage,
  setMotmVote,
  setPrediction,
  signInAccount,
  signInDemo,
  signOut,
  toggleFavoritePlayer,
  toggleFavoriteTeam,
  toggleLike,
  unblockUser,
  unreadCountFor,
  updateProfile,
  usersFromState,
} from '@/services/appState';
import { DM_SLOW_MODE_COOLDOWN_MS } from '@/lib/dms';
import { CHAT_SLOW_MODE_COOLDOWN_MS } from '@/lib/moderation';
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
    expect(hydratePersisted(JSON.stringify(saved)).authMode).toBe('demo');
    expect(hydratePersisted(JSON.stringify({ ...saved, currentUserId: 'ghost' })).currentUserId).toBeNull();
  });

  it('keeps a supabase uuid currentUserId and infers authMode', () => {
    const uuid = '11111111-1111-4111-8111-111111111111';
    const next = hydratePersisted(
      JSON.stringify({
        schemaVersion: 2,
        currentUserId: uuid,
        profiles: { [uuid]: { name: 'Karol', handle: 'karol', email: 'fan@example.com' } },
      }),
    );
    expect(next.currentUserId).toBe(uuid);
    expect(next.authMode).toBe('supabase');
    expect(usersFromState(next).some((u) => u.id === uuid && u.email === 'fan@example.com')).toBe(true);
    expect(usersFromState(next).some((u) => u.id === 'maya')).toBe(true);
  });

  it('adds remote ranking profiles so user pages can resolve them', () => {
    const uuid = '55555555-5555-4555-8555-555555555555';
    const state = rememberProfiles(defaults(), [
      {
        id: uuid,
        name: 'Live Fan',
        handle: 'live_fan',
        bio: 'KickFeed fan',
        avatarColor: '#22C55E',
        initials: 'LF',
        favoriteTeamIds: [],
        favoriteLeagueIds: [],
      },
    ]);
    expect(usersFromState(state).some((u) => u.id === uuid && u.name === 'Live Fan')).toBe(true);
    const again = rememberProfiles(state, [{ ...state.profiles[uuid]!, id: uuid, name: 'Ignored', handle: 'x', bio: '', avatarColor: '#000', initials: 'IG', favoriteTeamIds: [], favoriteLeagueIds: [] }]);
    expect(again.profiles[uuid]?.name).toBe('Live Fan');
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

describe('supabase vs demo identity', () => {
  const uuid = '33333333-3333-4333-8333-333333333333';
  const account = {
    id: uuid,
    name: 'Karol',
    handle: 'karol',
    bio: 'KickFeed fan',
    avatarColor: '#22C55E',
    initials: 'KA',
    favoriteTeamIds: [] as string[],
    favoriteLeagueIds: [] as string[],
    email: 'fan@example.com',
  };
  const open = { status: 'upcoming' as const, kickoff: '2026-09-16T18:00:00.000Z' };
  const now = Date.parse('2026-09-16T12:00:00.000Z');

  it('keys predictions, MOTM, and favorites by supabase uuid without touching demo slices', () => {
    let state = signInDemo(defaults(), 'maya');
    const mayaTeams = state.favorites.maya.teams;
    state = signInAccount(state, account, 'supabase');
    expect(state.currentUserId).toBe(uuid);
    expect(state.authMode).toBe('supabase');
    expect(state.favorites[uuid]).toEqual({ teams: [], leagues: [], players: [] });
    expect(state.favorites.maya.teams).toEqual(mayaTeams);

    state = setPrediction(state, 'fx-bha-mun', 2, 1, now, open);
    expect(state.predictions.some((p) => p.userId === uuid && p.matchId === 'fx-bha-mun')).toBe(true);
    expect(state.predictions.some((p) => p.userId === 'maya' && p.matchId === 'fx-bha-mun')).toBe(false);

    state = toggleFavoriteTeam(state, 'ars');
    expect(state.favorites[uuid].teams).toContain('ars');
    expect(state.favorites.maya.teams).toEqual(mayaTeams);

    const live = setMotmVote(
      state,
      'fx-liv-ars',
      { playerKey: 'p-liv-11', playerId: 'p-liv-11', playerName: 'Mohamed Salah', teamId: 'liv' },
      5_000,
      'live',
    );
    expect(live.motmVotes.some((v) => v.userId === uuid && v.playerKey === 'p-liv-11')).toBe(true);

    const signedOut = signOut(state);
    expect(signedOut.currentUserId).toBeNull();
    expect(signedOut.predictions.some((p) => p.userId === uuid)).toBe(true);
  });

  it('lets a restored supabase session win, and drops a leftover uuid without a session', () => {
    const demo = signInDemo(defaults(), 'maya');
    const withSession = applyRestoredSession(demo, account);
    expect(withSession.currentUserId).toBe(uuid);
    expect(withSession.authMode).toBe('supabase');

    const leftover = applyRestoredSession(withSession, null);
    expect(leftover.currentUserId).toBeNull();
    expect(leftover.authMode).toBeNull();

    const keepDemo = applyRestoredSession(demo, null);
    expect(keepDemo.currentUserId).toBe('maya');
    expect(keepDemo.authMode).toBe('demo');
  });

  it('applies supabase auth events after boot without stealing demo mode', () => {
    const demo = signInDemo(defaults(), 'maya');
    expect(applyAuthStateChange(demo, 'TOKEN_REFRESHED', account).currentUserId).toBe('maya');
    expect(applyAuthStateChange(demo, 'SIGNED_OUT', null).currentUserId).toBe('maya');

    const signedIn = applyAuthStateChange(signOut(demo), 'SIGNED_IN', account);
    expect(signedIn.currentUserId).toBe(uuid);
    expect(signedIn.authMode).toBe('supabase');

    const refreshed = applyAuthStateChange(signedIn, 'TOKEN_REFRESHED', {
      ...account,
      name: 'Karol U',
    });
    expect(refreshed.currentUserId).toBe(uuid);
    expect(applyAuthStateChange(signedIn, 'SIGNED_OUT', null).currentUserId).toBeNull();
    expect(applyAuthStateChange(signedIn, 'INITIAL_SESSION', account).currentUserId).toBe(uuid);
  });
});

describe('reports, blocks, and match-chat slow-mode', () => {
  it('hydrates blocks/reports for demo ids and supabase uuids, ignoring junk', () => {
    const uuid = '11111111-1111-4111-8111-111111111111';
    const next = hydratePersisted(
      JSON.stringify({
        schemaVersion: 2,
        currentUserId: 'maya',
        blocks: { maya: ['omar', 'ghost', 'maya'], [uuid]: [uuid, 'jordan'] },
        reports: [
          {
            id: 'r-1',
            reporterId: 'maya',
            targetType: 'post',
            targetId: 'p1',
            targetUserId: 'jordan',
            reason: 'Spam or scam',
            createdAt: '2026-09-18T18:00:00.000Z',
          },
          { id: 'bad', reporterId: 'maya', targetType: 'post', targetId: 'p1', targetUserId: 'jordan', reason: 'x' },
        ],
      }),
    );
    expect(next.blocks.maya).toEqual(['omar']);
    expect(next.blocks[uuid]).toEqual(['jordan']);
    expect(next.reports).toHaveLength(1);
    expect(next.reports[0]?.targetId).toBe('p1');
    expect(hydratePersisted(JSON.stringify({ schemaVersion: 1, currentUserId: 'maya' })).blocks).toEqual({});
  });

  it('blocks a fan, unfollows them, and hides their notifications', () => {
    const base = defaults();
    const mayaUnread = unreadCountFor(base, 'maya');
    let state = signInDemo(base, 'maya');
    expect(state.following.maya).toContain('omar');
    state = blockUser(state, 'omar');
    expect(blockedIdsFor(state, 'maya')).toContain('omar');
    expect(state.following.maya).not.toContain('omar');
    expect(unreadCountFor(state, 'maya')).toBe(mayaUnread - 1);
    state = follow(state, 'omar', 'Maya Chen');
    expect(state.following.maya).not.toContain('omar');
    state = unblockUser(state, 'omar');
    expect(blockedIdsFor(state, 'maya')).not.toContain('omar');
    expect(unreadCountFor(state, 'maya')).toBe(mayaUnread);
    state = blockUser(state, 'jordan');
    expect(unreadCountFor(state, 'maya')).toBe(mayaUnread - 1);
    expect(blockUser(state, 'maya')).toBe(state);
  });

  it('records a short report once per target and keys uuid identities the same way', () => {
    const uuid = '22222222-2222-4222-8222-222222222222';
    let state = signInAccount(defaults(), {
      id: uuid,
      name: 'Karol',
      handle: 'karol',
      bio: '',
      avatarColor: '#22C55E',
      initials: 'KA',
      favoriteTeamIds: [],
      favoriteLeagueIds: [],
      email: 'fan@example.com',
    }, 'supabase');
    const first = addReport(state, {
      targetType: 'comment',
      targetId: 'c1',
      targetUserId: 'jordan',
      reason: 'Harassment or hate',
    }, 9_000);
    expect(first.result).toEqual({ ok: true });
    expect(first.state.reports[0]?.reporterId).toBe(uuid);
    const again = addReport(first.state, {
      targetType: 'comment',
      targetId: 'c1',
      targetUserId: 'jordan',
      reason: 'Spam or scam',
    }, 9_001);
    expect(again.result).toEqual({ ok: true, duplicate: true });
    expect(again.state.reports).toHaveLength(1);
    const bad = addReport(first.state, {
      targetType: 'profile',
      targetId: uuid,
      targetUserId: uuid,
      reason: 'Spam or scam',
    });
    expect(bad.result.ok).toBe(false);
  });

  it('rate-limits match chat for the current identity', () => {
    const t0 = Date.now() + 60_000;
    let state = signInDemo(defaults(), 'maya');
    state = addComment(state, 'fx-liv-ars', 'First', undefined, t0, ['fx-liv-ars']);
    expect(state.comments.at(-1)?.text).toBe('First');
    const blocked = addComment(state, 'fx-liv-ars', 'Too soon', undefined, t0 + 1_000, ['fx-liv-ars']);
    expect(blocked.comments).toHaveLength(state.comments.length);
    const later = addComment(
      state,
      'fx-liv-ars',
      'After cooldown',
      undefined,
      t0 + CHAT_SLOW_MODE_COOLDOWN_MS,
      ['fx-liv-ars'],
    );
    expect(later.comments.at(-1)?.text).toBe('After cooldown');
  });

  it('merges remote blocks/reports onto the signed-in uuid without clobbering demo slices', () => {
    const uuid = '33333333-3333-4333-8333-333333333333';
    let state = signInDemo(defaults(), 'maya');
    state = blockUser(state, 'omar');
    state = signInAccount(state, {
      id: uuid,
      name: 'Karol',
      handle: 'karol',
      bio: '',
      avatarColor: '#22C55E',
      initials: 'KA',
      favoriteTeamIds: [],
      favoriteLeagueIds: [],
    }, 'supabase');
    const merged = mergeRemoteModeration(
      state,
      uuid,
      ['jordan', 'ghost'],
      [
        {
          id: 'r-cloud',
          reporterId: uuid,
          targetType: 'profile',
          targetId: 'jordan',
          targetUserId: 'jordan',
          reason: 'Spam or scam',
          createdAt: '2026-09-18T18:00:00.000Z',
        },
      ],
    );
    expect(merged.blocks.maya).toContain('omar');
    expect(merged.blocks[uuid]).toEqual(['jordan']);
    expect(merged.reports.some((row) => row.id === 'r-cloud')).toBe(true);
  });
});

describe('direct messages', () => {
  it('hydrates seeded Maya↔Omar threads and keeps uuid identities', () => {
    const uuid = '44444444-4444-4444-8444-444444444444';
    const next = hydratePersisted(
      JSON.stringify({
        schemaVersion: 2,
        currentUserId: 'maya',
        directMessages: [
          {
            id: 'dm-keep',
            senderId: uuid,
            recipientId: 'maya',
            text: 'Live fan said hi',
            createdAt: '2026-09-19T12:00:00.000Z',
          },
          { id: 'bad', senderId: 'ghost', recipientId: 'maya', text: 'nope', createdAt: '2026-09-19T12:00:00.000Z' },
        ],
      }),
    );
    expect(next.directMessages).toHaveLength(1);
    expect(next.directMessages[0]?.senderId).toBe(uuid);
    expect(hydratePersisted(JSON.stringify({ schemaVersion: 1, currentUserId: 'maya' })).directMessages.length).toBeGreaterThan(0);
  });

  it('lets Maya message Omar, then hides the thread after a block', () => {
    let state = signInDemo(defaults(), 'maya');
    expect(canMessagePeer(state, 'omar')).toBe(true);
    const sent = sendDirectMessage(state, 'omar', 'See you at Emirates', 20_000);
    expect(sent.result.ok).toBe(true);
    state = sent.state;
    expect(state.directMessages.at(-1)?.text).toBe('See you at Emirates');
    expect(state.notifications[0]?.type).toBe('dm');
    expect(state.notifications[0]?.recipientId).toBe('omar');

    state = blockUser(state, 'omar');
    expect(cannotDmPeerIds(state, 'maya')).toContain('omar');
    expect(canMessagePeer(state, 'omar')).toBe(false);
    const blocked = sendDirectMessage(state, 'omar', 'still trying', 80_000);
    expect(blocked.result.ok).toBe(false);
    expect(blocked.state.directMessages).toHaveLength(state.directMessages.length);

    state = signInDemo(state, 'omar');
    expect(cannotDmPeerIds(state, 'omar')).toContain('maya');
    expect(canMessagePeer(state, 'maya')).toBe(false);
  });

  it('rate-limits DMs in a thread the same way as match chat', () => {
    const t0 = Date.parse('2026-09-19T18:00:00.000Z');
    let state = signInDemo(defaults(), 'maya');
    const first = sendDirectMessage(state, 'luca', 'Forza', t0);
    expect(first.result.ok).toBe(true);
    state = first.state;
    const tooSoon = sendDirectMessage(state, 'luca', 'again', t0 + 1_000);
    expect(tooSoon.result.ok).toBe(false);
    const later = sendDirectMessage(state, 'luca', 'after wait', t0 + DM_SLOW_MODE_COOLDOWN_MS);
    expect(later.result.ok).toBe(true);
    const otherPeer = sendDirectMessage(state, 'sophie', 'different thread', t0 + 1_000);
    expect(otherPeer.result.ok).toBe(true);
  });

  it('marks a thread read without clobbering other peers', () => {
    let state = signInDemo(defaults(), 'maya');
    state = markDmThreadRead(state, 'omar', Date.parse('2026-09-19T18:00:00.000Z'));
    expect(state.dmReads.maya.omar).toBeTruthy();
    expect(state.dmReads.maya.jordan).toBeUndefined();
    const again = markDmThreadRead(state, 'omar', Date.parse('2026-09-19T17:00:00.000Z'));
    expect(again).toBe(state);
  });

  it('merges remote DMs onto the signed-in uuid without dropping demo threads', () => {
    const uuid = '33333333-3333-4333-8333-333333333333';
    let state = signInDemo(defaults(), 'maya');
    const demoCount = state.directMessages.length;
    state = signInAccount(state, {
      id: uuid,
      name: 'Karol',
      handle: 'karol',
      bio: '',
      avatarColor: '#22C55E',
      initials: 'KA',
      favoriteTeamIds: [],
      favoriteLeagueIds: [],
    }, 'supabase');
    const merged = mergeRemoteDirectMessages(state, uuid, [
      {
        id: 'dm-cloud',
        senderId: uuid,
        recipientId: '55555555-5555-4555-8555-555555555555',
        text: 'Live hello',
        createdAt: '2026-09-19T12:00:00.000Z',
      },
    ]);
    expect(merged.directMessages.some((row) => row.id === 'dm-cloud')).toBe(true);
    expect(merged.directMessages.length).toBe(demoCount + 1);
  });
});


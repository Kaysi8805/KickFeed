import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { PostCard } from '@/components/feed/PostCard';
import { LineupsSection } from '@/components/match/LineupsSection';
import { LiveBadge } from '@/components/match/LiveBadge';
import { MotmSection } from '@/components/match/MotmSection';
import { PredictSection } from '@/components/match/PredictSection';
import { TvMatchSection } from '@/components/tv/TvMatchSection';
import { SafetyMenu } from '@/components/moderation/SafetyMenu';
import { Avatar } from '@/components/ui/Avatar';
import { Crest } from '@/components/ui/Crest';
import { EmptyState } from '@/components/ui/EmptyState';
import { HeaderBar } from '@/components/ui/HeaderBar';
import { Screen } from '@/components/ui/Screen';
import { Segmented } from '@/components/ui/Segmented';
import { entityBackHref, entityHref } from '@/lib/entityNav';
import { defaultEntitySegment } from '@/lib/entityTabs';
import { isPostVisibleToViewer } from '@/lib/homeFeed';
import { safeBack } from '@/lib/navBack';
import { timeAgo } from '@/lib/format';
import {
  commentsForMatch,
  discussionParticipantIds,
  fixtureScoreLabel,
  participantsFromUsers,
  postsForMatch,
  relatedFixtureIds,
  resolveMatchDeepLink,
} from '@/lib/matchSocial';
import { routeId } from '@/lib/routeParams';
import { matchChatSlowMode, slowModeComposerCopy } from '@/lib/moderation';
import { useLiveTick } from '@/lib/useLiveTick';
import { useFootballCatalog } from '@/lib/useFootballCatalog';
import {
  hubEngageState,
  isMotmOpen,
  motmCandidates,
  motmVoteForUser,
  predictionForUser,
  rowsForMatch,
  scoreline,
} from '@/lib/engagement';
import { useApp } from '@/services/AppProvider';
import { football } from '@/services/football';
import { colors, radius, spacing, type } from '@/theme';

type Tab = 'events' | 'lineups' | 'stats' | 'predict' | 'motm' | 'chat';

const eventIcon: Record<string, string> = {
  goal: '⚽',
  yellow: '🟨',
  red: '🟥',
  sub: '🔁',
  var: '📺',
};

function tabFromParam(value: string | string[] | undefined): Tab {
  const raw = routeId(value);
  if (raw === 'chat' || raw === 'lineups' || raw === 'stats' || raw === 'events' || raw === 'predict' || raw === 'motm') {
    return raw;
  }
  return defaultEntitySegment('match');
}

export default function MatchDetailScreen() {
  useLiveTick();
  const catalog = useFootballCatalog();
  const { id: rawId, tab: tabParam } = useLocalSearchParams<{ id: string | string[]; tab?: string | string[] }>();
  const id = routeId(rawId);
  const {
    users,
    comments,
    posts,
    addComment,
    currentUser,
    friendIds,
    likedPostIds,
    toggleLike,
    predictions,
    motmVotes,
    setPrediction,
    setMotmVote,
  } = useApp();
  const [tab, setTab] = useState<Tab>(() => tabFromParam(tabParam));
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<string | undefined>();
  const [chatNow, setChatNow] = useState(() => Date.now());
  const [lineupState, setLineupState] = useState<{ id: string; phase: 'loading' | 'ready' | 'empty' | 'error' } | null>(
    null,
  );
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    setTab(tabFromParam(tabParam));
  }, [id, tabParam]);

  useEffect(() => {
    if (tab !== 'chat') return;
    setChatNow(Date.now());
    const id = setInterval(() => setChatNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [tab]);

  const deepLink = id ? resolveMatchDeepLink(football, id) : undefined;
  const fixture = deepLink?.fixture;

  useEffect(() => {
    const requestId = deepLink?.catalogId;
    if (!requestId) return;
    void football.ensureMatchDetail(requestId);
    let cancel = false;
    setLineupState((prev) =>
      prev?.id === requestId && (prev.phase === 'ready' || prev.phase === 'empty') ? prev : { id: requestId, phase: 'loading' },
    );
    void football.ensureLineups(requestId).then((result) => {
      if (cancel) return;
      setLineupState({
        id: requestId,
        phase: result === 'error' ? 'error' : result === 'empty' ? 'empty' : 'ready',
      });
    });
    return () => {
      cancel = true;
    };
  }, [deepLink?.catalogId]);

  const lineupStatus = deepLink?.fixture?.status;
  const lineupHomeId = deepLink?.fixture?.homeTeamId;
  const lineupAwayId = deepLink?.fixture?.awayTeamId;

  useEffect(() => {
    if (tab !== 'motm' || !isMotmOpen(lineupStatus) || !lineupHomeId || !lineupAwayId) return;
    void football.ensureSquad(lineupHomeId);
    void football.ensureSquad(lineupAwayId);
  }, [lineupAwayId, lineupHomeId, lineupStatus, tab]);

  const home = fixture ? football.getTeam(fixture.homeTeamId) : undefined;
  const away = fixture ? football.getTeam(fixture.awayTeamId) : undefined;
  const possession = useMemo(() => {
    const h = 48 + ((home?.id.length ?? 0) % 10);
    return { home: h, away: 100 - h };
  }, [home?.id]);

  if (!id || !fixture || !home || !away) {
    return (
      <Screen>
        <HeaderBar title="Match" onBack={() => safeBack(entityBackHref('match', id))} />
        <EmptyState
          title="Match not found"
          body={
            catalog.source === 'live'
              ? 'This id isn’t in the live fixture window (no unique club-pair alias from a demo match). Mock scores are not shown here.'
              : 'This fixture isn’t in the mock catalog.'
          }
        />
      </Screen>
    );
  }

  const league = football.getLeague(fixture.leagueId);
  const live = fixture.status === 'live' || fixture.status === 'ht';
  const lineups = football.getLineups(fixture);
  const thread = commentsForMatch(comments, fixture.id, football);
  const roots = thread.filter((c) => !c.parentId);
  const replyTarget = thread.find((c) => c.id === replyTo);
  const replyAuthor = replyTarget ? users.find((u) => u.id === replyTarget.authorId) : undefined;
  const matchPosts = postsForMatch(posts, fixture.id, football).filter((p) =>
    currentUser ? isPostVisibleToViewer(p, currentUser.id, friendIds) : false,
  );
  const participants = participantsFromUsers(
    discussionParticipantIds(comments, posts, fixture.id, football),
    users,
  );
  const label = fixtureScoreLabel(football, fixture);
  const relatedIds = relatedFixtureIds(football, fixture.id);
  const matchPredictions = rowsForMatch(predictions, relatedIds);
  const matchMotmVotes = rowsForMatch(motmVotes, relatedIds);
  const myPrediction = predictionForUser(matchPredictions, currentUser?.id, relatedIds);
  const myMotm = motmVoteForUser(matchMotmVotes, currentUser?.id, relatedIds);
  const ballot = motmCandidates(football, fixture);
  const hubEngage = hubEngageState(fixture.status, !!myPrediction, !!myMotm);
  const slowMode = matchChatSlowMode(comments, currentUser?.id, chatNow, relatedIds);
  const slowCopy = slowModeComposerCopy(slowMode);
  const canSend = !!currentUser && !!draft.trim() && slowMode.ok;

  return (
    <Screen padded={false}>
      <View style={styles.pad}>
        <HeaderBar
          title={league?.shortName ?? 'Match'}
          onBack={() => safeBack(entityBackHref('match', fixture.id))}
          right={
            <View style={styles.headerRight}>
              <Pressable
                onPress={() => router.push({ pathname: '/leaderboard', params: { leagueId: fixture.leagueId } })}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Prediction leaderboard"
              >
                <Text style={styles.leagueLink}>Rank</Text>
              </Pressable>
              <Pressable
                onPress={() => router.push('/tv')}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="TV schedule"
              >
                <Text style={styles.leagueLink}>TV</Text>
              </Pressable>
              <Pressable
                onPress={() => router.push({ pathname: '/compose', params: { matchId: fixture.id } })}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Post about this match"
              >
                <Text style={styles.leagueLink}>Post</Text>
              </Pressable>
            </View>
          }
        />
      </View>
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.board}>
          <Pressable style={styles.side} onPress={() => router.push(entityHref('team', home.id))}>
            <Crest team={home} size={56} />
            <Text style={styles.team}>{home.shortName}</Text>
          </Pressable>
          <View style={styles.mid}>
            {fixture.status === 'upcoming' ? (
              <Text style={styles.soon}>Kickoff</Text>
            ) : (
              <Text style={styles.score}>
                {fixture.homeScore}  –  {fixture.awayScore}
              </Text>
            )}
            {live ? <LiveBadge minute={fixture.minute} ht={fixture.status === 'ht'} /> : null}
            {fixture.status === 'finished' ? <Text style={styles.ft}>Full time</Text> : null}
            {fixture.status === 'upcoming' ? (
              <Text style={styles.venue}>{new Date(fixture.kickoff).toLocaleString()}</Text>
            ) : null}
            <Text style={styles.venue}>{fixture.venue}</Text>
            {deepLink?.via === 'alias' ? (
              <Text style={styles.venue}>Live catalog · linked from demo match id</Text>
            ) : null}
            {myPrediction ? (
              <Pressable onPress={() => setTab('predict')}>
                <Text style={styles.teaser}>You predicted {scoreline(myPrediction.homeScore, myPrediction.awayScore)}</Text>
              </Pressable>
            ) : fixture.status === 'upcoming' ? (
              <Pressable onPress={() => setTab('predict')}>
                <Text style={styles.teaser}>Predict the score</Text>
              </Pressable>
            ) : null}
            {isMotmOpen(fixture.status) ? (
              <Pressable onPress={() => setTab('motm')}>
                <Text style={styles.teaser}>{myMotm ? `Your MOTM: ${myMotm.playerName}` : 'Vote Man of the Match'}</Text>
              </Pressable>
            ) : null}
          </View>
          <Pressable style={styles.side} onPress={() => router.push(entityHref('team', away.id))}>
            <Crest team={away} size={56} />
            <Text style={styles.team}>{away.shortName}</Text>
          </Pressable>
        </View>

        <TvMatchSection matchId={fixture.id} />

        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { key: 'events', label: 'Events' },
            { key: 'lineups', label: 'Lineups' },
            { key: 'stats', label: 'Stats' },
            { key: 'predict', label: 'Predict' },
            { key: 'motm', label: 'MOTM' },
            { key: 'chat', label: 'Hub' },
          ]}
        />

        {tab === 'events' ? (
          <View style={styles.block}>
            {fixture.events.length === 0 ? (
              <EmptyState compact title="No events yet" body="Goals, cards, and subs will land here once the match is underway." />
            ) : (
              [...fixture.events].reverse().map((e) => {
                const team = football.getTeam(e.teamId);
                return (
                  <View key={e.id} style={styles.event}>
                    <Text style={styles.minute}>{e.minute}'</Text>
                    {team ? <Crest team={team} size={18} /> : null}
                    <Text style={styles.eicon}>{eventIcon[e.type]}</Text>
                    <View style={{ flex: 1 }}>
                      <Pressable
                        disabled={!e.playerId}
                        onPress={() => e.playerId && router.push(entityHref('player', e.playerId))}
                      >
                        <Text style={[styles.ename, e.playerId ? styles.link : null]}>{e.playerName}</Text>
                      </Pressable>
                      <Pressable disabled={!team} onPress={() => team && router.push(entityHref('team', team.id))}>
                        <Text style={styles.edetail}>
                          {team?.shortName}
                          {e.detail ? ` · ${e.detail}` : ''}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        ) : null}

        {tab === 'lineups' ? (
          <LineupsSection
            home={home}
            away={away}
            lineups={lineups}
            phase={lineupState?.id === deepLink.catalogId ? lineupState.phase : 'idle'}
            liveCatalog={catalog.source === 'live'}
            onRetry={() => {
              setLineupState({ id: fixture.id, phase: 'loading' });
              void football.ensureLineups(deepLink.catalogId).then((result) => {
                setLineupState({
                  id: fixture.id,
                  phase: result === 'error' ? 'error' : result === 'empty' ? 'empty' : 'ready',
                });
              });
            }}
          />
        ) : null}

        {tab === 'stats' ? (
          <View style={styles.block}>
            <Text style={styles.statLabel}>Possession (placeholder)</Text>
            <View style={styles.barTrack}>
              <View style={[styles.barHome, { flex: possession.home }]} />
              <View style={[styles.barAway, { flex: possession.away }]} />
            </View>
            <View style={styles.statRow}>
              <Text style={styles.statN}>{possession.home}%</Text>
              <Text style={styles.statN}>{possession.away}%</Text>
            </View>
            <Text style={styles.hint}>
              Shot maps and xG are still later. Live scores for England, Slovakia, and La Liga come from API-Football when a BFF URL or key is set.
            </Text>
          </View>
        ) : null}

        {tab === 'predict' ? (
          <PredictSection
            fixture={fixture}
            home={home}
            away={away}
            mine={myPrediction}
            community={matchPredictions}
            signedIn={!!currentUser}
            onSave={(homeScore, awayScore) => setPrediction(fixture, homeScore, awayScore)}
            onOpenLeaderboard={() =>
              router.push({ pathname: '/leaderboard', params: { leagueId: fixture.leagueId } })
            }
          />
        ) : null}

        {tab === 'motm' ? (
          <MotmSection
            fixture={fixture}
            home={home}
            away={away}
            candidates={ballot}
            mine={myMotm}
            community={matchMotmVotes}
            signedIn={!!currentUser}
            onVote={(candidate) => setMotmVote(fixture, candidate)}
          />
        ) : null}

        {tab === 'chat' ? (
          <View style={styles.block}>
            {hubEngage.prediction || hubEngage.motm ? (
              <View style={styles.engageCard}>
                {hubEngage.prediction && myPrediction ? (
                  <Pressable onPress={() => setTab('predict')}>
                    <Text style={styles.engageLine}>
                      You predicted {scoreline(myPrediction.homeScore, myPrediction.awayScore)}
                    </Text>
                  </Pressable>
                ) : null}
                {hubEngage.motm && myMotm ? (
                  <Pressable onPress={() => setTab('motm')}>
                    <Text style={styles.engageLine}>Your MOTM: {myMotm.playerName}</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            {participants.length > 0 ? (
              <View style={styles.people}>
                <View style={styles.avatars}>
                  {participants.slice(0, 6).map((u) => (
                    <Pressable key={u.id} onPress={() => router.push(entityHref('user', u.id))} style={styles.avatarHit}>
                      <Avatar initials={u.initials} color={u.avatarColor} size={28} />
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.peopleLabel}>
                  {participants.length} {participants.length === 1 ? 'fan' : 'fans'} in this match hub
                </Text>
              </View>
            ) : null}

            <Text style={styles.hubSection}>Feed posts</Text>
            {matchPosts.length === 0 ? (
              <EmptyState
                compact
                title="No posts tagged yet"
                body={`Attach ${label} when you compose so this match shows up on Feed and Following.`}
                actionLabel="Post about this match"
                onAction={() => router.push({ pathname: '/compose', params: { matchId: fixture.id } })}
              />
            ) : (
              matchPosts.map((post) => {
                const author = users.find((u) => u.id === post.authorId);
                if (!author) return null;
                return (
                  <PostCard
                    key={post.id}
                    post={post}
                    author={author}
                    liked={likedPostIds.includes(post.id)}
                    onLike={() => toggleLike(post.id)}
                    compact
                  />
                );
              })
            )}

            <Text style={styles.hubSection}>Discussion</Text>
            {roots.length === 0 ? (
              <EmptyState
                compact
                title="Start the discussion"
                body="Be first in this match thread — lineups, the ref, or that finish in the box."
              />
            ) : (
              roots.map((c) => {
                const author = users.find((u) => u.id === c.authorId);
                const replies = thread.filter((r) => r.parentId === c.id);
                return (
                  <View key={c.id} style={styles.comment}>
                    <Pressable onPress={() => author && router.push(entityHref('user', author.id))}>
                      <Avatar initials={author?.initials ?? '?'} color={author?.avatarColor ?? colors.surfaceAlt} size={32} />
                    </Pressable>
                    <View style={{ flex: 1 }}>
                      <View style={styles.commentHead}>
                        <Text style={styles.cname}>
                          {author?.name ?? 'Fan'} <Text style={styles.ctime}>{timeAgo(c.createdAt)}</Text>
                        </Text>
                        {author ? (
                          <SafetyMenu
                            targetType="comment"
                            targetId={c.id}
                            targetUserId={author.id}
                            targetName={author.name}
                            compact
                          />
                        ) : null}
                      </View>
                      <Text style={styles.ctext}>{c.text}</Text>
                      <Pressable onPress={() => setReplyTo(c.id)}>
                        <Text style={styles.reply}>Reply</Text>
                      </Pressable>
                      {replies.map((r) => {
                        const ra = users.find((u) => u.id === r.authorId);
                        return (
                          <View key={r.id} style={styles.replyBox}>
                            <View style={styles.commentHead}>
                              <Text style={styles.cname}>
                                {ra?.name ?? 'Fan'} <Text style={styles.ctime}>{timeAgo(r.createdAt)}</Text>
                              </Text>
                              {ra ? (
                                <SafetyMenu
                                  targetType="comment"
                                  targetId={r.id}
                                  targetUserId={ra.id}
                                  targetName={ra.name}
                                  compact
                                />
                              ) : null}
                            </View>
                            <Text style={styles.ctext}>{r.text}</Text>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                );
              })
            )}
          </View>
        ) : null}
      </ScrollView>

      {tab === 'chat' ? (
        <View style={styles.composer}>
          {replyTarget ? (
            <Pressable onPress={() => setReplyTo(undefined)}>
              <Text style={styles.replying}>
                Replying to {replyAuthor?.name ?? 'a comment'} · tap to cancel
              </Text>
            </Pressable>
          ) : null}
          <Text style={styles.composerHint}>{slowCopy}</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder={
                !currentUser
                  ? 'Sign in to chat'
                  : !slowMode.ok
                    ? slowCopy
                    : `Talk ${home.code} vs ${away.code}…`
              }
              placeholderTextColor={colors.textDim}
              value={draft}
              editable={!!currentUser && slowMode.ok}
              onChangeText={setDraft}
              accessibilityLabel="Match discussion"
            />
            <Pressable
              onPress={() => {
                if (!canSend) return;
                addComment(fixture.id, draft.trim(), replyTo);
                setDraft('');
                setReplyTo(undefined);
                requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
              }}
              disabled={!canSend}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSend }}
              accessibilityLabel="Send comment"
              style={[styles.send, !canSend && styles.sendOff]}
            >
              <Ionicons
                name="send"
                size={16}
                color={!canSend ? colors.textDim : colors.bg}
              />
            </Pressable>
          </View>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: spacing.lg },
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: 24 },
  board: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.xl,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.pitch,
  },
  side: { flex: 1, alignItems: 'center', gap: 8 },
  team: { ...type.caption, color: colors.lime, textAlign: 'center' },
  mid: { alignItems: 'center', minWidth: 120, gap: 6 },
  score: { ...type.score, color: colors.text },
  soon: { ...type.subtitle, color: colors.lime },
  ft: { ...type.micro, color: colors.textMuted },
  venue: { ...type.caption, color: colors.textDim, fontWeight: '500', textAlign: 'center' },
  teaser: { ...type.caption, color: colors.lime, fontWeight: '700', textAlign: 'center' },
  leagueLink: { ...type.caption, color: colors.lime },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  link: { color: colors.lime },
  block: { marginTop: spacing.lg, gap: 8 },
  event: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  minute: { ...type.caption, color: colors.lime, width: 32 },
  eicon: { fontSize: 16, width: 22 },
  ename: { ...type.subtitle, fontSize: 14, color: colors.text },
  edetail: { ...type.caption, color: colors.textMuted, fontWeight: '500' },
  statLabel: { ...type.caption, color: colors.textMuted, marginBottom: 8 },
  barTrack: { flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden' },
  barHome: { backgroundColor: colors.pitchBright },
  barAway: { backgroundColor: colors.gold },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  statN: { ...type.subtitle, color: colors.text },
  hint: { ...type.caption, color: colors.textDim, fontWeight: '500', marginTop: spacing.md, lineHeight: 18 },
  people: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: spacing.sm },
  avatars: { flexDirection: 'row' },
  avatarHit: { marginRight: -8, borderWidth: 2, borderColor: colors.bg, borderRadius: 16 },
  peopleLabel: { ...type.caption, color: colors.textMuted, flex: 1, marginLeft: 8 },
  hubSection: {
    ...type.micro,
    color: colors.limeMuted,
    textTransform: 'uppercase',
    marginTop: spacing.md,
    marginBottom: 4,
  },
  engageCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 6,
    marginBottom: spacing.sm,
  },
  engageLine: { ...type.caption, color: colors.lime, fontWeight: '700' },
  comment: { flexDirection: 'row', gap: 8, marginBottom: spacing.md },
  commentHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  cname: { ...type.caption, color: colors.text },
  ctime: { color: colors.textDim, fontWeight: '500' },
  ctext: { ...type.body, color: colors.text, marginTop: 2 },
  reply: { ...type.caption, color: colors.limeMuted, marginTop: 4 },
  replyBox: {
    marginTop: 8,
    backgroundColor: colors.bgElevated,
    padding: spacing.sm,
    borderRadius: radius.sm,
  },
  composer: {
    backgroundColor: colors.bgElevated,
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  composerHint: { ...type.micro, color: colors.textDim, marginBottom: 6 },
  inputRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 44,
    color: colors.text,
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.lime,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendOff: { backgroundColor: colors.surfaceAlt },
  replying: { ...type.caption, color: colors.limeMuted, marginBottom: 6 },
});

import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { PostCard } from '@/components/feed/PostCard';
import { LiveBadge } from '@/components/match/LiveBadge';
import { Avatar } from '@/components/ui/Avatar';
import { Crest } from '@/components/ui/Crest';
import { EmptyState } from '@/components/ui/EmptyState';
import { HeaderBar } from '@/components/ui/HeaderBar';
import { Screen } from '@/components/ui/Screen';
import { Segmented } from '@/components/ui/Segmented';
import { entityBackHref, entityHref } from '@/lib/entityNav';
import { safeBack } from '@/lib/navBack';
import { timeAgo } from '@/lib/format';
import {
  commentsForMatch,
  discussionParticipantIds,
  fixtureScoreLabel,
  participantsFromUsers,
  postsForMatch,
  resolveMatchDeepLink,
} from '@/lib/matchSocial';
import { routeId } from '@/lib/routeParams';
import { useLiveTick } from '@/lib/useLiveTick';
import { useFootballCatalog } from '@/lib/useFootballCatalog';
import { useApp } from '@/services/AppProvider';
import { football } from '@/services/football';
import { colors, radius, spacing, type } from '@/theme';

type Tab = 'events' | 'lineups' | 'stats' | 'chat';

const eventIcon: Record<string, string> = {
  goal: '⚽',
  yellow: '🟨',
  red: '🟥',
  sub: '🔁',
  var: '📺',
};

function tabFromParam(value: string | string[] | undefined): Tab {
  const raw = routeId(value);
  if (raw === 'chat' || raw === 'lineups' || raw === 'stats' || raw === 'events') return raw;
  return 'events';
}

export default function MatchDetailScreen() {
  useLiveTick();
  const catalog = useFootballCatalog();
  const { id: rawId, tab: tabParam } = useLocalSearchParams<{ id: string | string[]; tab?: string | string[] }>();
  const id = routeId(rawId);
  const { users, comments, posts, addComment, currentUser, likedPostIds, toggleLike } = useApp();
  const [tab, setTab] = useState<Tab>(() => tabFromParam(tabParam));
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<string | undefined>();

  useEffect(() => {
    setTab(tabFromParam(tabParam));
  }, [tabParam]);

  const deepLink = id ? resolveMatchDeepLink(football, id) : undefined;
  const fixture = deepLink?.fixture;

  useEffect(() => {
    if (deepLink?.fixture) void football.ensureMatchDetail(deepLink.catalogId);
  }, [deepLink?.catalogId, deepLink?.fixture]);

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
              ? 'This id isn’t in the live England window (no unique club-pair alias from a demo match). Mock scores are not shown here.'
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
  const matchPosts = postsForMatch(posts, fixture.id, football);
  const participants = participantsFromUsers(
    discussionParticipantIds(comments, posts, fixture.id, football),
    users,
  );
  const label = fixtureScoreLabel(football, fixture);

  return (
    <Screen padded={false}>
      <View style={styles.pad}>
        <HeaderBar
          title={league?.shortName ?? 'Match'}
          onBack={() => safeBack(entityBackHref('match', fixture.id))}
          right={
            <Pressable onPress={() => router.push({ pathname: '/compose', params: { matchId: fixture.id } })}>
              <Text style={styles.leagueLink}>Post</Text>
            </Pressable>
          }
        />
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
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
              <Text style={styles.venue}>Live England catalog · linked from demo match id</Text>
            ) : null}
          </View>
          <Pressable style={styles.side} onPress={() => router.push(entityHref('team', away.id))}>
            <Crest team={away} size={56} />
            <Text style={styles.team}>{away.shortName}</Text>
          </Pressable>
        </View>

        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { key: 'events', label: 'Events' },
            { key: 'lineups', label: 'Lineups' },
            { key: 'stats', label: 'Stats' },
            { key: 'chat', label: 'Hub' },
          ]}
        />

        {tab === 'events' ? (
          <View style={styles.block}>
            {fixture.events.length === 0 ? (
              <EmptyState title="No events yet" body="Goals, cards, and subs will land here once the match is underway." />
            ) : (
              [...fixture.events].reverse().map((e) => {
                const team = football.getTeam(e.teamId);
                return (
                  <View key={e.id} style={styles.event}>
                    <Text style={styles.minute}>{e.minute}'</Text>
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
          lineups.home.players.length === 0 && lineups.away.players.length === 0 ? (
            <EmptyState
              title="Lineups not cached"
              body="Free-tier quota may skip lineups. Events and the score still come from the fixture payload when available."
            />
          ) : (
          <View style={styles.lineWrap}>
            <View style={{ flex: 1 }}>
              <Text style={styles.lineTitle}>{home.code} · {lineups.home.formation}</Text>
              {lineups.home.players.map((p) => (
                <Pressable
                  key={`h-${p.number}`}
                  disabled={!p.playerId}
                  onPress={() => p.playerId && router.push(entityHref('player', p.playerId))}
                >
                  <Text style={[styles.player, p.playerId ? styles.link : null]}>
                    {p.number}  {p.name}
                    <Text style={styles.pos}>  {p.pos}</Text>
                  </Text>
                </Pressable>
              ))}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.lineTitle}>{away.code} · {lineups.away.formation}</Text>
              {lineups.away.players.map((p) => (
                <Pressable
                  key={`a-${p.number}`}
                  disabled={!p.playerId}
                  onPress={() => p.playerId && router.push(entityHref('player', p.playerId))}
                >
                  <Text style={[styles.player, p.playerId ? styles.link : null]}>
                    {p.number}  {p.name}
                    <Text style={styles.pos}>  {p.pos}</Text>
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
          )
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
              Shot maps and xG are still later. Live scores for England come from API-Football when a key is set.
            </Text>
          </View>
        ) : null}

        {tab === 'chat' ? (
          <View style={styles.block}>
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
                title="No posts tagged yet"
                body={`Attach ${label} when you compose so this match shows up on Home and Following.`}
                action={
                  <Pressable
                    onPress={() => router.push({ pathname: '/compose', params: { matchId: fixture.id } })}
                    style={styles.hubCta}
                  >
                    <Text style={styles.hubCtaText}>Post about this match</Text>
                  </Pressable>
                }
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
                      <Text style={styles.cname}>
                        {author?.name ?? 'Fan'} <Text style={styles.ctime}>{timeAgo(c.createdAt)}</Text>
                      </Text>
                      <Text style={styles.ctext}>{c.text}</Text>
                      <Pressable onPress={() => setReplyTo(c.id)}>
                        <Text style={styles.reply}>Reply</Text>
                      </Pressable>
                      {replies.map((r) => {
                        const ra = users.find((u) => u.id === r.authorId);
                        return (
                          <View key={r.id} style={styles.replyBox}>
                            <Text style={styles.cname}>
                              {ra?.name ?? 'Fan'} <Text style={styles.ctime}>{timeAgo(r.createdAt)}</Text>
                            </Text>
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
          ) : (
            <Text style={styles.composerHint}>{label}</Text>
          )}
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder={currentUser ? `Talk ${home.code} vs ${away.code}…` : 'Sign in to chat'}
              placeholderTextColor={colors.textDim}
              value={draft}
              editable={!!currentUser}
              onChangeText={setDraft}
            />
            <Pressable
              onPress={() => {
                if (!currentUser || !draft.trim()) return;
                addComment(fixture.id, draft.trim(), replyTo);
                setDraft('');
                setReplyTo(undefined);
              }}
              style={[styles.send, (!currentUser || !draft.trim()) && styles.sendOff]}
            >
              <Ionicons name="send" size={16} color={colors.bg} />
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
  leagueLink: { ...type.caption, color: colors.lime },
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
  lineWrap: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  lineTitle: { ...type.micro, color: colors.limeMuted, marginBottom: spacing.sm },
  player: { ...type.caption, color: colors.text, marginBottom: 6 },
  pos: { color: colors.textDim },
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
  hubSection: { ...type.micro, color: colors.textMuted, marginTop: spacing.md, marginBottom: 4 },
  hubCta: { backgroundColor: colors.lime, paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.full, marginTop: spacing.sm },
  hubCtaText: { ...type.caption, color: colors.bg, fontWeight: '800' },
  comment: { flexDirection: 'row', gap: 8, marginBottom: spacing.md },
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
    color: colors.text,
  },
  send: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' },
  sendOff: { opacity: 0.35 },
  replying: { ...type.caption, color: colors.limeMuted, marginBottom: 6 },
});

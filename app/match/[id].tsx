import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { LiveBadge } from '@/components/match/LiveBadge';
import { Avatar } from '@/components/ui/Avatar';
import { Crest } from '@/components/ui/Crest';
import { EmptyState } from '@/components/ui/EmptyState';
import { HeaderBar } from '@/components/ui/HeaderBar';
import { Screen } from '@/components/ui/Screen';
import { Segmented } from '@/components/ui/Segmented';
import { timeAgo } from '@/lib/format';
import { useLiveTick } from '@/lib/useLiveTick';
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

export default function MatchDetailScreen() {
  useLiveTick();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { users, comments, addComment, currentUser } = useApp();
  const [tab, setTab] = useState<Tab>('events');
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<string | undefined>();

  const fixture = football.getFixture(id);
  const home = fixture ? football.getTeam(fixture.homeTeamId) : undefined;
  const away = fixture ? football.getTeam(fixture.awayTeamId) : undefined;
  const possession = useMemo(() => {
    const h = 48 + ((home?.id.length ?? 0) % 10);
    return { home: h, away: 100 - h };
  }, [home?.id]);

  if (!fixture || !home || !away) {
    return (
      <Screen>
        <HeaderBar title="Match" onBack={() => router.back()} />
        <EmptyState title="Match not found" body="This fixture isn’t in the mock catalog." />
      </Screen>
    );
  }

  const league = football.getLeague(fixture.leagueId);
  const live = fixture.status === 'live' || fixture.status === 'ht';
  const lineups = football.getLineups(fixture);
  const thread = comments.filter((c) => c.matchId === fixture.id);
  const roots = thread.filter((c) => !c.parentId);
  const replyTarget = thread.find((c) => c.id === replyTo);

  return (
    <Screen padded={false}>
      <View style={styles.pad}>
        <HeaderBar title={league?.shortName ?? 'Match'} onBack={() => router.back()} />
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.board}>
          <View style={styles.side}>
            <Crest team={home} size={56} />
            <Text style={styles.team}>{home.shortName}</Text>
          </View>
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
          </View>
          <View style={styles.side}>
            <Crest team={away} size={56} />
            <Text style={styles.team}>{away.shortName}</Text>
          </View>
        </View>

        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { key: 'events', label: 'Events' },
            { key: 'lineups', label: 'Lineups' },
            { key: 'stats', label: 'Stats' },
            { key: 'chat', label: 'Chat' },
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
                      <Text style={styles.ename}>{e.playerName}</Text>
                      <Text style={styles.edetail}>
                        {team?.shortName}
                        {e.detail ? ` · ${e.detail}` : ''}
                      </Text>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        ) : null}

        {tab === 'lineups' ? (
          <View style={styles.lineWrap}>
            <View style={{ flex: 1 }}>
              <Text style={styles.lineTitle}>{home.code} · {lineups.home.formation}</Text>
              {lineups.home.players.map((p) => (
                <Text key={`h-${p.number}`} style={styles.player}>
                  {p.number}  {p.name}
                  <Text style={styles.pos}>  {p.pos}</Text>
                </Text>
              ))}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.lineTitle}>{away.code} · {lineups.away.formation}</Text>
              {lineups.away.players.map((p) => (
                <Text key={`a-${p.number}`} style={styles.player}>
                  {p.number}  {p.name}
                  <Text style={styles.pos}>  {p.pos}</Text>
                </Text>
              ))}
            </View>
          </View>
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
              Shot maps and xG will plug in when a real football API replaces services/football.ts.
            </Text>
          </View>
        ) : null}

        {tab === 'chat' ? (
          <View style={styles.block}>
            {roots.length === 0 ? (
              <EmptyState title="Start the discussion" body="Be first in the match thread." />
            ) : (
              roots.map((c) => {
                const author = users.find((u) => u.id === c.authorId);
                const replies = thread.filter((r) => r.parentId === c.id);
                return (
                  <View key={c.id} style={styles.comment}>
                    <Avatar initials={author?.initials ?? '?'} color={author?.avatarColor ?? colors.surfaceAlt} size={32} />
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
              <Text style={styles.replying}>Replying to a comment · tap to cancel</Text>
            </Pressable>
          ) : null}
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder={currentUser ? 'Talk about this match…' : 'Sign in to chat'}
              placeholderTextColor={colors.textDim}
              value={draft}
              onChangeText={setDraft}
            />
            <Pressable
              onPress={() => {
                if (!draft.trim()) return;
                addComment(fixture.id, draft.trim(), replyTo);
                setDraft('');
                setReplyTo(undefined);
              }}
              style={styles.send}
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
  team: { ...type.caption, color: colors.text, textAlign: 'center' },
  mid: { alignItems: 'center', minWidth: 120, gap: 6 },
  score: { ...type.score, color: colors.text },
  soon: { ...type.subtitle, color: colors.lime },
  ft: { ...type.micro, color: colors.textMuted },
  venue: { ...type.caption, color: colors.textDim, fontWeight: '500', textAlign: 'center' },
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
  replying: { ...type.caption, color: colors.limeMuted, marginBottom: 6 },
});

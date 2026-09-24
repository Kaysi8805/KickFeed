import { router } from 'expo-router';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { LiveBadge } from '@/components/match/LiveBadge';
import { entityHref } from '@/lib/entityNav';
import type { MatchTapeModel } from '@/lib/useMatchTapeThread';
import { kickoffLabel } from '@/lib/format';
import { colors, radius, spacing, type } from '@/theme';

export function MatchTapePanel({ model }: { model: MatchTapeModel }) {
  const tape = model.attachment;
  const live = model.status === 'live' || model.status === 'ht';

  return (
    <View style={styles.wrap}>
      <Text style={styles.honesty}>{model.disclaimer}</Text>
      {tape ? (
        <Pressable
          onPress={() => router.push(entityHref('match', tape.matchId))}
          accessibilityRole="button"
          accessibilityLabel={`Match Tape, Zápasová páska, ${model.headerLine}. Open match.`}
          style={styles.card}
        >
          <Text style={styles.kicker}>MATCH TAPE · ZÁPASOVÁ PÁSKA</Text>
          <View style={styles.scoreRow}>
            <Text style={styles.score}>{model.headerLine}</Text>
            {live ? <LiveBadge minute={model.minute} ht={model.status === 'ht'} compact /> : null}
          </View>
          <Text style={styles.meta} numberOfLines={1}>
            {tape.homeName} vs {tape.awayName}
            {tape.kickoff && model.status === 'upcoming' ? ` · ${kickoffLabel(tape.kickoff)}` : ''}
          </Text>
          {model.locked ? (
            <Text style={styles.banner}>
              {model.status === 'finished' ? 'Full time.' : 'Archived.'} This chat is a read-only Match Tape.
            </Text>
          ) : (
            <Text style={styles.hint}>Tap the score for the match. Anchor a take to a goal, card, or sub.</Text>
          )}
        </Pressable>
      ) : (
        <View style={styles.card}>
          <Text style={styles.kicker}>MATCH TAPE · ZÁPASOVÁ PÁSKA</Text>
          <Text style={styles.hint}>Attach a fixture from the catalog. This chat stays private — no public room.</Text>
        </View>
      )}
      <View style={styles.actions}>
        {model.canAttach ? (
          <Pressable
            onPress={() => model.setAttachOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Attach fixture"
            style={styles.primary}
          >
            <Text style={styles.primaryText}>{tape ? 'Attach another' : 'Attach fixture'}</Text>
          </Pressable>
        ) : null}
        {tape && !model.locked ? (
          <Pressable
            onPress={() => void model.archive()}
            disabled={model.busy}
            accessibilityRole="button"
            accessibilityLabel="Archive Match Tape"
            style={styles.ghost}
          >
            <Text style={styles.ghostText}>Archive</Text>
          </Pressable>
        ) : null}
        {tape ? (
          <Pressable
            onPress={() => void model.share()}
            accessibilityRole="button"
            accessibilityLabel="Share Match Tape"
            style={styles.ghost}
          >
            <Text style={styles.ghostText}>Share</Text>
          </Pressable>
        ) : null}
      </View>
      {model.note ? <Text style={styles.note}>{model.note}</Text> : null}
      <FixtureSheet model={model} />
      <EventSheet model={model} />
    </View>
  );
}

function FixtureSheet({ model }: { model: MatchTapeModel }) {
  return (
    <Modal visible={model.attachOpen} animationType="slide" transparent onRequestClose={() => model.setAttachOpen(false)}>
      <View style={styles.sheetBackdrop}>
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>Attach fixture</Text>
          <TextInput
            value={model.query}
            onChangeText={model.setQuery}
            placeholder="Search clubs"
            placeholderTextColor={colors.textDim}
            accessibilityLabel="Search fixtures"
            style={styles.search}
            autoCorrect={false}
          />
          <ScrollView keyboardShouldPersistTaps="handled" style={styles.list}>
            {model.listed.length === 0 ? (
              <Text style={styles.empty}>No matches in the catalog for that search.</Text>
            ) : (
              model.listed.map((row) => (
                <Pressable
                  key={row.id}
                  onPress={() => void model.attach(row)}
                  disabled={model.busy}
                  accessibilityRole="button"
                  accessibilityLabel={`Attach ${row.homeName} versus ${row.awayName}`}
                  style={styles.row}
                >
                  <Text style={styles.rowTitle}>
                    {row.homeShort} vs {row.awayShort}
                  </Text>
                  <Text style={styles.rowMeta}>
                    {row.status === 'live' || row.status === 'ht'
                      ? `${row.homeScore}–${row.awayScore} · ${row.status === 'ht' ? 'HT' : `${row.minute ?? ''}'`}`
                      : row.status === 'finished'
                        ? `FT ${row.homeScore}–${row.awayScore}`
                        : kickoffLabel(row.kickoff)}
                  </Text>
                </Pressable>
              ))
            )}
          </ScrollView>
          <Pressable
            onPress={() => model.setAttachOpen(false)}
            accessibilityRole="button"
            accessibilityLabel="Close fixture search"
            style={styles.close}
          >
            <Text style={styles.ghostText}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function EventSheet({ model }: { model: MatchTapeModel }) {
  return (
    <Modal visible={model.eventOpen} animationType="slide" transparent onRequestClose={() => model.setEventOpen(false)}>
      <View style={styles.sheetBackdrop}>
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>Anchor to an event</Text>
          {model.sampleEvents ? (
            <Text style={styles.sample}>Sample events — not a live feed. They stay on this device in demo.</Text>
          ) : null}
          <ScrollView keyboardShouldPersistTaps="handled" style={styles.list}>
            {model.events.length === 0 ? (
              <Text style={styles.empty}>No goal, card, or substitution yet.</Text>
            ) : (
              model.events.map((event) => (
                <Pressable
                  key={event.id}
                  onPress={() => model.pickEvent(event.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Anchor ${event.minute} minute ${event.type}`}
                  style={styles.row}
                >
                  <Text style={styles.rowTitle}>
                    {event.minute}' {event.playerName} · {event.type}
                  </Text>
                  {event.detail ? <Text style={styles.rowMeta}>{event.detail}</Text> : null}
                </Pressable>
              ))
            )}
          </ScrollView>
          <Pressable
            onPress={() => model.setEventOpen(false)}
            accessibilityRole="button"
            accessibilityLabel="Close events"
            style={styles.close}
          >
            <Text style={styles.ghostText}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.md },
  honesty: { ...type.caption, color: colors.textDim, lineHeight: 18, marginBottom: spacing.sm },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: 4,
  },
  kicker: { ...type.micro, color: colors.accent, letterSpacing: 0.6 },
  scoreRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  score: { ...type.displayScore, fontSize: 22, color: colors.text, flex: 1 },
  meta: { ...type.caption, color: colors.textMuted },
  hint: { ...type.caption, color: colors.textDim, marginTop: 4 },
  banner: { ...type.caption, color: colors.accentSoft, fontWeight: '700', marginTop: 6 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: spacing.sm },
  primary: {
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    backgroundColor: colors.lime,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { ...type.meta, color: colors.bg, fontWeight: '800' },
  ghost: {
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostText: { ...type.meta, color: colors.text },
  note: { ...type.caption, color: colors.danger, marginTop: 6 },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '80%',
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sheetTitle: { ...type.title, color: colors.text, marginBottom: spacing.sm },
  search: {
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  list: { maxHeight: 360 },
  row: { minHeight: 48, justifyContent: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowTitle: { ...type.body, color: colors.text, fontWeight: '700' },
  rowMeta: { ...type.caption, color: colors.textMuted },
  empty: { ...type.caption, color: colors.textDim, paddingVertical: spacing.md },
  sample: { ...type.caption, color: colors.accentSoft, marginBottom: spacing.sm },
  close: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm },
});

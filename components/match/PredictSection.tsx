import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Crest } from '@/components/ui/Crest';
import { EmptyState } from '@/components/ui/EmptyState';
import type { Fixture, ScorePrediction, Team } from '@/data/types';
import {
  PREDICTION_SCORE_MAX,
  aggregatePredictions,
  isPredictionOpen,
  scoreline,
} from '@/lib/engagement';
import { colors, radius, spacing, type } from '@/theme';

function Stepper({
  value,
  onChange,
  disabled,
  label,
}: {
  value: number;
  onChange: (next: number) => void;
  disabled: boolean;
  label: string;
}) {
  const downOff = disabled || value <= 0;
  const upOff = disabled || value >= PREDICTION_SCORE_MAX;
  return (
    <View style={styles.step} accessibilityLabel={label}>
      <Pressable
        onPress={() => onChange(Math.max(0, value - 1))}
        disabled={downOff}
        accessibilityRole="button"
        accessibilityState={{ disabled: downOff }}
        accessibilityLabel={`${label} down`}
        style={[styles.stepBtn, downOff && styles.stepOff]}
      >
        <Text style={[styles.stepGlyph, downOff && styles.stepGlyphOff]}>−</Text>
      </Pressable>
      <Text style={styles.stepValue}>{value}</Text>
      <Pressable
        onPress={() => onChange(Math.min(PREDICTION_SCORE_MAX, value + 1))}
        disabled={upOff}
        accessibilityRole="button"
        accessibilityState={{ disabled: upOff }}
        accessibilityLabel={`${label} up`}
        style={[styles.stepBtn, upOff && styles.stepOff]}
      >
        <Text style={[styles.stepGlyph, upOff && styles.stepGlyphOff]}>+</Text>
      </Pressable>
    </View>
  );
}

export function PredictSection({
  fixture,
  home,
  away,
  mine,
  community,
  signedIn,
  onSave,
  onOpenLeaderboard,
}: {
  fixture: Fixture;
  home: Team;
  away: Team;
  mine?: ScorePrediction;
  community: ScorePrediction[];
  signedIn: boolean;
  onSave: (homeScore: number, awayScore: number) => void;
  onOpenLeaderboard?: () => void;
}) {
  const open = isPredictionOpen(fixture);
  const [homeScore, setHomeScore] = useState(mine?.homeScore ?? 1);
  const [awayScore, setAwayScore] = useState(mine?.awayScore ?? 1);

  useEffect(() => {
    if (mine) {
      setHomeScore(mine.homeScore);
      setAwayScore(mine.awayScore);
    }
  }, [mine]);

  const agg = aggregatePredictions(community);
  const canSave = signedIn && open;
  const dirty = !mine || mine.homeScore !== homeScore || mine.awayScore !== awayScore;
  const saveOff = !dirty;

  return (
    <View style={styles.block}>
      <Text style={styles.kicker}>{open ? 'Pick the score before kickoff' : 'Predictions locked'}</Text>
      <Text style={styles.lede}>
        {open
          ? 'Friendly fan picks only — not a betting market. You can update until kickoff.'
          : mine
            ? `You predicted ${scoreline(mine.homeScore, mine.awayScore)} before kickoff. Picks freeze once the match is live.`
            : 'This match has started. Score picks lock at kickoff — no late entries.'}
      </Text>

      <View style={[styles.pickCard, !open && styles.pickCardLocked]}>
        <View style={styles.pickSide}>
          <Crest team={home} size={36} />
          <Text style={styles.pickTeam} numberOfLines={1}>
            {home.shortName}
          </Text>
          {open ? (
            <Stepper value={homeScore} onChange={setHomeScore} disabled={!canSave} label={`${home.shortName} score`} />
          ) : (
            <Text style={styles.stepValue}>{mine ? mine.homeScore : '—'}</Text>
          )}
        </View>
        <Text style={styles.dash}>–</Text>
        <View style={styles.pickSide}>
          <Crest team={away} size={36} />
          <Text style={styles.pickTeam} numberOfLines={1}>
            {away.shortName}
          </Text>
          {open ? (
            <Stepper value={awayScore} onChange={setAwayScore} disabled={!canSave} label={`${away.shortName} score`} />
          ) : (
            <Text style={styles.stepValue}>{mine ? mine.awayScore : '—'}</Text>
          )}
        </View>
      </View>

      {canSave ? (
        <Pressable
          onPress={() => onSave(homeScore, awayScore)}
          disabled={saveOff}
          accessibilityRole="button"
          accessibilityState={{ disabled: saveOff }}
          accessibilityLabel={
            saveOff
              ? `${scoreline(homeScore, awayScore)} already saved`
              : mine
                ? `Update prediction to ${scoreline(homeScore, awayScore)}`
                : `Lock in ${scoreline(homeScore, awayScore)}`
          }
          style={[styles.cta, saveOff && styles.ctaOff]}
        >
          <Text style={[styles.ctaText, saveOff && styles.ctaTextOff]}>
            {saveOff
              ? `${scoreline(homeScore, awayScore)} saved`
              : mine
                ? `Update ${scoreline(homeScore, awayScore)}`
                : `Lock in ${scoreline(homeScore, awayScore)}`}
          </Text>
        </Pressable>
      ) : !open ? (
        <View
          style={[styles.cta, styles.ctaLocked]}
          accessibilityRole="text"
          accessibilityLabel="Predictions locked at kickoff"
        >
          <Text style={styles.ctaLockedText}>{mine ? 'Locked at kickoff' : 'Locked — you didn’t pick'}</Text>
        </View>
      ) : !signedIn ? (
        <Text style={styles.hint}>Sign in to predict.</Text>
      ) : null}

      {onOpenLeaderboard ? (
        <Pressable
          onPress={onOpenLeaderboard}
          accessibilityRole="button"
          accessibilityLabel="Open prediction leaderboard"
          style={styles.rankLink}
        >
          <Text style={styles.rankLinkText}>Prediction leaderboard →</Text>
        </Pressable>
      ) : null}

      {agg.count === 0 ? (
        <EmptyState
          compact
          title="No community picks yet"
          body="Be first — other demo fans show up here with mock aggregates."
        />
      ) : (
        <View style={styles.agg}>
          <Text style={styles.aggTitle}>Community</Text>
          <Text style={styles.aggLine}>
            {agg.count} {agg.count === 1 ? 'fan' : 'fans'} · avg {scoreline(agg.avgHome, agg.avgAway)}
            {agg.mostCommon ? ` · most ${scoreline(agg.mostCommon.homeScore, agg.mostCommon.awayScore)}` : ''}
          </Text>
          <View style={styles.barTrack}>
            <View style={[styles.barHome, { flex: Math.max(agg.homeWin, 0.01) }]} />
            <View style={[styles.barDraw, { flex: Math.max(agg.draw, 0.01) }]} />
            <View style={[styles.barAway, { flex: Math.max(agg.awayWin, 0.01) }]} />
          </View>
          <View style={styles.statRow}>
            <Text style={styles.statN}>Home {agg.homeWin}</Text>
            <Text style={styles.statN}>Draw {agg.draw}</Text>
            <Text style={styles.statN}>Away {agg.awayWin}</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { marginTop: spacing.lg, gap: 10 },
  kicker: { ...type.micro, color: colors.limeMuted, textTransform: 'uppercase' },
  lede: { ...type.caption, color: colors.textMuted, fontWeight: '500', lineHeight: 18 },
  pickCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  pickCardLocked: { borderColor: colors.border, backgroundColor: colors.bgElevated },
  pickSide: { flex: 1, alignItems: 'center', gap: 8 },
  pickTeam: { ...type.caption, color: colors.lime, textAlign: 'center' },
  dash: { ...type.score, fontSize: 22, color: colors.textDim },
  step: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.pitchBright,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepOff: { backgroundColor: colors.surfaceAlt },
  stepGlyph: { ...type.subtitle, color: colors.bg, fontSize: 20 },
  stepGlyphOff: { color: colors.textDim },
  stepValue: { ...type.score, fontSize: 28, color: colors.text, minWidth: 28, textAlign: 'center' },
  cta: {
    backgroundColor: colors.lime,
    paddingVertical: 12,
    minHeight: 44,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaOff: { backgroundColor: colors.surfaceAlt },
  ctaText: { ...type.caption, color: colors.bg, fontWeight: '800' },
  ctaTextOff: { color: colors.textMuted },
  ctaLocked: { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  ctaLockedText: { ...type.caption, color: colors.textMuted, fontWeight: '700' },
  hint: { ...type.caption, color: colors.textDim, fontWeight: '500' },
  rankLink: { minHeight: 44, justifyContent: 'center' },
  rankLinkText: { ...type.caption, color: colors.lime, fontWeight: '700' },
  agg: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 8,
  },
  aggTitle: { ...type.micro, color: colors.limeMuted, textTransform: 'uppercase' },
  aggLine: { ...type.caption, color: colors.text, fontWeight: '600' },
  barTrack: { flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', gap: 2 },
  barHome: { backgroundColor: colors.pitchBright },
  barDraw: { backgroundColor: colors.textDim },
  barAway: { backgroundColor: colors.gold },
  statRow: { flexDirection: 'row', justifyContent: 'space-between' },
  statN: { ...type.caption, color: colors.textMuted },
});

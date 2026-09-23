/**
 * Matches tab: one local calendar day at a time (FotMob-style strip).
 * The strip covers today−5 through today+10 — the span the list used to dump.
 * API-Football still fetches a wider UTC `fixtureDateWindow`; this only filters the list.
 * Day boundaries match `isSameDay`.
 */

import type { Fixture } from '@/data/types';
import { isSameDay } from '@/lib/format';

export const MATCHES_LOOKBACK_DAYS = 5;
export const MATCHES_LOOKAHEAD_DAYS = 10;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

export type MatchDayRelation = 'yesterday' | 'today' | 'tomorrow' | 'other';

export type MatchDay = {
  iso: string;
  weekday: string;
  dayNum: string;
  relation: MatchDayRelation;
  accessibilityLabel: string;
};

export function localIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Local midnight for `YYYY-MM-DD`. Invalid calendar dates return null. */
export function localDateFromIso(iso: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

/** Selected day when Matches opens: the device's local calendar today. */
export function todayMatchDay(now = new Date()): string {
  return localIsoDate(now);
}

export function shiftLocalDay(iso: string, delta: number): string | null {
  const date = localDateFromIso(iso);
  if (!date) return null;
  return localIsoDate(new Date(date.getFullYear(), date.getMonth(), date.getDate() + delta));
}

export function matchDayRelation(iso: string, now = new Date()): MatchDayRelation {
  const day = localDateFromIso(iso);
  if (!day) return 'other';
  if (isSameDay(now.toISOString(), day)) return 'today';
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (isSameDay(day.toISOString(), yesterday)) return 'yesterday';
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  if (isSameDay(day.toISOString(), tomorrow)) return 'tomorrow';
  return 'other';
}

function dayAccessibilityLabel(date: Date, relation: MatchDayRelation): string {
  const long = `${WEEKDAYS_LONG[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}`;
  if (relation === 'today') return `Today, ${long}`;
  if (relation === 'yesterday') return `Yesterday, ${long}`;
  if (relation === 'tomorrow') return `Tomorrow, ${long}`;
  return long;
}

/** Inclusive local days from today−5 through today+10. */
export function matchDayStrip(now = new Date()): MatchDay[] {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - MATCHES_LOOKBACK_DAYS);
  const count = MATCHES_LOOKBACK_DAYS + MATCHES_LOOKAHEAD_DAYS + 1;
  const days: MatchDay[] = [];
  for (let i = 0; i < count; i += 1) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const iso = localIsoDate(date);
    const relation = matchDayRelation(iso, now);
    days.push({
      iso,
      weekday: relation === 'today' ? 'Today' : WEEKDAYS[date.getDay()]!,
      dayNum: String(date.getDate()),
      relation,
      accessibilityLabel: dayAccessibilityLabel(date, relation),
    });
  }
  return days;
}

export function matchesDateWindow(now = new Date()): { from: string; to: string } {
  const days = matchDayStrip(now);
  return { from: days[0]!.iso, to: days[days.length - 1]!.iso };
}

export function matchDayHeading(dayIso: string, now = new Date()): string {
  const date = localDateFromIso(dayIso);
  if (!date) return 'This day';
  const long = `${WEEKDAYS_LONG[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}`;
  const relation = matchDayRelation(dayIso, now);
  if (relation === 'today') return `Today · ${long}`;
  if (relation === 'yesterday') return `Yesterday · ${long}`;
  if (relation === 'tomorrow') return `Tomorrow · ${long}`;
  return long;
}

/** Kickoff's local calendar day. Invalid timestamps return null. */
export function kickoffLocalIso(kickoff: string): string | null {
  const ms = Date.parse(kickoff);
  if (!Number.isFinite(ms)) return null;
  return localIsoDate(new Date(ms));
}

export function kickoffOnDay(kickoff: string, dayIso: string): boolean {
  const day = localDateFromIso(dayIso);
  if (!day) return false;
  return isSameDay(kickoff, day);
}

/**
 * Fixtures whose kickoff falls on `dayIso`.
 * Status and scores are the catalog's — this does not invent results.
 */
export function filterMatchesOnDay(fixtures: Fixture[], dayIso: string): Fixture[] {
  return fixtures.filter((fixture) => kickoffOnDay(fixture.kickoff, dayIso));
}

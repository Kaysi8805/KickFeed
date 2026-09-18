import type { AppNotification, Comment, ReportTargetType, UserReport } from '@/data/types';
import { REPORT_TARGET_TYPES } from '@/data/types';
import { CHAT_SLOW_MODE_HINT } from '@/lib/honesty';
import type { AuthMode } from '@/lib/userIdentity';
import { isPersistedUserId } from '@/lib/userIdentity';

export const REPORT_REASON_MIN = 3;
export const REPORT_REASON_MAX = 280;
export const REPORT_DETAIL_MAX = 160;

/** One match-chat send per user per thread. */
export const CHAT_SLOW_MODE_COOLDOWN_MS = 20_000;
/** Burst cap across all match hubs — extra brake on hopping threads. */
export const CHAT_SLOW_MODE_BURST_COUNT = 5;
export const CHAT_SLOW_MODE_BURST_WINDOW_MS = 2 * 60_000;

export const REPORT_REASON_PRESETS = [
  { id: 'spam', label: 'Spam or scam' },
  { id: 'harassment', label: 'Harassment or hate' },
  { id: 'impersonation', label: 'Impersonation' },
  { id: 'off_topic', label: 'Off-topic / wrong match' },
  { id: 'other', label: 'Something else' },
] as const;

export type ReportReasonPresetId = (typeof REPORT_REASON_PRESETS)[number]['id'];

export type ReportInput = {
  reporterId: string;
  targetType: ReportTargetType;
  targetId: string;
  targetUserId: string;
  reason: string;
};

export type ReportResult =
  | { ok: true; duplicate?: boolean }
  | { ok: false; error: string };

export type SlowModeDecision =
  | { ok: true }
  | { ok: false; remainingMs: number; retryAt: number; kind: 'cooldown' | 'burst' };

export function isReportTargetType(value: unknown): value is ReportTargetType {
  return typeof value === 'string' && (REPORT_TARGET_TYPES as readonly string[]).includes(value);
}

export function isReportReasonPresetId(value: unknown): value is ReportReasonPresetId {
  return typeof value === 'string' && REPORT_REASON_PRESETS.some((preset) => preset.id === value);
}

export function normalizeReportReason(reason: string): string | null {
  const trimmed = reason.trim().replace(/\s+/g, ' ');
  if (trimmed.length < REPORT_REASON_MIN || trimmed.length > REPORT_REASON_MAX) return null;
  return trimmed;
}

/** Chip label, plus optional extra detail. `other` requires the extra text. */
export function composeReportReason(presetId: string, detail?: string): string | null {
  const preset = REPORT_REASON_PRESETS.find((row) => row.id === presetId);
  if (!preset) return null;
  const extra = (detail ?? '').trim().replace(/\s+/g, ' ').slice(0, REPORT_DETAIL_MAX);
  if (preset.id === 'other' && extra.length < REPORT_REASON_MIN) return null;
  const reason = extra ? `${preset.label}: ${extra}` : preset.label;
  return normalizeReportReason(reason);
}

export function reportKey(report: Pick<UserReport, 'reporterId' | 'targetType' | 'targetId'>): string {
  return `${report.reporterId}:${report.targetType}:${report.targetId}`;
}

export function uniqueBlockedIds(ids: unknown, selfId?: string): string[] {
  if (!Array.isArray(ids)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (typeof id !== 'string' || !isPersistedUserId(id) || seen.has(id) || id === selfId) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function isBlockedUser(blockedIds: readonly string[], userId: string | null | undefined): boolean {
  if (!userId) return false;
  return blockedIds.includes(userId);
}

export function visibleByAuthor<T extends { authorId: string }>(
  rows: T[],
  blockedIds: readonly string[],
): T[] {
  if (!blockedIds.length) return rows;
  const blocked = new Set(blockedIds);
  return rows.filter((row) => !blocked.has(row.authorId));
}

export function visibleNotifications(
  rows: AppNotification[],
  blockedIds: readonly string[],
): AppNotification[] {
  if (!blockedIds.length) return rows;
  const blocked = new Set(blockedIds);
  return rows.filter((row) => !row.userId || !blocked.has(row.userId));
}

export function hideUsers<T extends { id: string }>(rows: T[], blockedIds: readonly string[]): T[] {
  if (!blockedIds.length) return rows;
  const blocked = new Set(blockedIds);
  return rows.filter((row) => !blocked.has(row.id));
}

function latestCreatedMs(rows: { createdAt: string }[]): number | null {
  let max = Number.NEGATIVE_INFINITY;
  for (const row of rows) {
    const stamp = Date.parse(row.createdAt);
    if (Number.isFinite(stamp) && stamp > max) max = stamp;
  }
  return Number.isFinite(max) ? max : null;
}

/**
 * Match-chat rate limit for the signed-in identity (demo id or uuid).
 * 20s cooldown in the current thread; 5 messages / 2 min across all hubs.
 */
export function matchChatSlowMode(
  comments: Comment[],
  userId: string | null | undefined,
  now: number,
  matchIds: string[] = [],
): SlowModeDecision {
  if (!userId) return { ok: true };
  const mine = comments.filter((row) => row.authorId === userId);
  const thread = matchIds.length ? mine.filter((row) => matchIds.includes(row.matchId)) : mine;

  const lastThread = latestCreatedMs(
    thread.filter((row) => {
      const stamp = Date.parse(row.createdAt);
      return Number.isFinite(stamp) && stamp <= now;
    }),
  );
  if (lastThread != null) {
    const retryAt = lastThread + CHAT_SLOW_MODE_COOLDOWN_MS;
    if (now < retryAt) {
      return { ok: false, remainingMs: retryAt - now, retryAt, kind: 'cooldown' };
    }
  }

  const burst = mine.filter((row) => {
    const stamp = Date.parse(row.createdAt);
    return Number.isFinite(stamp) && stamp <= now && now - stamp < CHAT_SLOW_MODE_BURST_WINDOW_MS;
  });
  if (burst.length >= CHAT_SLOW_MODE_BURST_COUNT) {
    const oldest = Math.min(...burst.map((row) => Date.parse(row.createdAt)));
    const retryAt = oldest + CHAT_SLOW_MODE_BURST_WINDOW_MS;
    if (now < retryAt) {
      return { ok: false, remainingMs: retryAt - now, retryAt, kind: 'burst' };
    }
  }
  return { ok: true };
}

export function formatSlowModeWait(ms: number): string {
  const sec = Math.max(1, Math.ceil(ms / 1000));
  if (sec < 60) return `${sec}s`;
  return `${Math.ceil(sec / 60)}m`;
}

export function slowModeComposerCopy(decision: SlowModeDecision): string {
  if (decision.ok) return CHAT_SLOW_MODE_HINT;
  const wait = formatSlowModeWait(decision.remainingMs);
  if (decision.kind === 'burst') {
    return `Slow mode — too many messages. Try again in ${wait}.`;
  }
  return `Slow mode — wait ${wait} before sending.`;
}

/** Same gate as live ranking: email session only. Demo ids stay on-device. */
export function shouldPersistModeration(
  supabaseConfigured: boolean,
  authMode: AuthMode | null,
): boolean {
  return supabaseConfigured && authMode === 'supabase';
}

export function parseUserReport(value: unknown): UserReport | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (!isPersistedUserId(String(row.reporterId ?? '')) || !isPersistedUserId(String(row.targetUserId ?? ''))) {
    return null;
  }
  if (row.reporterId === row.targetUserId) return null;
  if (!isReportTargetType(row.targetType)) return null;
  if (typeof row.targetId !== 'string' || !row.targetId.trim()) return null;
  if (typeof row.reason !== 'string') return null;
  const reason = normalizeReportReason(row.reason);
  if (!reason) return null;
  const createdAt =
    typeof row.createdAt === 'string' && Number.isFinite(Date.parse(row.createdAt))
      ? row.createdAt
      : null;
  if (!createdAt) return null;
  const id = typeof row.id === 'string' && row.id.trim() ? row.id.trim() : `r-${Date.parse(createdAt)}`;
  return {
    id,
    reporterId: row.reporterId as string,
    targetType: row.targetType,
    targetId: row.targetId.trim(),
    targetUserId: row.targetUserId as string,
    reason,
    createdAt,
  };
}

export function buildUserReport(input: ReportInput, now: number, id?: string): UserReport | null {
  return parseUserReport({
    id: id ?? `r-${now}-${input.reporterId}`,
    reporterId: input.reporterId,
    targetType: input.targetType,
    targetId: input.targetId,
    targetUserId: input.targetUserId,
    reason: input.reason,
    createdAt: new Date(now).toISOString(),
  });
}

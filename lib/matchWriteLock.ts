/**
 * Server-enforced write windows for live ranking (mirrored in
 * supabase/migrations/*_leaderboard_write_lock.sql).
 *
 * Eligibility uses the server clock against a stored kickoff — never client
 * created_at / updated_at. Kickoff on the match window can only move earlier.
 */
export const MOTM_LOCK_AFTER_KICKOFF_MS = 4 * 60 * 60 * 1000;

export function tightenedKickoffMs(existing: number | null, proposed: number): number {
  if (existing == null || !Number.isFinite(existing)) return proposed;
  return Math.min(existing, proposed);
}

/** Score picks lock at kickoff (upcoming window only). */
export function predictionWriteAllowed(nowMs: number, kickoffMs: number): boolean {
  return Number.isFinite(nowMs) && Number.isFinite(kickoffMs) && nowMs < kickoffMs;
}

/**
 * MOTM opens at kickoff and closes 4 hours later (covers 90+HT+stoppage without
 * leaving an unbounded post-FT ballot).
 */
export function motmWriteAllowed(nowMs: number, kickoffMs: number): boolean {
  if (!Number.isFinite(nowMs) || !Number.isFinite(kickoffMs)) return false;
  return nowMs >= kickoffMs && nowMs < kickoffMs + MOTM_LOCK_AFTER_KICKOFF_MS;
}

import type { Fixture } from '@/data/types';
import {
  FAVORITE_KICKOFF_LEAD_MS,
  FAVORITE_KICKOFF_SCHEDULE_HORIZON_MS,
  FAVORITE_KICKOFF_SOON_MS,
  FAVORITE_LIVE_KICKOFF_GRACE_MS,
  fixtureScoreLabel,
  fixtureTouchesFavorites,
  type MatchCatalog,
} from '@/lib/matchSocial';

/** Cap so a first hydrate of several live favorites cannot dump a pile of banners. */
export const MAX_DEVICE_ALERTS_PER_SYNC = 3;

export type PushPrefs = {
  enabled: boolean;
  kickoff: boolean;
  goals: boolean;
};

export function defaultPushPrefs(): PushPrefs {
  return { enabled: false, kickoff: true, goals: true };
}

export type PushSnapshot = {
  scores: Record<string, { home: number; away: number }>;
  presented: string[];
  scheduled: Record<string, number>;
};

export function emptyPushSnapshot(): PushSnapshot {
  return { scores: {}, presented: [], scheduled: {} };
}

export type PushStore = {
  prefs: PushPrefs;
  snapshot: PushSnapshot;
};

export function parsePushStore(raw: string | null): PushStore {
  const fallback: PushStore = { prefs: defaultPushPrefs(), snapshot: emptyPushSnapshot() };
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return fallback;
    const row = parsed as Record<string, unknown>;
    return {
      prefs: parsePrefs(row.prefs),
      snapshot: parseSnapshot(row.snapshot),
    };
  } catch {
    return fallback;
  }
}

function parsePrefs(value: unknown): PushPrefs {
  const base = defaultPushPrefs();
  if (!value || typeof value !== 'object') return base;
  const row = value as Record<string, unknown>;
  return {
    enabled: row.enabled === true,
    kickoff: row.kickoff !== false,
    goals: row.goals !== false,
  };
}

function parseSnapshot(value: unknown): PushSnapshot {
  const empty = emptyPushSnapshot();
  if (!value || typeof value !== 'object') return empty;
  const row = value as Record<string, unknown>;
  const scores: PushSnapshot['scores'] = {};
  if (row.scores && typeof row.scores === 'object') {
    for (const [id, entry] of Object.entries(row.scores as Record<string, unknown>)) {
      if (!entry || typeof entry !== 'object') continue;
      const s = entry as Record<string, unknown>;
      if (typeof s.home !== 'number' || typeof s.away !== 'number') continue;
      scores[id] = { home: s.home, away: s.away };
    }
  }
  const presented = Array.isArray(row.presented)
    ? row.presented.filter((id): id is string => typeof id === 'string')
    : [];
  const scheduled: Record<string, number> = {};
  if (row.scheduled && typeof row.scheduled === 'object') {
    for (const [id, at] of Object.entries(row.scheduled as Record<string, unknown>)) {
      if (typeof at === 'number' && Number.isFinite(at)) scheduled[id] = at;
    }
  }
  return { scores, presented, scheduled };
}

export type DeviceAlert =
  | {
      action: 'present';
      type: 'kickoff' | 'goal';
      fingerprint: string;
      matchId: string;
      title: string;
      body: string;
    }
  | {
      action: 'schedule';
      type: 'kickoff';
      fingerprint: string;
      matchId: string;
      title: string;
      body: string;
      at: number;
    }
  | { action: 'cancel'; fingerprint: string };

export type DeviceAlertsCopyInput = {
  optedIn: boolean;
  projectId: string | undefined;
  permission: 'granted' | 'denied' | 'undetermined' | 'web' | 'unavailable';
  token: string | null;
  platform: 'web' | 'native';
};

export function deviceAlertsCopy(input: DeviceAlertsCopyInput): string {
  if (input.platform === 'web') {
    return 'Device alerts aren’t available in the web preview. Use Expo Go or a native build on a phone.';
  }
  if (input.permission === 'denied') {
    return 'Notifications are off in system settings. KickFeed still keeps an in-app notification center.';
  }
  if (input.permission === 'unavailable') {
    return 'Couldn’t enable device alerts on this install. In-app notifications still work.';
  }
  if (!input.optedIn) {
    return input.projectId
      ? 'Opt in for kickoff-soon and goal alerts for your clubs. Expo push is configured (EAS projectId).'
      : 'Opt in for on-device kickoff-soon and goal alerts. Remote Expo push needs an EAS projectId (see README). In-app notifications still work.';
  }
  if (input.token) {
    return 'Device alerts on. Kickoff reminders are scheduled on this device; goals fire when live scores refresh (same cache as Matches).';
  }
  if (input.projectId) {
    return 'Local match alerts on. Expo has a projectId but no push token yet (Android Expo Go often needs a dev build). In-app notifications still work.';
  }
  return 'Local match alerts on this device. Remote Expo push needs an EAS projectId (eas init or EXPO_PUBLIC_EAS_PROJECT_ID). In-app notifications still work.';
}

export function kickoffFingerprint(userId: string, matchId: string): string {
  return `kickoff:${userId}:${matchId}`;
}

export function goalFingerprint(userId: string, matchId: string, home: number, away: number): string {
  return `goal:${userId}:${matchId}:${home}-${away}`;
}

function cloneSnapshot(snapshot: PushSnapshot): PushSnapshot {
  return {
    scores: { ...snapshot.scores },
    presented: [...snapshot.presented],
    scheduled: { ...snapshot.scheduled },
  };
}

function markPresented(snapshot: PushSnapshot, fingerprint: string): void {
  if (!snapshot.presented.includes(fingerprint)) snapshot.presented.push(fingerprint);
  delete snapshot.scheduled[fingerprint];
  if (snapshot.presented.length > 80) snapshot.presented = snapshot.presented.slice(-80);
}

function latestGoalLine(provider: MatchCatalog, fixture: Fixture): { title: string; body: string } {
  const label = fixtureScoreLabel(provider, fixture);
  const goal = [...fixture.events].reverse().find((e) => e.type === 'goal');
  const scorerTeam = goal ? provider.getTeam(goal.teamId) : undefined;
  return {
    title: `GOAL — ${label}`,
    body: goal
      ? `${goal.playerName}${scorerTeam ? ` (${scorerTeam.shortName})` : ''} · ${goal.minute}'`
      : `${label} · score update`,
  };
}

function kickoffCopy(
  provider: MatchCatalog,
  fixture: Fixture,
  kind: 'soon' | 'live',
): { title: string; body: string } {
  const label = fixtureScoreLabel(provider, fixture);
  if (kind === 'soon') {
    return {
      title: `Kickoff soon — ${label}`,
      body: 'Starts soon. Open the match hub.',
    };
  }
  return {
    title: `Kickoff — ${label}`,
    body: `${label} is live. Join the match hub.`,
  };
}

export function planFavoriteDeviceAlerts(input: {
  userId: string;
  teamIds: string[];
  playerIds?: string[];
  provider: MatchCatalog;
  prefs: PushPrefs;
  snapshot: PushSnapshot;
  now?: number;
}): { alerts: DeviceAlert[]; snapshot: PushSnapshot } {
  const now = input.now ?? Date.now();
  const snapshot = cloneSnapshot(input.snapshot);
  const alerts: DeviceAlert[] = [];
  const seenMatch = new Set<string>();
  const keepScheduled = new Set<string>();

  const notify = input.prefs.enabled;
  const wantKickoff = notify && input.prefs.kickoff;
  const wantGoals = notify && input.prefs.goals;

  for (const fixture of input.provider.getFixtures()) {
    if (!fixtureTouchesFavorites(input.provider, fixture, input.teamIds, input.playerIds ?? [])) continue;
    seenMatch.add(fixture.id);
    const prev = snapshot.scores[fixture.id];
    const live = fixture.status === 'live' || fixture.status === 'ht';
    const ko = Date.parse(fixture.kickoff);
    const until = Number.isFinite(ko) ? ko - now : Number.POSITIVE_INFINITY;

    if (live) {
      if (
        wantGoals &&
        prev &&
        (fixture.homeScore > prev.home || fixture.awayScore > prev.away) &&
        fixture.homeScore + fixture.awayScore > 0
      ) {
        const fp = goalFingerprint(input.userId, fixture.id, fixture.homeScore, fixture.awayScore);
        if (!snapshot.presented.includes(fp)) {
          const copy = latestGoalLine(input.provider, fixture);
          alerts.push({
            action: 'present',
            type: 'goal',
            fingerprint: fp,
            matchId: fixture.id,
            title: copy.title,
            body: copy.body,
          });
          markPresented(snapshot, fp);
        }
      }
      snapshot.scores[fixture.id] = { home: fixture.homeScore, away: fixture.awayScore };
    } else if (fixture.status === 'upcoming') {
      snapshot.scores[fixture.id] = prev ?? { home: 0, away: 0 };
    }

    const fpKick = kickoffFingerprint(input.userId, fixture.id);
    const alreadyKick = snapshot.presented.includes(fpKick);

    if (wantKickoff && !alreadyKick) {
      if (live && until >= -FAVORITE_LIVE_KICKOFF_GRACE_MS) {
        const copy = kickoffCopy(input.provider, fixture, 'live');
        alerts.push({
          action: 'present',
          type: 'kickoff',
          fingerprint: fpKick,
          matchId: fixture.id,
          ...copy,
        });
        markPresented(snapshot, fpKick);
      } else if (fixture.status === 'upcoming' && until <= FAVORITE_KICKOFF_SOON_MS && until >= -FAVORITE_LIVE_KICKOFF_GRACE_MS) {
        const copy = kickoffCopy(input.provider, fixture, 'soon');
        alerts.push({
          action: 'present',
          type: 'kickoff',
          fingerprint: fpKick,
          matchId: fixture.id,
          ...copy,
        });
        markPresented(snapshot, fpKick);
      } else if (
        fixture.status === 'upcoming' &&
        until > FAVORITE_KICKOFF_SOON_MS &&
        until <= FAVORITE_KICKOFF_SCHEDULE_HORIZON_MS
      ) {
        const at = ko - FAVORITE_KICKOFF_LEAD_MS;
        keepScheduled.add(fpKick);
        if (snapshot.scheduled[fpKick] !== at) {
          const copy = kickoffCopy(input.provider, fixture, 'soon');
          alerts.push({
            action: 'schedule',
            type: 'kickoff',
            fingerprint: fpKick,
            matchId: fixture.id,
            at,
            ...copy,
          });
          snapshot.scheduled[fpKick] = at;
        }
      }
    } else if (alreadyKick) {
      delete snapshot.scheduled[fpKick];
    } else if (wantKickoff && snapshot.scheduled[fpKick] && fixture.status === 'upcoming') {
      keepScheduled.add(fpKick);
    }
  }

  for (const fp of Object.keys(snapshot.scheduled)) {
    if (keepScheduled.has(fp)) continue;
    alerts.push({ action: 'cancel', fingerprint: fp });
    delete snapshot.scheduled[fp];
  }

  for (const id of Object.keys(snapshot.scores)) {
    if (!seenMatch.has(id)) delete snapshot.scores[id];
  }

  const present = alerts.filter((a) => a.action === 'present');
  if (present.length <= MAX_DEVICE_ALERTS_PER_SYNC) return { alerts, snapshot };
  const kept = new Set(present.slice(0, MAX_DEVICE_ALERTS_PER_SYNC).map((a) => a.fingerprint));
  const trimmed: DeviceAlert[] = [];
  for (const alert of alerts) {
    if (alert.action === 'present' && !kept.has(alert.fingerprint)) {
      snapshot.presented = snapshot.presented.filter((id) => id !== alert.fingerprint);
      continue;
    }
    trimmed.push(alert);
  }
  return { alerts: trimmed, snapshot };
}

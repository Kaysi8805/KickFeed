import { Platform } from 'react-native';

import { easProjectIdFromEnv, resolveEasProjectId } from '@/lib/easProject';
import {
  defaultPushPrefs,
  deviceAlertsCopy,
  emptyPushSnapshot,
  matchIdFromNotificationResponse,
  parsePushStore,
  type DeviceAlert,
  type PushPrefs,
  type PushSnapshot,
  type PushStore,
} from '@/lib/favoritePush';
import { normalizeExpoPushToken } from '@/lib/remotePush';

const PUSH_STORE_KEY = 'kickfeed.v1.push';
const ANDROID_CHANNEL = 'matches';

export type PushPermission = 'granted' | 'denied' | 'undetermined' | 'web' | 'unavailable';

export type PushRegisterResult = {
  token: string | null;
  projectId: string | undefined;
  permission: PushPermission;
  message: string;
};

type NotificationsModule = typeof import('expo-notifications');

let handlerReady = false;
let storeWrite: Promise<void> = Promise.resolve();
const presentedFingerprints = new Set<string>();

export function notePresentedFingerprints(fingerprints: readonly string[]): void {
  for (const fp of fingerprints) {
    if (!fp) continue;
    presentedFingerprints.add(fp);
  }
  if (presentedFingerprints.size <= 200) return;
  const keep = [...presentedFingerprints].slice(-200);
  presentedFingerprints.clear();
  for (const fp of keep) presentedFingerprints.add(fp);
}

function fingerprintFromNotification(notification: unknown): string {
  if (!notification || typeof notification !== 'object') return '';
  const request = (notification as { request?: unknown }).request;
  if (!request || typeof request !== 'object') return '';
  const content = (request as { content?: unknown }).content;
  if (!content || typeof content !== 'object') return '';
  const data = (content as { data?: unknown }).data;
  if (!data || typeof data !== 'object') return '';
  const fp = (data as { fingerprint?: unknown }).fingerprint;
  return typeof fp === 'string' ? fp : '';
}

function nativePlatform(): 'web' | 'native' {
  return Platform.OS === 'web' ? 'web' : 'native';
}

async function loadNotifications(): Promise<NotificationsModule | null> {
  if (Platform.OS === 'web') return null;
  try {
    return await import('expo-notifications');
  } catch {
    return null;
  }
}

async function readProjectId(): Promise<string | undefined> {
  try {
    const Constants = await import('expo-constants');
    const config = Constants.default;
    const extra = config.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
    return resolveEasProjectId({
      easConfigId: config.easConfig?.projectId,
      extraId: extra?.eas?.projectId,
    });
  } catch {
    return easProjectIdFromEnv();
  }
}

async function ensureHandler(Notifications: NotificationsModule): Promise<void> {
  if (handlerReady) return;
  try {
    Notifications.setNotificationHandler({
      handleNotification: async (notification) => {
        const fp = fingerprintFromNotification(notification);
        const hide = fp !== '' && presentedFingerprints.has(fp);
        return {
          shouldShowBanner: !hide,
          shouldShowList: !hide,
          shouldPlaySound: false,
          shouldSetBadge: false,
        };
      },
    });
    handlerReady = true;
  } catch {
    /* Expo Go / web / simulator without the native module */
  }
}

async function ensureAndroidChannel(Notifications: NotificationsModule): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL, {
      name: 'Match alerts',
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 180],
      lightColor: '#22C55E',
    });
  } catch {
    /* channel is also declared in app.json */
  }
}

export function notificationIdentifier(fingerprint: string): string {
  return `kf.${fingerprint.replace(/[^a-zA-Z0-9._-]+/g, '.').slice(0, 120)}`;
}

export async function peekEasProjectId(): Promise<string | undefined> {
  return readProjectId();
}

/**
 * Expo Notifications wiring for v1.
 * In-app notification center is the source of truth.
 * Call from Profile → Enable device match alerts (opt-in).
 * Remote Expo push tokens need an EAS `projectId`; local kickoff/goal
 * alerts still work after permission without one.
 */
export async function registerForPushNotifications(): Promise<PushRegisterResult> {
  const projectId = await readProjectId();
  const platform = nativePlatform();
  if (platform === 'web') {
    return {
      token: null,
      projectId,
      permission: 'web',
      message: deviceAlertsCopy({
        optedIn: false,
        projectId,
        permission: 'web',
        token: null,
        platform,
      }),
    };
  }

  try {
    const Notifications = await loadNotifications();
    if (!Notifications) {
      return {
        token: null,
        projectId,
        permission: 'unavailable',
        message: deviceAlertsCopy({
          optedIn: false,
          projectId,
          permission: 'unavailable',
          token: null,
          platform,
        }),
      };
    }
    await ensureHandler(Notifications);
    await ensureAndroidChannel(Notifications);
    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      return {
        token: null,
        projectId,
        permission: 'denied',
        message: deviceAlertsCopy({
          optedIn: false,
          projectId,
          permission: 'denied',
          token: null,
          platform,
        }),
      };
    }

    let token: string | null = null;
    if (projectId) {
      try {
        const result = await Notifications.getExpoPushTokenAsync({ projectId });
        token = result.data;
      } catch {
        token = null;
      }
    }

    return {
      token,
      projectId,
      permission: 'granted',
      message: deviceAlertsCopy({
        optedIn: true,
        projectId,
        permission: 'granted',
        token,
        platform,
      }),
    };
  } catch {
    return {
      token: null,
      projectId,
      permission: 'unavailable',
      message: deviceAlertsCopy({
        optedIn: false,
        projectId,
        permission: 'unavailable',
        token: null,
        platform,
      }),
    };
  }
}

export async function scheduleDemoNotification(title: string, body: string): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const Notifications = await loadNotifications();
    if (!Notifications) return;
    await ensureHandler(Notifications);
    await Notifications.scheduleNotificationAsync({
      content: { title, body, sound: false },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 3, repeats: false },
    });
  } catch {
    // Simulator / Expo Go without a full setup still has the in-app center.
  }
}

async function canPresent(Notifications: NotificationsModule): Promise<boolean> {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
}

export async function applyDeviceAlerts(alerts: DeviceAlert[]): Promise<void> {
  if (!alerts.length || Platform.OS === 'web') return;
  try {
    const Notifications = await loadNotifications();
    if (!Notifications) return;
    await ensureHandler(Notifications);
    await ensureAndroidChannel(Notifications);
    const allowed = await canPresent(Notifications);
    for (const alert of alerts) {
      const identifier = notificationIdentifier(alert.fingerprint);
      try {
        if (alert.action === 'cancel') {
          await Notifications.cancelScheduledNotificationAsync(identifier);
          continue;
        }
        if (!allowed) continue;
        if (alert.action === 'present') {
          notePresentedFingerprints([alert.fingerprint]);
          try {
            await Notifications.cancelScheduledNotificationAsync(identifier);
          } catch {
            /* nothing pending with this id */
          }
          await Notifications.scheduleNotificationAsync({
            identifier,
            content: {
              title: alert.title,
              body: alert.body,
              sound: false,
              data: { matchId: alert.matchId, type: alert.type, fingerprint: alert.fingerprint },
            },
            trigger: Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL } : null,
          });
          continue;
        }
        await Notifications.scheduleNotificationAsync({
          identifier,
          content: {
            title: alert.title,
            body: alert.body,
            sound: false,
            data: { matchId: alert.matchId, type: alert.type, fingerprint: alert.fingerprint },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: new Date(alert.at),
            channelId: Platform.OS === 'android' ? ANDROID_CHANNEL : undefined,
          },
        });
      } catch {
        /* one alert must not break the rest */
      }
    }
  } catch {
    /* demo / missing native module */
  }
}

export async function cancelAllDeviceAlerts(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const Notifications = await loadNotifications();
    if (!Notifications) return;
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {
    /* ignore */
  }
}

export function subscribeNotificationResponse(onMatch: (matchId: string) => void): { remove: () => void } {
  if (Platform.OS === 'web') return { remove: () => undefined };
  let sub: { remove: () => void } | undefined;
  let cancelled = false;
  const handled = new Set<string>();

  const openFromResponse = (response: unknown) => {
    const matchId = matchIdFromNotificationResponse(response);
    if (!matchId) return;
    const identifier =
      response &&
      typeof response === 'object' &&
      (response as { notification?: { request?: { identifier?: unknown } } }).notification?.request
        ?.identifier;
    const key = typeof identifier === 'string' && identifier ? identifier : `match:${matchId}`;
    if (handled.has(key)) return;
    handled.add(key);
    onMatch(matchId);
  };

  void loadNotifications().then(async (Notifications) => {
    if (!Notifications || cancelled) return;
    try {
      let last: unknown = null;
      try {
        last =
          typeof Notifications.getLastNotificationResponse === 'function'
            ? Notifications.getLastNotificationResponse()
            : await Notifications.getLastNotificationResponseAsync();
      } catch {
        last = null;
      }
      if (!cancelled && last) {
        openFromResponse(last);
        try {
          if (typeof Notifications.clearLastNotificationResponse === 'function') {
            Notifications.clearLastNotificationResponse();
          } else {
            await Notifications.clearLastNotificationResponseAsync();
          }
        } catch {
          /* next launch can still read it; listener dedupes by identifier */
        }
      }
      if (cancelled) return;
      sub = Notifications.addNotificationResponseReceivedListener((response) => {
        openFromResponse(response);
      });
    } catch {
      /* ignore */
    }
  });
  return {
    remove: () => {
      cancelled = true;
      sub?.remove();
    },
  };
}

async function readStorage(): Promise<typeof import('@react-native-async-storage/async-storage').default | null> {
  try {
    return (await import('@react-native-async-storage/async-storage')).default;
  } catch {
    return null;
  }
}

export async function loadPushStore(): Promise<PushStore> {
  try {
    const AsyncStorage = await readStorage();
    if (!AsyncStorage) return parsePushStore(null);
    const raw = await AsyncStorage.getItem(PUSH_STORE_KEY);
    return parsePushStore(raw);
  } catch {
    return { prefs: defaultPushPrefs(), snapshot: emptyPushSnapshot(), token: null };
  }
}

export async function savePushStore(store: PushStore): Promise<void> {
  storeWrite = storeWrite
    .then(async () => {
      try {
        const AsyncStorage = await readStorage();
        if (!AsyncStorage) return;
        await AsyncStorage.setItem(PUSH_STORE_KEY, JSON.stringify(store));
      } catch {
        /* ignore */
      }
    })
    .catch(() => undefined);
  await storeWrite;
}

export async function persistPushState(
  prefs: PushPrefs,
  snapshot: PushSnapshot,
  token: string | null,
): Promise<void> {
  await savePushStore({ prefs, snapshot, token: normalizeExpoPushToken(token) });
}

/** Fetch an Expo token only when permission is already granted. Does not prompt. */
export async function readPushTokenIfGranted(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    const Notifications = await loadNotifications();
    if (!Notifications) return null;
    const projectId = await readProjectId();
    if (!projectId) return null;
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return null;
    const result = await Notifications.getExpoPushTokenAsync({ projectId });
    return normalizeExpoPushToken(result.data);
  } catch {
    return null;
  }
}

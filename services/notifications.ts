import { Platform } from 'react-native';

/**
 * Expo Notifications wiring for v1.
 * In-app notification center is the source of truth. Do not prompt for push
 * on boot — Expo push tokens need an EAS `projectId` and an explicit opt-in.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    const Constants = await import('expo-constants');
    const projectId =
      Constants.default.easConfig?.projectId ?? Constants.default.expoConfig?.extra?.eas?.projectId;
    if (!projectId) return null;

    const Notifications = await import('expo-notifications');
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return null;
    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    return token.data;
  } catch {
    return null;
  }
}

export async function scheduleDemoNotification(title: string, body: string): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const Notifications = await import('expo-notifications');
    await Notifications.scheduleNotificationAsync({
      content: { title, body, sound: false },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 3, repeats: false },
    });
  } catch {
    // Simulator / Expo Go without a full setup still has the in-app center.
  }
}

/** EAS build channel. Local `expo start` leaves this unset. */

export type AppChannel = 'local' | 'development' | 'preview' | 'production';

export function appChannelFromEnv(env: Record<string, string | undefined> = process.env): AppChannel {
  const raw = env.EXPO_PUBLIC_APP_CHANNEL?.trim().toLowerCase();
  if (raw === 'development' || raw === 'preview' || raw === 'production') return raw;
  return 'local';
}

/** Preview and production builds hide developer setup notes. Demo mode can still be opened. */
export function isStoreFacingChannel(channel: AppChannel): boolean {
  return channel === 'preview' || channel === 'production';
}

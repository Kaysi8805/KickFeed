import { Platform, Share } from 'react-native';

import { buildPostShareMessage, type PostShareParts } from '@/lib/sharePost';

/** Native always; web only when the browser exposes the Web Share API. */
export function isShareAvailable(): boolean {
  if (Platform.OS === 'web') {
    return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  }
  return typeof Share?.share === 'function';
}

export type SharePostResult = 'shared' | 'dismissed' | 'unavailable';

/** Opens the OS share sheet. Cancel / dismiss never throws. */
export async function sharePost(parts: PostShareParts): Promise<SharePostResult> {
  if (!isShareAvailable()) return 'unavailable';
  const message = buildPostShareMessage(parts);
  try {
    const result = await Share.share(
      Platform.OS === 'ios' ? { message } : { message, title: 'KickFeed' },
    );
    if (result.action === Share.dismissedAction) return 'dismissed';
    return 'shared';
  } catch {
    // iOS cancels reject; treat as dismiss so the UI never crashes.
    return 'dismissed';
  }
}

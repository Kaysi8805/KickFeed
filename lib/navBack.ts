import { router, type Href } from 'expo-router';

/**
 * Pop history when it exists; otherwise replace onto a parent route.
 * `canGoBack()` is not sufficient on web cold opens — always pass a fallback.
 */
export function safeBack(fallback: Href = '/' as Href): void {
  try {
    if (router.canGoBack()) {
      router.back();
      return;
    }
  } catch {
    // empty stack / web cold open
  }
  router.replace(fallback);
}

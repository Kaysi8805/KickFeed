/** Expo Router search params are `string | string[]`. Always normalize before lookup. */
export type RouteParam = string | string[] | undefined;

export function routeId(value: RouteParam): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  try {
    return decodeURIComponent(trimmed);
  } catch {
    return trimmed;
  }
}

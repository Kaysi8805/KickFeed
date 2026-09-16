import { DEFAULT_TV_COUNTRY_ID, tvCountries } from '@/data/mocks/tv';
import type { TvCountry } from '@/data/types';

export interface DeviceLocaleHint {
  locale?: string;
  timeZone?: string;
}

export function getTvCountries(): TvCountry[] {
  return tvCountries;
}

export function getTvCountry(id: string | undefined | null): TvCountry | undefined {
  if (!id) return undefined;
  const key = id.trim().toLowerCase();
  return tvCountries.find((c) => c.id === key);
}

/** Region subtag from `sk-SK`, `en-GB`, `en_US`. Language `sk` maps to SK. */
export function localeRegion(locale?: string): string | undefined {
  if (!locale) return undefined;
  const parts = locale.replace(/_/g, '-').split('-').filter(Boolean);
  if (parts[0]?.toLowerCase() === 'sk') return 'SK';
  for (let i = 1; i < parts.length; i += 1) {
    const part = parts[i];
    if (part && /^[A-Za-z]{2}$/.test(part)) return part.toUpperCase();
  }
  return undefined;
}

export function tvCountryFromDevice(hint: DeviceLocaleHint = {}): string {
  const region = localeRegion(hint.locale);
  if (region) {
    const byRegion = tvCountries.find((c) => c.localeRegions.includes(region));
    if (byRegion) return byRegion.id;
  }
  if (hint.timeZone) {
    const byZone = tvCountries.find((c) => c.timeZones.includes(hint.timeZone!));
    if (byZone) return byZone.id;
  }
  return DEFAULT_TV_COUNTRY_ID;
}

export function deviceLocaleHint(): DeviceLocaleHint {
  try {
    const opts = Intl.DateTimeFormat().resolvedOptions();
    return { locale: opts.locale, timeZone: opts.timeZone };
  } catch {
    return {};
  }
}

/**
 * Profile country wins when it is a known launch geo.
 * Else device locale / timezone, else Slovakia (Karol’s default).
 */
export function resolveTvCountryId(preferred?: string | null, hint: DeviceLocaleHint = deviceLocaleHint()): string {
  const saved = getTvCountry(preferred ?? undefined);
  if (saved) return saved.id;
  return tvCountryFromDevice(hint);
}

export function calendarDateInZone(isoOrMs: string | number, timeZone: string): string {
  const date = typeof isoOrMs === 'number' ? new Date(isoOrMs) : new Date(isoOrMs);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function isSameCalendarDay(iso: string, timeZone: string, now = Date.now()): boolean {
  return calendarDateInZone(iso, timeZone) === calendarDateInZone(now, timeZone);
}

export function kickoffInZone(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function kickoffDayLabel(iso: string, timeZone: string, now = Date.now()): string {
  const time = kickoffInZone(iso, timeZone);
  if (isSameCalendarDay(iso, timeZone, now)) return time;
  const tomorrow = now + 24 * 60 * 60 * 1000;
  if (calendarDateInZone(iso, timeZone) === calendarDateInZone(tomorrow, timeZone)) return `Tomorrow ${time}`;
  const day = new Date(iso).toLocaleDateString('en-GB', {
    timeZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  return `${day} ${time}`;
}

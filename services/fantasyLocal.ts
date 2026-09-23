import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  EMPTY_FANTASY_SNAPSHOT,
  FANTASY_SCHEMA_VERSION,
  parseFantasySnapshot,
  type FantasySnapshot,
} from '@/lib/fantasy';

const STORAGE_KEY = 'kickfeed.fantasy.v1';

export async function loadFantasyLocal(): Promise<FantasySnapshot> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_FANTASY_SNAPSHOT;
    const parsed = JSON.parse(raw) as unknown;
    return parseFantasySnapshot(parsed);
  } catch {
    return EMPTY_FANTASY_SNAPSHOT;
  }
}

export async function saveFantasyLocal(snapshot: FantasySnapshot): Promise<void> {
  const body = JSON.stringify({ schemaVersion: FANTASY_SCHEMA_VERSION, ...snapshot });
  await AsyncStorage.setItem(STORAGE_KEY, body);
}

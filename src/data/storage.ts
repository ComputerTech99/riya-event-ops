import AsyncStorage from '@react-native-async-storage/async-storage';
import type { EventConfig, GuestInput } from './types';

const KEY = 'ria.setup.v1';

export interface SavedSetup {
  /** The organizer has seen the setup flow (finished or skipped). */
  seen: boolean;
  event: EventConfig | null;
  /** Only kept for the mock feed, so a reload replays the same guest list. */
  guests: GuestInput[];
}

export async function loadSetup(): Promise<SavedSetup> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) return { seen: false, event: null, guests: [], ...JSON.parse(raw) };
  } catch {
    // Private mode or blocked storage: behave like a first launch.
  }
  return { seen: false, event: null, guests: [] };
}

export async function saveSetup(s: SavedSetup) {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Nothing to do; the event still runs for this session.
  }
}

import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { DEFAULT_UNIT_PREFS, normalizeUnitPrefs, type UnitPrefs } from "./unit-prefs";

/**
 * Persist unit + tariff preferences. Same cross-platform pattern as
 * lib/notification-storage.ts: SecureStore on native, localStorage on web, one
 * JSON blob so hydration is a single Keychain round trip and a process kill
 * between writes can't leave the set half-applied.
 *
 * Storing this device-locally even though the tariff also lives on the server
 * is deliberate: it makes the rate available before (and without) a network
 * round trip, which is what keeps the offline-first fallbacks on the dashboard
 * and analytics screens priced correctly.
 */

const PREFS_KEY = "voltwise.unit-prefs";

/** Bump when the stored shape changes incompatibly. */
const PREFS_VERSION = 1;

async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    return localStorage.getItem(key);
  }
  return SecureStore.getItemAsync(key);
}

async function setItem(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    localStorage.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

/** Null when nothing is stored yet; a normalized object otherwise. */
export async function getStoredUnitPrefs(): Promise<UnitPrefs | null> {
  try {
    const raw = await getItem(PREFS_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return normalizeUnitPrefs(parsed);
  } catch {
    // Unparseable — fall back to defaults rather than wedging the provider.
    return null;
  }
}

export async function saveUnitPrefs(prefs: UnitPrefs): Promise<void> {
  await setItem(PREFS_KEY, JSON.stringify({ v: PREFS_VERSION, ...prefs }));
}

export { DEFAULT_UNIT_PREFS };

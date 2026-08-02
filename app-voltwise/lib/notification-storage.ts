import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import {
  DEFAULT_NOTIFICATION_PREFS,
  normalizeNotificationPrefs,
  type NotificationPrefs,
} from "./notification-rules";

/**
 * Persist notification preferences. Same cross-platform pattern as
 * lib/theme-storage.ts and lib/auth-storage.ts: SecureStore on native,
 * localStorage on web.
 *
 * Unlike theme-storage (two scalars, two keys) the preferences live in a
 * single JSON blob. Nine-plus leaf values would otherwise mean nine Keychain
 * round trips on every launch, and a process kill between writes could leave
 * the set half-applied. Validation is not lost: normalizeNotificationPrefs
 * merges field by field over the defaults, so one corrupt value can't take
 * the rest down with it.
 */

const PREFS_KEY = "voltwise.notification-prefs";
// Engine bookkeeping rather than a user preference: it changes on every alert
// instead of on every settings tap, and it has to survive a prefs reset.
const HWM_KEY = "voltwise.notified-alert-hwm";

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
export async function getStoredNotificationPrefs(): Promise<NotificationPrefs | null> {
  try {
    const raw = await getItem(PREFS_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return normalizeNotificationPrefs(parsed);
  } catch {
    // Unparseable — fall back to defaults rather than wedging the provider.
    return null;
  }
}

export async function saveNotificationPrefs(prefs: NotificationPrefs): Promise<void> {
  await setItem(PREFS_KEY, JSON.stringify({ v: PREFS_VERSION, ...prefs }));
}

/**
 * Highest alert id already turned into a banner. 0 means "never synced" —
 * the provider treats that as a cold start and baselines without notifying.
 */
export async function getStoredNotifiedHighWater(): Promise<number> {
  try {
    const raw = await getItem(HWM_KEY);
    if (!raw) return 0;
    const n = Number(raw);
    return Number.isInteger(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

export async function saveNotifiedHighWater(hwm: number): Promise<void> {
  await setItem(HWM_KEY, String(hwm));
}

export { DEFAULT_NOTIFICATION_PREFS };

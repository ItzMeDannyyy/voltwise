import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { parseAppLockPrefs, type AppLockPrefs } from "./applock-prefs";

/**
 * Persistence for the app lock preference. Same cross-platform pattern as the
 * other lib/*-storage.ts modules: SecureStore on native, localStorage on web.
 *
 * The preference belongs to the phone, not the account — a lock is a statement
 * about who can pick up this handset — so it lives here rather than on the
 * server, and it is listed in lib/local-data.ts so a device reset clears it.
 */

const APP_LOCK_KEY = "voltwise.app-lock";

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

export async function getStoredAppLockPrefs(): Promise<AppLockPrefs> {
  try {
    return parseAppLockPrefs(await getItem(APP_LOCK_KEY));
  } catch {
    // Storage itself failed (a browser with cookies blocked, say). Defaults
    // keep the app usable; the screen will simply show the lock as off.
    return parseAppLockPrefs(null);
  }
}

export async function saveAppLockPrefs(prefs: AppLockPrefs): Promise<void> {
  await setItem(APP_LOCK_KEY, JSON.stringify(prefs));
}

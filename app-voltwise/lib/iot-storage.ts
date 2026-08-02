import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { DEFAULT_DEVICE_UID, normalizeDeviceUid } from "./iot-prefs";

/**
 * Persist which sensor this install is paired with. Same cross-platform pattern
 * as lib/unit-storage.ts and lib/notification-storage.ts: SecureStore on
 * native, localStorage on web.
 *
 * Device-local rather than account data, and that is the point: the pairing
 * answers "which board is physically in front of me", which is a property of
 * the phone's surroundings, not of the account. Two people signed into the same
 * demo account can watch two different boards.
 *
 * A single scalar, so unlike the preference blobs elsewhere it is stored raw
 * rather than as JSON — there is no partial-write hazard with one value.
 */

const DEVICE_UID_KEY = "voltwise.iot-device-uid";

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

async function removeItem(key: string): Promise<void> {
  if (Platform.OS === "web") {
    localStorage.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

/**
 * The paired UID, or null when the user has never chosen one (the provider
 * then falls back to the build's DEFAULT_DEVICE_UID). A stored value that no
 * longer passes validation is treated as absent rather than trusted — it would
 * otherwise be interpolated into a subscription topic.
 */
export async function getStoredDeviceUid(): Promise<string | null> {
  try {
    const raw = await getItem(DEVICE_UID_KEY);
    return raw ? normalizeDeviceUid(raw) : null;
  } catch {
    return null;
  }
}

export async function saveDeviceUid(uid: string): Promise<void> {
  await setItem(DEVICE_UID_KEY, uid);
}

/** Forget the override so the build's default applies again. */
export async function clearDeviceUid(): Promise<void> {
  await removeItem(DEVICE_UID_KEY);
}

export { DEFAULT_DEVICE_UID };

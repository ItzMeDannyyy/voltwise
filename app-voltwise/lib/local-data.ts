import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

/**
 * The inventory of what VoltWise keeps on this device, and the ability to
 * remove it.
 *
 * Every storage key in the app is listed here exactly once. That is the whole
 * point of the module: "clear my data" is a promise that cannot be kept by a
 * function that only knows about the keys someone remembered to wire up, and a
 * key added in lib/*-storage.ts without a line here would quietly survive a
 * reset forever.
 *
 * Two deliberate exclusions:
 *
 *  - The JWT (lib/auth-storage.ts). Removing it is signing out, which the app
 *    already offers somewhere the consequence is obvious. Folding it into a
 *    settings reset would eject someone who asked to reset their theme.
 *  - Anything server-side. Nothing here touches the account — readings, devices
 *    and alerts live in Postgres and are unaffected.
 *
 * Same cross-platform pattern as the storage modules it mirrors: SecureStore on
 * native, localStorage on web.
 */

export interface LocalDataEntry {
  id: "appearance" | "units" | "notifications" | "pairing";
  label: string;
  hint: string;
  /** Every key this entry owns. Must match the owning lib/*-storage.ts module. */
  keys: string[];
}

export const LOCAL_DATA_ENTRIES: LocalDataEntry[] = [
  {
    id: "appearance",
    label: "Appearance",
    hint: "Theme and text size",
    keys: ["voltwise.theme-mode", "voltwise.font-size"],
  },
  {
    id: "units",
    label: "Units & tariff",
    hint: "Unit choices, plus the cached copy of your rate",
    keys: ["voltwise.unit-prefs"],
  },
  {
    id: "notifications",
    label: "Notifications",
    hint: "Alert preferences and which alerts have already been announced",
    keys: ["voltwise.notification-prefs", "voltwise.notified-alert-hwm"],
  },
  {
    id: "pairing",
    label: "Sensor pairing",
    hint: "Which board this install follows",
    keys: ["voltwise.iot-device-uid"],
  },
];

/** Deliberately never cleared here — see the module comment. */
export const EXCLUDED_KEYS = ["voltwise.jwt"];

export interface LocalDataStatus {
  /** Per entry: whether anything is actually stored for it right now. */
  stored: Record<LocalDataEntry["id"], boolean>;
  /** Total keys holding a value, across every entry. */
  storedKeyCount: number;
}

async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    return localStorage.getItem(key);
  }
  return SecureStore.getItemAsync(key);
}

async function removeItem(key: string): Promise<void> {
  if (Platform.OS === "web") {
    localStorage.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

/**
 * Reports which entries currently hold anything. A preference left at its
 * default was never written, so an untouched install honestly shows nothing
 * stored rather than a list of things it could have stored.
 */
export async function inspectLocalData(): Promise<LocalDataStatus> {
  const stored = {} as Record<LocalDataEntry["id"], boolean>;
  let storedKeyCount = 0;

  for (const entry of LOCAL_DATA_ENTRIES) {
    const present = await Promise.all(
      entry.keys.map((key) => getItem(key).then((v) => v !== null).catch(() => false))
    );
    const hits = present.filter(Boolean).length;
    stored[entry.id] = hits > 0;
    storedKeyCount += hits;
  }

  return { stored, storedKeyCount };
}

/**
 * Removes every listed key. Returns how many actually held a value, so the
 * caller can report what happened rather than a fixed number.
 *
 * This only empties storage — the running providers still hold their values in
 * memory. Callers are expected to follow up by putting the live app back to its
 * defaults through the contexts (see app/data-settings.tsx), which is also why
 * this runs first: a context setter persists as it applies, so clearing
 * afterwards would race the write it just triggered.
 */
export async function clearLocalData(): Promise<number> {
  const results = await Promise.all(
    LOCAL_DATA_ENTRIES.flatMap((entry) =>
      entry.keys.map(async (key) => {
        const existed = (await getItem(key).catch(() => null)) !== null;
        await removeItem(key).catch(() => {});
        return existed;
      })
    )
  );

  return results.filter(Boolean).length;
}

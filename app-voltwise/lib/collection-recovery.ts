import { Platform } from "react-native";
import { Directory, File, Paths } from "expo-file-system";

export interface TelemetryRecord {
  timestamp: string;
  appliance: string;
  voltage: number;
  current: number;
  watts: number;
  kwh: number;
  frequency: number;
  powerFactor: number;
}

export interface ActiveSessionBackup {
  applianceName: string;
  targetLine: "all" | "low" | "high";
  startedAt: string;
  savedAt: string;
  elapsedSeconds: number;
  records: TelemetryRecord[];
}

const RECOVERY_DIR_NAME = "recovery";
const RECOVERY_FILE_NAME = "active_collection_backup.json";
const WEB_STORAGE_KEY = "voltwise_active_collection_backup";

function getRecoveryFile(): File | null {
  if (Platform.OS === "web") return null;
  try {
    const dir = new Directory(Paths.cache, RECOVERY_DIR_NAME);
    if (!dir.exists) {
      dir.create({ intermediates: true, idempotent: true });
    }
    return new File(dir, RECOVERY_FILE_NAME);
  } catch (err) {
    console.warn("[Recovery] Failed to initialize recovery directory:", err);
    return null;
  }
}

/**
 * Persists active session state to disk so it survives app restarts or crashes.
 */
export async function saveActiveSessionBackup(
  backup: ActiveSessionBackup
): Promise<boolean> {
  try {
    const json = JSON.stringify(backup);

    if (Platform.OS === "web") {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(WEB_STORAGE_KEY, json);
      }
      return true;
    }

    const file = getRecoveryFile();
    if (!file) return false;

    file.create({ overwrite: true, intermediates: true });
    file.write(json);
    return true;
  } catch (err) {
    console.warn("[Recovery] Failed to save session backup:", err);
    return false;
  }
}

/**
 * Loads any unsaved session backup from disk if one exists.
 */
export async function loadActiveSessionBackup(): Promise<ActiveSessionBackup | null> {
  try {
    if (Platform.OS === "web") {
      if (typeof localStorage !== "undefined") {
        const stored = localStorage.getItem(WEB_STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as ActiveSessionBackup;
          if (parsed && Array.isArray(parsed.records) && parsed.records.length > 0) {
            return parsed;
          }
        }
      }
      return null;
    }

    const file = getRecoveryFile();
    if (!file || !file.exists) return null;

    const content = await file.text();
    if (!content || !content.trim()) return null;

    const parsed = JSON.parse(content) as ActiveSessionBackup;
    if (parsed && Array.isArray(parsed.records) && parsed.records.length > 0) {
      return parsed;
    }
    return null;
  } catch (err) {
    console.warn("[Recovery] Failed to read session backup:", err);
    return null;
  }
}

/**
 * Purges the session backup after successful stop or manual discard.
 */
export async function clearActiveSessionBackup(): Promise<boolean> {
  try {
    if (Platform.OS === "web") {
      if (typeof localStorage !== "undefined") {
        localStorage.removeItem(WEB_STORAGE_KEY);
      }
      return true;
    }

    const file = getRecoveryFile();
    if (file && file.exists) {
      file.delete();
    }
    return true;
  } catch (err) {
    console.warn("[Recovery] Failed to clear session backup:", err);
    return false;
  }
}

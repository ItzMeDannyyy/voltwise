import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

/**
 * Encrypted on-device storage for saved sign-in credentials.
 *
 * Uses expo-secure-store on iOS (Keychain) and Android (EncryptedSharedPreferences
 * backed by Android Keystore), falling back to localStorage on web.
 *
 * Kept completely separate from `voltwise.jwt` (lib/auth-storage.ts) so signing
 * out revokes the active session token while preserving saved credentials for
 * one-tap sign-in suggestions when tapping the email input.
 */

export const SAVED_CREDENTIALS_KEY = "voltwise.saved-credentials";
export const REMEMBER_CREDENTIALS_KEY = "voltwise.remember-credentials";

const MAX_SAVED_CREDENTIALS = 5;

export interface SavedCredential {
  email: string;
  password: string;
  name?: string | null;
  lastUsedAt: number;
}

async function readRaw(key: string): Promise<string | null> {
  try {
    if (Platform.OS === "web") {
      return localStorage.getItem(key);
    }
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

async function writeRaw(key: string, value: string): Promise<void> {
  try {
    if (Platform.OS === "web") {
      localStorage.setItem(key, value);
      return;
    }
    await SecureStore.setItemAsync(key, value);
  } catch {
    // Non-fatal if keystore write fails
  }
}

async function deleteRaw(key: string): Promise<void> {
  try {
    if (Platform.OS === "web") {
      localStorage.removeItem(key);
      return;
    }
    await SecureStore.deleteItemAsync(key);
  } catch {
    // Non-fatal
  }
}

function isValidCredential(item: unknown): item is SavedCredential {
  if (!item || typeof item !== "object") return false;
  const rec = item as Record<string, unknown>;
  return (
    typeof rec.email === "string" &&
    rec.email.trim().length > 0 &&
    typeof rec.password === "string" &&
    rec.password.length > 0 &&
    typeof rec.lastUsedAt === "number"
  );
}

/**
 * Returns saved credentials ordered from most recently used to oldest.
 */
export async function getSavedCredentials(): Promise<SavedCredential[]> {
  const raw = await readRaw(SAVED_CREDENTIALS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isValidCredential)
      .sort((a, b) => b.lastUsedAt - a.lastUsedAt);
  } catch {
    return [];
  }
}

/**
 * Saves or updates a credential entry and moves it to the top of the MRU list.
 */
export async function upsertSavedCredential(entry: {
  email: string;
  password: string;
  name?: string | null;
}): Promise<SavedCredential[]> {
  const cleanEmail = entry.email.trim();
  if (!cleanEmail || !entry.password) {
    return getSavedCredentials();
  }

  const existing = await getSavedCredentials();
  const lower = cleanEmail.toLowerCase();
  const previous = existing.find((c) => c.email.toLowerCase() === lower);

  const updatedEntry: SavedCredential = {
    email: cleanEmail,
    password: entry.password,
    name: entry.name ?? previous?.name ?? null,
    lastUsedAt: Date.now(),
  };

  const next = [
    updatedEntry,
    ...existing.filter((c) => c.email.toLowerCase() !== lower),
  ].slice(0, MAX_SAVED_CREDENTIALS);

  await writeRaw(SAVED_CREDENTIALS_KEY, JSON.stringify(next));
  return next;
}

/**
 * If `email` already has saved credentials on this device, updates its password
 * (e.g. after changing password in Profile settings) so suggestions stay valid.
 */
export async function updateSavedCredentialPassword(
  email: string,
  newPassword: string
): Promise<void> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !newPassword) return;

  const existing = await getSavedCredentials();
  const idx = existing.findIndex((c) => c.email.toLowerCase() === cleanEmail);
  if (idx === -1) return;

  existing[idx] = {
    ...existing[idx],
    password: newPassword,
    lastUsedAt: Date.now(),
  };
  await writeRaw(SAVED_CREDENTIALS_KEY, JSON.stringify(existing));
}

/**
 * Deletes a single saved credential by email (case-insensitive).
 */
export async function removeSavedCredential(
  email: string
): Promise<SavedCredential[]> {
  const lower = email.trim().toLowerCase();
  const existing = await getSavedCredentials();
  const next = existing.filter((c) => c.email.toLowerCase() !== lower);

  if (next.length === 0) {
    await deleteRaw(SAVED_CREDENTIALS_KEY);
  } else {
    await writeRaw(SAVED_CREDENTIALS_KEY, JSON.stringify(next));
  }
  return next;
}

/**
 * Whether "Save credentials on this device" is enabled (defaults to true).
 */
export async function getRememberPreference(): Promise<boolean> {
  const raw = await readRaw(REMEMBER_CREDENTIALS_KEY);
  if (raw === null) return true;
  return raw !== "false";
}

export async function setRememberPreference(remember: boolean): Promise<void> {
  await writeRaw(REMEMBER_CREDENTIALS_KEY, remember ? "true" : "false");
}

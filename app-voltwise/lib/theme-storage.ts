import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import type { FontSize, ThemeMode } from "../constants/theme";

const MODE_KEY = "voltwise.theme-mode";
const FONT_SIZE_KEY = "voltwise.font-size";

/**
 * Persist small theme preferences. Uses SecureStore on native; localStorage
 * on web (SecureStore is unavailable in a browser environment) — same
 * cross-platform pattern as lib/auth-storage.ts.
 */
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

export async function getStoredThemeMode(): Promise<ThemeMode | null> {
  const value = await getItem(MODE_KEY);
  return value === "light" || value === "dark" || value === "system" ? value : null;
}

export async function saveThemeMode(mode: ThemeMode): Promise<void> {
  await setItem(MODE_KEY, mode);
}

export async function getStoredFontSize(): Promise<FontSize | null> {
  const value = await getItem(FONT_SIZE_KEY);
  return value === "small" || value === "medium" || value === "large" ? value : null;
}

export async function saveFontSize(size: FontSize): Promise<void> {
  await setItem(FONT_SIZE_KEY, size);
}

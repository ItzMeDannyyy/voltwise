import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

const JWT_KEY = "voltwise.jwt";

/**
 * Persist a JWT. Uses SecureStore on native; localStorage on web (SecureStore
 * is unavailable in a browser environment).
 */
export async function saveToken(token: string): Promise<void> {
  if (Platform.OS === "web") {
    localStorage.setItem(JWT_KEY, token);
    return;
  }
  await SecureStore.setItemAsync(JWT_KEY, token);
}

/**
 * Retrieve the stored JWT. Returns null when nothing is stored or on error.
 */
export async function getToken(): Promise<string | null> {
  if (Platform.OS === "web") {
    return localStorage.getItem(JWT_KEY);
  }
  return SecureStore.getItemAsync(JWT_KEY);
}

/**
 * Remove the stored JWT (called on sign-out or auth failure).
 */
export async function deleteToken(): Promise<void> {
  if (Platform.OS === "web") {
    localStorage.removeItem(JWT_KEY);
    return;
  }
  await SecureStore.deleteItemAsync(JWT_KEY);
}

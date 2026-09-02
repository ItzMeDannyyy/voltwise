import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { defaultCycle, validateCycle, type BillingCycle } from "./range-prefs";

/**
 * Remembers the utility billing window the user tracks their usage against —
 * the "Jan 14 – Feb 15" printed on their electricity bill.
 *
 * Device-local, following the same cross-platform pattern as lib/iot-storage.ts
 * and lib/unit-storage.ts: SecureStore on native, localStorage on web.
 *
 * The ownership call is worth stating, because it is arguably account data the
 * way the tariff is. It lives on the device because the server needs no memory
 * of it: every request names its own window (`from`/`to`), so the API stays
 * stateless about cycles and there is no schema to migrate. The cost is that a
 * new phone starts from the default month again — one edit to redo, against a
 * database change that would otherwise have to happen before any of this could
 * ship.
 *
 * A stored cycle that no longer validates is treated as absent rather than
 * trusted, since it would otherwise be sent straight into a query the backend
 * would reject.
 */

const BILLING_CYCLE_KEY = "voltwise.billing-cycle";

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

/** Shape-checks a parsed blob before it is trusted as a cycle. */
function isBillingCycle(value: unknown): value is BillingCycle {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<BillingCycle>;
  return (
    typeof candidate.from === "string" &&
    typeof candidate.to === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(candidate.from) &&
    /^\d{4}-\d{2}-\d{2}$/.test(candidate.to)
  );
}

/**
 * The saved cycle, or null when the user has never set one — the caller then
 * falls back to defaultCycle(), the current calendar month.
 */
export async function getStoredBillingCycle(): Promise<BillingCycle | null> {
  try {
    const raw = await getItem(BILLING_CYCLE_KEY);
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    if (!isBillingCycle(parsed)) return null;
    if (validateCycle(parsed) !== null) return null;

    return parsed;
  } catch {
    return null;
  }
}

export async function saveBillingCycle(cycle: BillingCycle): Promise<void> {
  await setItem(BILLING_CYCLE_KEY, JSON.stringify(cycle));
}

/** Forget the saved window so the current calendar month applies again. */
export async function clearBillingCycle(): Promise<void> {
  await removeItem(BILLING_CYCLE_KEY);
}

export { defaultCycle };

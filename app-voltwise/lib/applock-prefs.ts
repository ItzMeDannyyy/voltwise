/**
 * The rules of the app lock: what it can be set to, and — the only genuinely
 * interesting part — when a lock is actually due.
 *
 * Deliberately pure. No React, no Expo, no storage. The provider owns the
 * biometric prompt and the AppState wiring; this module owns the decision, so
 * the timing rule can be reasoned about (and tested) without a device that has
 * a fingerprint enrolled.
 */

/**
 * How long the app may sit in the background before it demands the lock again.
 * A grace period is the difference between a lock people keep and a lock people
 * switch off: without one, glancing at the clock or pasting a password from a
 * manager costs a fingerprint every time.
 */
export type LockDelay = "immediate" | "1m" | "5m";

export const LOCK_DELAYS: LockDelay[] = ["immediate", "1m", "5m"];

export const LOCK_DELAY_LABELS: Record<LockDelay, string> = {
  immediate: "Immediately",
  "1m": "After 1 min",
  "5m": "After 5 min",
};

export const LOCK_DELAY_MS: Record<LockDelay, number> = {
  immediate: 0,
  "1m": 60_000,
  "5m": 5 * 60_000,
};

export const LOCK_DELAY_HINTS: Record<LockDelay, string> = {
  immediate: "Locks the moment you leave the app.",
  "1m": "A quick glance at another app won't ask you to unlock again.",
  "5m": "Most convenient, and the longest window in which someone holding your unlocked phone could open VoltWise.",
};

export interface AppLockPrefs {
  enabled: boolean;
  delay: LockDelay;
}

export const DEFAULT_APP_LOCK_PREFS: AppLockPrefs = {
  enabled: false,
  delay: "immediate",
};

/**
 * Rebuilds prefs from whatever was on disk. Anything unrecognised falls back to
 * the default rather than throwing: a corrupted preference should leave the app
 * usable, and the worst case here is an unlocked app whose owner can turn the
 * lock back on.
 */
export function parseAppLockPrefs(raw: string | null): AppLockPrefs {
  if (raw === null) return DEFAULT_APP_LOCK_PREFS;

  try {
    const parsed = JSON.parse(raw) as Partial<AppLockPrefs>;
    const delay = LOCK_DELAYS.find((candidate) => candidate === parsed.delay);

    return {
      enabled: parsed.enabled === true,
      delay: delay ?? DEFAULT_APP_LOCK_PREFS.delay,
    };
  } catch {
    return DEFAULT_APP_LOCK_PREFS;
  }
}

/**
 * Whether returning to the foreground should re-lock the app.
 *
 * `leftAt` is null when the app has not been backgrounded since it launched —
 * a cold start is always a lock, whatever the delay, because the grace period
 * exists to forgive app-switching and not to leave a launched app open.
 */
export function shouldLockOnResume(input: {
  enabled: boolean;
  delay: LockDelay;
  leftAt: number | null;
  now: number;
}): boolean {
  if (!input.enabled) return false;
  if (input.leftAt === null) return true;

  return input.now - input.leftAt >= LOCK_DELAY_MS[input.delay];
}

// ---- What the hardware can do ----

/**
 * Why the lock may be unavailable. Kept as a verdict rather than a boolean
 * because the three failure modes need three different things from the user:
 * a browser can never do this, a phone with no sensor cannot either, but a
 * phone with nothing enrolled just needs a fingerprint adding in OS settings —
 * and that last one is the common case worth a precise message.
 */
export type LockAvailability = "ready" | "not-enrolled" | "no-hardware" | "unsupported";

export const LOCK_AVAILABILITY_LABELS: Record<LockAvailability, string> = {
  ready: "Available",
  "not-enrolled": "Nothing enrolled",
  "no-hardware": "No sensor",
  unsupported: "Not supported",
};

export const LOCK_AVAILABILITY_HINTS: Record<LockAvailability, string> = {
  ready: "",
  "not-enrolled":
    "Add a fingerprint, face or screen lock in your device settings, then come back — VoltWise uses whatever this phone already trusts.",
  "no-hardware": "This device has no biometric sensor or screen lock to check against.",
  unsupported:
    "The app lock needs a phone's biometrics or passcode, which a browser cannot offer. Open VoltWise on your device to use it.",
};

/**
 * Human name for what the device will actually prompt with, e.g. "Face ID" or
 * "Fingerprint". `types` are expo-local-authentication's AuthenticationType
 * values, passed in as plain numbers so this module stays free of the native
 * import: 1 fingerprint, 2 facial recognition, 3 iris.
 */
export function describeLockMethod(types: number[], availability: LockAvailability): string {
  if (availability === "unsupported" || availability === "no-hardware") {
    return "Unavailable on this device";
  }

  const names: string[] = [];
  if (types.includes(2)) names.push("Face");
  if (types.includes(1)) names.push("Fingerprint");
  if (types.includes(3)) names.push("Iris");

  if (names.length === 0) return "Device passcode";

  return `${names.join(" or ")} · passcode fallback`;
}

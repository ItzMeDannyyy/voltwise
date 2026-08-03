import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState, Platform } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import { useAuth } from "./AuthContext";
import {
  DEFAULT_APP_LOCK_PREFS,
  describeLockMethod,
  shouldLockOnResume,
  type AppLockPrefs,
  type LockAvailability,
  type LockDelay,
} from "../lib/applock-prefs";
import { getStoredAppLockPrefs, saveAppLockPrefs } from "../lib/applock-storage";

/**
 * The app lock: biometrics (or the device passcode) between someone holding
 * this phone and the account already signed in on it.
 *
 * Two rules are worth knowing before changing anything here.
 *
 * 1. The lock only engages while signed in. A signed-out app is already behind
 *    the login screen, and locking it would just be a second door on an empty
 *    room — one the user cannot open, since sign-out is the escape hatch from
 *    the lock screen itself.
 *
 * 2. The lock only engages when the device can actually verify someone
 *    (`availability === "ready"`). If the owner removes their fingerprints, the
 *    preference stays on but stops taking effect. The alternative is a locked
 *    app with no key: authenticateAsync would fail forever and the only way
 *    back in would be to reinstall. A lock nobody can open protects nothing, so
 *    it yields — and the Privacy & Security screen says so plainly rather than
 *    letting the user believe they are protected.
 */

const isWeb = Platform.OS === "web";

interface AppLockContextValue {
  prefs: AppLockPrefs;
  /** False until the stored preference and the hardware check have resolved. */
  isReady: boolean;
  /** What this device can verify with right now. */
  availability: LockAvailability;
  /** "Face or Fingerprint · passcode fallback" — for the settings subtitle. */
  methodLabel: string;
  /** True when the lock overlay should be covering the app. */
  isLocked: boolean;
  /**
   * True when the preference is on but the device can no longer verify anyone,
   * so the lock is dormant. The settings screen warns about exactly this.
   */
  isDormant: boolean;
  /**
   * Turns the lock on or off. Enabling prompts for biometrics first — proving
   * the device can verify *you* before it is allowed to keep you out later.
   * Returns null on success, or a message explaining why nothing changed.
   */
  setEnabled: (value: boolean) => Promise<string | null>;
  setDelay: (delay: LockDelay) => void;
  /** Runs the unlock prompt. Returns true when the app was unlocked. */
  unlock: () => Promise<boolean>;
  /** Re-reads the hardware, e.g. after the user enrolls a fingerprint. */
  refreshAvailability: () => Promise<void>;
  /** Restores defaults, live and persisted — for the Data & Export reset. */
  resetAppLock: () => void;
}

const AppLockContext = createContext<AppLockContextValue | undefined>(undefined);

/**
 * Asks the OS what it can verify with. Anything that throws is treated as "no
 * hardware": a device that cannot answer the question cannot perform the check
 * either, and the lock must fail open rather than trap the owner.
 */
async function readAvailability(): Promise<LockAvailability> {
  if (isWeb) return "unsupported";

  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    if (!hasHardware) return "no-hardware";

    // isEnrolledAsync covers the device passcode as well as biometrics, which
    // matches what authenticateAsync will accept with device fallback left on.
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    if (!isEnrolled) return "not-enrolled";

    return "ready";
  } catch {
    return "no-hardware";
  }
}

async function promptForIdentity(message: string): Promise<boolean> {
  if (isWeb) return false;

  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: message,
      cancelLabel: "Cancel",
      // Device passcode stays available on purpose: a wet finger should not be
      // the reason someone cannot reach their own energy data.
      disableDeviceFallback: false,
      fallbackLabel: "Use passcode",
    });

    return result.success;
  } catch {
    return false;
  }
}

export function AppLockProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();

  const [prefs, setPrefs] = useState<AppLockPrefs>(DEFAULT_APP_LOCK_PREFS);
  const [availability, setAvailability] = useState<LockAvailability>(
    isWeb ? "unsupported" : "no-hardware"
  );
  const [supportedTypes, setSupportedTypes] = useState<number[]>([]);
  const [isReady, setIsReady] = useState(false);
  const [isLocked, setIsLocked] = useState(false);

  // When the app last went to the background. Null means "not since launch",
  // which shouldLockOnResume reads as a cold start.
  const leftAtRef = useRef<number | null>(null);
  // The AppState listener is registered once, so it cannot close over state.
  const prefsRef = useRef(prefs);
  const armedRef = useRef(false);

  const canEngage = availability === "ready";
  const armed = prefs.enabled && canEngage && isAuthenticated;

  useEffect(() => {
    prefsRef.current = prefs;
  }, [prefs]);

  useEffect(() => {
    armedRef.current = armed;
  }, [armed]);

  // ---- Hydration ----

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const [stored, verdict] = await Promise.all([
        getStoredAppLockPrefs(),
        readAvailability(),
      ]);

      if (cancelled) return;

      setPrefs(stored);
      setAvailability(verdict);

      // Cold start: if the lock is live, the app comes up locked. Set before
      // isReady so the overlay is already in place on the first painted frame
      // rather than appearing over content the user has had a moment to read.
      if (stored.enabled && verdict === "ready") {
        setIsLocked(true);
      }

      if (!isWeb) {
        LocalAuthentication.supportedAuthenticationTypesAsync()
          .then((types) => {
            if (!cancelled) setSupportedTypes(types as number[]);
          })
          .catch(() => {});
      }

      setIsReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // ---- Locking on resume ----

  useEffect(() => {
    if (isWeb) return;

    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        if (
          armedRef.current &&
          shouldLockOnResume({
            enabled: true,
            delay: prefsRef.current.delay,
            leftAt: leftAtRef.current,
            now: Date.now(),
          })
        ) {
          setIsLocked(true);
        }
        leftAtRef.current = null;
        return;
      }

      // "inactive" is iOS's transient state (control centre, app switcher). It
      // is recorded the same as a full background: the grace period is what
      // decides whether a two-second glance costs a fingerprint, not this.
      if (leftAtRef.current === null) {
        leftAtRef.current = Date.now();
      }
    });

    return () => sub.remove();
  }, []);

  // Signing out drops the lock — see rule 1 in the module comment. It also
  // clears the backgrounded timestamp so the next sign-in starts clean.
  useEffect(() => {
    if (!isAuthenticated) {
      setIsLocked(false);
      leftAtRef.current = null;
    }
  }, [isAuthenticated]);

  // ---- Actions ----

  const persist = useCallback((next: AppLockPrefs) => {
    setPrefs(next);
    saveAppLockPrefs(next).catch(() => {});
  }, []);

  const refreshAvailability = useCallback(async () => {
    const verdict = await readAvailability();
    setAvailability(verdict);

    if (!isWeb) {
      try {
        setSupportedTypes(
          (await LocalAuthentication.supportedAuthenticationTypesAsync()) as number[]
        );
      } catch {
        // Leave the previous list; it only feeds a label.
      }
    }
  }, []);

  const setEnabled = useCallback(
    async (value: boolean): Promise<string | null> => {
      if (!value) {
        // Turning the lock off is not gated behind a prompt. Whoever is holding
        // the phone has already passed the lock to be looking at this screen.
        persist({ ...prefsRef.current, enabled: false });
        setIsLocked(false);
        return null;
      }

      // Re-check rather than trusting a verdict from launch: the user may have
      // just added a fingerprint precisely because this screen told them to.
      const verdict = await readAvailability();
      setAvailability(verdict);

      if (verdict !== "ready") {
        return verdict === "not-enrolled"
          ? "Set up a fingerprint, face unlock or a screen lock on this device first."
          : "This device can't verify you, so the app lock isn't available here.";
      }

      const passed = await promptForIdentity("Confirm it's you to turn on the app lock");

      if (!passed) {
        return "That didn't verify, so the app lock is still off.";
      }

      persist({ ...prefsRef.current, enabled: true });
      return null;
    },
    [persist]
  );

  const setDelay = useCallback(
    (delay: LockDelay) => {
      persist({ ...prefsRef.current, delay });
    },
    [persist]
  );

  const unlock = useCallback(async (): Promise<boolean> => {
    const passed = await promptForIdentity("Unlock VoltWise");

    if (passed) {
      setIsLocked(false);
      leftAtRef.current = null;
    }

    return passed;
  }, []);

  const resetAppLock = useCallback(() => {
    persist(DEFAULT_APP_LOCK_PREFS);
    setIsLocked(false);
  }, [persist]);

  const value = useMemo<AppLockContextValue>(
    () => ({
      prefs,
      isReady,
      availability,
      methodLabel: describeLockMethod(supportedTypes, availability),
      isLocked: isLocked && armed,
      isDormant: prefs.enabled && !canEngage,
      setEnabled,
      setDelay,
      unlock,
      refreshAvailability,
      resetAppLock,
    }),
    [
      prefs,
      isReady,
      availability,
      supportedTypes,
      isLocked,
      armed,
      canEngage,
      setEnabled,
      setDelay,
      unlock,
      refreshAvailability,
      resetAppLock,
    ]
  );

  return <AppLockContext.Provider value={value}>{children}</AppLockContext.Provider>;
}

export function useAppLock(): AppLockContextValue {
  const ctx = useContext(AppLockContext);
  if (!ctx) {
    throw new Error("useAppLock must be used within an AppLockProvider");
  }
  return ctx;
}

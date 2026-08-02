import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState, DeviceEventEmitter, Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { api, ApiAlert, ALERTS_CHANGED_EVENT } from "../lib/api";
import { useAuth } from "./AuthContext";
import {
  DEFAULT_NOTIFICATION_PREFS,
  highWaterMark,
  isAlertVisible as isAlertVisibleRule,
  newAlertsSince,
  shouldNotify as shouldNotifyRule,
  type AlertSeverity,
  type NotificationPrefs,
  type QuietHours,
} from "../lib/notification-rules";
import {
  getStoredNotificationPrefs,
  getStoredNotifiedHighWater,
  saveNotificationPrefs,
  saveNotifiedHighWater,
} from "../lib/notification-storage";

/**
 * Notification preferences + the local-banner engine.
 *
 * Delivery model: this is NOT background push. The engine runs in JS, so it
 * only fires while the app is alive — on an alert event, or on the catch-up
 * sweep when the app returns to the foreground. With the app swiped away the
 * MQTT socket dies and nothing arrives until next launch. Real background
 * delivery needs remote push, a dev build and backend token storage.
 */

export type PermissionState = "granted" | "denied" | "undetermined" | "unsupported";

const isWeb = Platform.OS === "web";

// Android channels are immutable once created, so a single channel could never
// be silenced later. Pre-create a sounded and a silent variant of each
// importance level instead and pick per alert at schedule time — this is what
// makes the sound toggle actually work on Android 8+.
const CHANNELS = {
  criticalLoud: "voltwise-critical",
  criticalSilent: "voltwise-critical-silent",
  defaultLoud: "voltwise-default",
  defaultSilent: "voltwise-default-silent",
} as const;

/** Never banner more than this many missed alerts at once after a gap. */
const MAX_CATCHUP_BURST = 3;

// Registered once at module scope: without it a notification posted while the
// app is foregrounded is delivered silently to the tray with no banner.
// `shouldPlaySound` stays true here and sound is decided per-notification at
// schedule time — this handler can't read React state.
if (!isWeb) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

interface NotificationContextValue {
  prefs: NotificationPrefs;
  /** False until persisted preferences have finished loading. */
  isReady: boolean;
  permission: PermissionState;
  requestPermission: () => Promise<boolean>;

  setEnabled: (value: boolean) => void;
  setSeverity: (severity: AlertSeverity, value: boolean) => void;
  setSound: (value: boolean) => void;
  setHaptics: (value: boolean) => void;
  setNewLoadPrompt: (value: boolean) => void;
  setQuietHours: (patch: Partial<QuietHours>) => void;
  /** Restores every preference to its default, live and persisted. */
  resetPrefs: () => void;

  /** Master + severity — for badges and lists. Quiet hours does NOT apply. */
  isAlertVisible: (alert: Pick<ApiAlert, "type">) => boolean;
  /** Master + severity + quiet hours — for banners, sound and haptics. */
  shouldNotify: (alert: Pick<ApiAlert, "type">) => boolean;
}

const NotificationContext = createContext<NotificationContextValue | undefined>(undefined);

function channelFor(severity: AlertSeverity, sound: boolean): string {
  if (severity === "critical") return sound ? CHANNELS.criticalLoud : CHANNELS.criticalSilent;
  return sound ? CHANNELS.defaultLoud : CHANNELS.defaultSilent;
}

async function ensureAndroidChannels(): Promise<void> {
  if (Platform.OS !== "android") return;
  const { AndroidImportance } = Notifications;
  await Promise.all([
    Notifications.setNotificationChannelAsync(CHANNELS.criticalLoud, {
      name: "Critical alerts",
      importance: AndroidImportance.MAX,
      sound: "default",
    }),
    Notifications.setNotificationChannelAsync(CHANNELS.criticalSilent, {
      name: "Critical alerts (silent)",
      importance: AndroidImportance.MAX,
      sound: null,
    }),
    Notifications.setNotificationChannelAsync(CHANNELS.defaultLoud, {
      name: "Alerts",
      importance: AndroidImportance.DEFAULT,
      sound: "default",
    }),
    Notifications.setNotificationChannelAsync(CHANNELS.defaultSilent, {
      name: "Alerts (silent)",
      importance: AndroidImportance.LOW,
      sound: null,
    }),
  ]);
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isBootstrapping } = useAuth();

  const [prefs, setPrefsState] = useState<NotificationPrefs>(DEFAULT_NOTIFICATION_PREFS);
  const [isReady, setIsReady] = useState(false);
  const [permission, setPermission] = useState<PermissionState>(
    isWeb ? "unsupported" : "undetermined"
  );

  // Read by the async engine, which must not be re-created whenever a toggle
  // flips. Mirrored in an effect rather than during render (React Compiler).
  const prefsRef = useRef(prefs);
  useEffect(() => {
    prefsRef.current = prefs;
  }, [prefs]);

  // Highest alert id already turned into a banner.
  const hwmRef = useRef(0);
  const inFlightRef = useRef(false);
  const pendingRef = useRef(false);
  const baselinedRef = useRef(false);

  // ---- Hydration ----

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [storedPrefs, storedHwm] = await Promise.all([
        getStoredNotificationPrefs(),
        getStoredNotifiedHighWater(),
      ]);
      if (cancelled) return;
      if (storedPrefs) setPrefsState(storedPrefs);
      hwmRef.current = storedHwm;
      setIsReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ---- Permission + channels ----

  useEffect(() => {
    if (isWeb) return;
    let cancelled = false;
    (async () => {
      try {
        await ensureAndroidChannels();
        const { status } = await Notifications.getPermissionsAsync();
        if (!cancelled) setPermission(status as PermissionState);
      } catch {
        // Expo Go warns about limited notification support; never fatal.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const requestPermission = useCallback(async () => {
    if (isWeb) return false;
    try {
      const { status } = await Notifications.requestPermissionsAsync();
      setPermission(status as PermissionState);
      return status === "granted";
    } catch {
      return false;
    }
  }, []);

  // ---- Preference setters ----

  const update = useCallback((patch: Partial<NotificationPrefs>) => {
    setPrefsState((prev) => {
      const next = { ...prev, ...patch };
      saveNotificationPrefs(next).catch(() => {});
      return next;
    });
  }, []);

  const setEnabled = useCallback((value: boolean) => update({ enabled: value }), [update]);
  const setSound = useCallback((value: boolean) => update({ sound: value }), [update]);
  const setHaptics = useCallback((value: boolean) => update({ haptics: value }), [update]);
  const setNewLoadPrompt = useCallback(
    (value: boolean) => update({ newLoadPrompt: value }),
    [update]
  );

  const setSeverity = useCallback(
    (severity: AlertSeverity, value: boolean) => {
      setPrefsState((prev) => {
        const next = { ...prev, severities: { ...prev.severities, [severity]: value } };
        saveNotificationPrefs(next).catch(() => {});
        return next;
      });
    },
    []
  );

  const setQuietHours = useCallback((patch: Partial<QuietHours>) => {
    setPrefsState((prev) => {
      const next = { ...prev, quietHours: { ...prev.quietHours, ...patch } };
      saveNotificationPrefs(next).catch(() => {});
      return next;
    });
  }, []);

  /**
   * Restores every preference at once. Exists for the Data & Export reset,
   * which has to put the live app back to its defaults — clearing storage alone
   * would leave the running provider on the old values until the next launch.
   * Does not touch the notified-alert high-water mark: that is engine
   * bookkeeping rather than a preference, and it is cleared at the storage
   * level by lib/local-data.ts.
   */
  const resetPrefs = useCallback(() => {
    setPrefsState(DEFAULT_NOTIFICATION_PREFS);
    saveNotificationPrefs(DEFAULT_NOTIFICATION_PREFS).catch(() => {});
  }, []);

  // ---- The banner engine ----

  const present = useCallback(async (alert: ApiAlert) => {
    const current = prefsRef.current;
    if (!shouldNotifyRule(alert, current)) return;
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: alert.title,
          body: alert.description,
          sound: current.sound ? "default" : false,
          data: { alertId: alert.id },
        },
        // A bare { channelId } trigger delivers immediately on that channel;
        // iOS has no channels and takes null.
        trigger:
          Platform.OS === "android" ? { channelId: channelFor(alert.type, current.sound) } : null,
      });
    } catch {
      // Permission revoked mid-session, or Expo Go limitation — skip silently.
    }
    if (current.haptics) {
      Haptics.notificationAsync(
        alert.type === "critical"
          ? Haptics.NotificationFeedbackType.Warning
          : Haptics.NotificationFeedbackType.Success
      ).catch(() => {});
    }
  }, []);

  /**
   * Diff GET /alerts against the high-water mark and banner what's new.
   *
   * Driven by ALERTS_CHANGED_EVENT rather than MQTT: every alert-producing
   * path already ends in emitAlertsChanged(), whereas the MQTT events topic
   * only ever carries new_load and could never produce a critical banner.
   */
  const sync = useCallback(
    async function run(baselineOnly = false): Promise<void> {
      if (isWeb) return;
      // This provider lives above the (tabs) auth gate, so an ungated fetch
      // would 401 during bootstrap and trip the global sign-out listener.
      if (!isAuthenticated || isBootstrapping) return;

      if (inFlightRef.current) {
        pendingRef.current = true;
        return;
      }
      inFlightRef.current = true;

      try {
        const list = await api.get<ApiAlert[]>("/alerts");
        const fresh = newAlertsSince(list, hwmRef.current);
        // Raise the mark BEFORE scheduling anything: even if a second sync
        // overlaps, its diff now starts above these ids, so no alert can be
        // bannered twice by the three redundant refresh subscribers.
        hwmRef.current = highWaterMark(list, hwmRef.current);
        saveNotifiedHighWater(hwmRef.current).catch(() => {});

        if (!baselineOnly) {
          // After a long gap, banner only the most recent few.
          for (const alert of fresh.slice(-MAX_CATCHUP_BURST)) {
            await present(alert);
          }
        }
      } catch {
        // Offline — the next event or foreground sweep retries.
      } finally {
        inFlightRef.current = false;
        if (pendingRef.current) {
          pendingRef.current = false;
          void run(false);
        }
      }
    },
    [isAuthenticated, isBootstrapping, present]
  );

  // First sync after hydration establishes the baseline. Without a stored
  // mark this records the newest id and notifies nothing, so a fresh install
  // doesn't banner the entire backlog.
  useEffect(() => {
    if (!isReady || isWeb) return;
    if (!isAuthenticated || isBootstrapping) return;
    const coldStart = !baselinedRef.current && hwmRef.current === 0;
    baselinedRef.current = true;
    void sync(coldStart);
  }, [isReady, isAuthenticated, isBootstrapping, sync]);

  useEffect(() => {
    if (isWeb) return;
    const sub = DeviceEventEmitter.addListener(ALERTS_CHANGED_EVENT, () => {
      void sync(false);
    });
    return () => sub.remove();
  }, [sync]);

  // Catch alerts created while the app was backgrounded and the socket dozed.
  useEffect(() => {
    if (isWeb) return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void sync(false);
    });
    return () => sub.remove();
  }, [sync]);

  useEffect(() => {
    if (isWeb) return;
    const sub = Notifications.addNotificationResponseReceivedListener(() => {
      router.push("/(tabs)/alerts");
    });
    return () => sub.remove();
  }, []);

  // ---- Bound predicates ----

  const isAlertVisible = useCallback(
    (alert: Pick<ApiAlert, "type">) => isAlertVisibleRule(alert, prefs),
    [prefs]
  );

  const shouldNotify = useCallback(
    (alert: Pick<ApiAlert, "type">) => shouldNotifyRule(alert, prefs),
    [prefs]
  );

  const value = useMemo<NotificationContextValue>(
    () => ({
      prefs,
      isReady,
      permission,
      requestPermission,
      setEnabled,
      setSeverity,
      setSound,
      setHaptics,
      setNewLoadPrompt,
      setQuietHours,
      resetPrefs,
      isAlertVisible,
      shouldNotify,
    }),
    [
      prefs,
      isReady,
      permission,
      requestPermission,
      setEnabled,
      setSeverity,
      setSound,
      setHaptics,
      setNewLoadPrompt,
      setQuietHours,
      resetPrefs,
      isAlertVisible,
      shouldNotify,
    ]
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error("useNotifications must be used within a NotificationProvider");
  }
  return ctx;
}

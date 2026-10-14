import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import * as Haptics from "expo-haptics";
import { api } from "../lib/api";
import { useDemoData } from "./DemoDataContext";
import { useMqtt } from "./MqttContext";

export type PowerLineTarget = "all" | "high" | "low";

export interface PowerControlContextValue {
  /** Master state: true if both or any lines are energized, false when all lines are off */
  masterOn: boolean;
  /** High Voltage / High Load Line state (30A relays: Aircon, Refrigerator, Water Pump) */
  highOn: boolean;
  /** Low Voltage / Low Load Line state (10A relays: Smart TV, Rice Cooker, Chargers, Lights) */
  lowOn: boolean;

  /** True while the 3-second staggered inrush protection is actively energizing lines */
  isStaggering: boolean;
  /** Inrush protection stagger interval in seconds (default 3) */
  staggerSeconds: number;

  /** True while a relay command is in flight */
  pending: boolean;
  /** Target currently executing a command, or null */
  pendingTarget: PowerLineTarget | null;
  /** Error message from the last failed command, if any */
  error: string | null;

  /** Whether the IoT device is currently unreachable */
  isOffline: boolean;
  /** Whether sample data presentation mode is active */
  isDemoMode: boolean;
  /** Whether user is allowed to toggle (true in Demo Mode or when Hardware is Live) */
  canControl: boolean;

  /** Controls for each line separately and all lines simultaneously */
  toggleMaster: (targetState?: boolean) => Promise<void>;
  toggleHighLine: (targetState?: boolean) => Promise<void>;
  toggleLowLine: (targetState?: boolean) => Promise<void>;

  /** Modal visibility control */
  isModalVisible: boolean;
  openModal: () => void;
  closeModal: () => void;
}

const PowerControlContext = createContext<PowerControlContextValue | undefined>(undefined);

const RELAY_COMMAND_TIMEOUT_MS = 10_000;

export function PowerControlProvider({ children }: { children: ReactNode }) {
  const { demoData } = useDemoData();
  const { relayState, connected, deviceOnline } = useMqtt();

  // Hardware reachability
  const isIotReachable = connected && deviceOnline && relayState !== null;
  const isOffline = !isIotReachable;

  // Controls are only interactive if in Demo Mode OR if hardware is live connected
  const canControl = demoData || isIotReachable;

  // Optimistic local states while online commands are in flight
  const [localHighOn, setLocalHighOn] = useState<boolean | null>(null);
  const [localLowOn, setLocalLowOn] = useState<boolean | null>(null);
  const [pending, setPending] = useState(false);
  const [pendingTarget, setPendingTarget] = useState<PowerLineTarget | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Modal open/close state
  const [isModalVisible, setIsModalVisible] = useState(false);

  // Standalone states for Demo Mode
  const [demoHighOn, setDemoHighOn] = useState(true);
  const [demoLowOn, setDemoLowOn] = useState(true);
  const [demoStaggering, setDemoStaggering] = useState(false);
  const demoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stagger state: either hardware reports staggering over MQTT, or Demo Mode stagger is active
  const isHardwareStaggering = relayState?.staggering === true;
  const isStaggering = demoData ? demoStaggering : isHardwareStaggering;
  const staggerSeconds = relayState?.staggerSeconds ?? 3;

  // Reconcile optimistic values when the firmware confirms state over MQTT
  useEffect(() => {
    if (relayState === null) return;

    if (relayState.staggering) {
      // In the middle of staggered power-up!
      // Low line is confirmed ON, High line is scheduled in 3s.
      // Keep pending active to prevent user double-clicks and avoid false "OFF" flicker.
      setLocalLowOn(true);
      setLocalHighOn(false);
      setPending(true);
      setPendingTarget("all");

      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        setLocalHighOn(null);
        setLocalLowOn(null);
        setPending(false);
        setPendingTarget(null);
      }, (relayState.staggerSeconds ?? 3) * 1000 + 2000);
    } else {
      // Normal confirmation or stagger completed
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setLocalHighOn(null);
      setLocalLowOn(null);
      setPending(false);
      setPendingTarget(null);
    }
  }, [relayState]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (demoTimeoutRef.current) clearTimeout(demoTimeoutRef.current);
    };
  }, []);

  // Compute effective line states
  const effectiveHighOn = useMemo(() => {
    if (demoData) return demoHighOn;
    if (localHighOn !== null) return localHighOn;
    if (relayState?.highOn !== undefined) return relayState.highOn;
    return relayState?.on ?? true;
  }, [demoData, demoHighOn, localHighOn, relayState]);

  const effectiveLowOn = useMemo(() => {
    if (demoData) return demoLowOn;
    if (localLowOn !== null) return localLowOn;
    if (relayState?.lowOn !== undefined) return relayState.lowOn;
    return relayState?.on ?? true;
  }, [demoData, demoLowOn, localLowOn, relayState]);

  const effectiveMasterOn = effectiveHighOn || effectiveLowOn || isStaggering;

  const openModal = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setIsModalVisible(true);
  }, []);

  const closeModal = useCallback(() => {
    setIsModalVisible(false);
  }, []);

  // Turn ON or OFF both lines simultaneously (Master Power)
  const toggleMaster = useCallback(
    async (targetState?: boolean) => {
      // If offline and NOT in demo mode, buttons cannot be clicked / no offline maneuver
      if (!demoData && isOffline) {
        return;
      }

      const next = targetState !== undefined ? targetState : !effectiveMasterOn;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
      setError(null);

      // 1. Sample Data Demo Mode: match 3-second stagger feature!
      if (demoData) {
        if (next) {
          setDemoLowOn(true);
          setDemoHighOn(false);
          setDemoStaggering(true);
          setPending(true);
          setPendingTarget("all");
          if (demoTimeoutRef.current) clearTimeout(demoTimeoutRef.current);
          demoTimeoutRef.current = setTimeout(() => {
            setDemoHighOn(true);
            setDemoStaggering(false);
            setPending(false);
            setPendingTarget(null);
          }, 3000);
        } else {
          if (demoTimeoutRef.current) clearTimeout(demoTimeoutRef.current);
          setDemoStaggering(false);
          setDemoHighOn(false);
          setDemoLowOn(false);
          setPending(false);
          setPendingTarget(null);
        }
        return;
      }

      // 2. Hardware Live Mode: dispatch to ESP32 dual relays via MQTT
      if (next) {
        // Toggling Master ON: Low line energizes immediately, High line staggers in 3s
        setLocalLowOn(true);
        setLocalHighOn(false);
      } else {
        setLocalLowOn(false);
        setLocalHighOn(false);
      }
      setPending(true);
      setPendingTarget("all");

      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        setLocalHighOn(null);
        setLocalLowOn(null);
        setPending(false);
        setPendingTarget(null);
        setError("The sensor did not confirm master relay command.");
      }, RELAY_COMMAND_TIMEOUT_MS);

      try {
        await api.post("/iot/relay", { on: next, line: "all" });
      } catch (err) {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        setLocalHighOn(null);
        setLocalLowOn(null);
        setPending(false);
        setPendingTarget(null);
        setError(err instanceof Error ? err.message : "Failed to switch master power.");
      }
    },
    [demoData, isOffline, effectiveMasterOn]
  );

  // Turn ON or OFF High Load Line individually (Outlet 1: 30A relays)
  const toggleHighLine = useCallback(
    async (targetState?: boolean) => {
      if (!demoData && isOffline) {
        return;
      }

      const next = targetState !== undefined ? targetState : !effectiveHighOn;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      setError(null);

      // 1. Sample Data Demo Mode
      if (demoData) {
        setDemoHighOn(next);
        return;
      }

      // 2. Hardware Live Mode
      setLocalHighOn(next);
      setPending(true);
      setPendingTarget("high");

      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        setLocalHighOn(null);
        setPending(false);
        setPendingTarget(null);
        setError("The sensor did not confirm High Load line command.");
      }, RELAY_COMMAND_TIMEOUT_MS);

      try {
        await api.post("/iot/relay", { on: next, line: "high" });
      } catch (err) {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        setLocalHighOn(null);
        setPending(false);
        setPendingTarget(null);
        setError(err instanceof Error ? err.message : "Failed to switch High Load line.");
      }
    },
    [demoData, isOffline, effectiveHighOn]
  );

  // Turn ON or OFF Low Load Line individually (Outlet 2: 10A relays)
  const toggleLowLine = useCallback(
    async (targetState?: boolean) => {
      if (!demoData && isOffline) {
        return;
      }

      const next = targetState !== undefined ? targetState : !effectiveLowOn;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      setError(null);

      // 1. Sample Data Demo Mode
      if (demoData) {
        setDemoLowOn(next);
        return;
      }

      // 2. Hardware Live Mode
      setLocalLowOn(next);
      setPending(true);
      setPendingTarget("low");

      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        setLocalLowOn(null);
        setPending(false);
        setPendingTarget(null);
        setError("The sensor did not confirm Low Load line command.");
      }, RELAY_COMMAND_TIMEOUT_MS);

      try {
        await api.post("/iot/relay", { on: next, line: "low" });
      } catch (err) {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        setLocalLowOn(null);
        setPending(false);
        setPendingTarget(null);
        setError(err instanceof Error ? err.message : "Failed to switch Low Load line.");
      }
    },
    [demoData, isOffline, effectiveLowOn]
  );

  const value = useMemo(
    () => ({
      masterOn: effectiveMasterOn,
      highOn: effectiveHighOn,
      lowOn: effectiveLowOn,
      isStaggering,
      staggerSeconds,
      pending,
      pendingTarget,
      error,
      isOffline,
      isDemoMode: demoData,
      canControl,
      toggleMaster,
      toggleHighLine,
      toggleLowLine,
      isModalVisible,
      openModal,
      closeModal,
    }),
    [
      effectiveMasterOn,
      effectiveHighOn,
      effectiveLowOn,
      isStaggering,
      staggerSeconds,
      pending,
      pendingTarget,
      error,
      isOffline,
      demoData,
      canControl,
      toggleMaster,
      toggleHighLine,
      toggleLowLine,
      isModalVisible,
      openModal,
      closeModal,
    ]
  );

  return <PowerControlContext.Provider value={value}>{children}</PowerControlContext.Provider>;
}

export function usePowerControl(): PowerControlContextValue {
  const ctx = useContext(PowerControlContext);
  if (!ctx) {
    throw new Error("usePowerControl must be used inside a PowerControlProvider");
  }
  return ctx;
}

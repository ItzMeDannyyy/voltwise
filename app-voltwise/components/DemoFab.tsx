import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Easing,
  Pressable,
  Platform,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api, ApiAlert, emitAlertsChanged, requestMasterShutdown } from "../lib/api";
import { AnomalyModal } from "./AnomalyModal";

const C = {
  bg: "#1a1f2e",
  card: "#242b3d",
  accent: "#00d4aa",
  text: "#ffffff",
  sub: "#9ca3af",
  border: "#2d3448",
  yellow: "#f59e0b",
  red: "#ef4444",
  blue: "#3b82f6",
  purple: "#8b5cf6",
};

interface AlertPayload {
  type: "critical" | "warning" | "info";
  title: string;
  description: string;
  recommendation?: string;
  threshold?: number;
  value?: number;
}

interface Preset {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  payload: AlertPayload;
}

// Preset events that exercise every branch of the alert system.
const PRESETS: Preset[] = [
  {
    key: "anomaly",
    label: "Appliance power anomaly",
    icon: "pulse",
    color: C.red,
    payload: {
      type: "critical",
      title: "Air Conditioner power anomaly",
      description:
        "Air Conditioner is drawing 3.4 kW — 180% above its normal demand.",
      recommendation:
        "Inspect the unit for a failing compressor or a blocked air filter.",
      threshold: 1.2,
      value: 3.4,
    },
  },
  {
    key: "outage",
    label: "Power outage",
    icon: "flash-off",
    color: C.red,
    payload: {
      type: "critical",
      title: "Power outage detected",
      description: "Mains power was lost on the main incoming circuit.",
      recommendation:
        "Check your main breaker and your utility provider's outage status.",
    },
  },
  {
    key: "threshold",
    label: "Threshold exceeded",
    icon: "warning",
    color: C.yellow,
    payload: {
      type: "critical",
      title: "Consumption exceeded 4.5 kW threshold",
      description: "Whole-home demand reached 4.8 kW for over 5 minutes.",
      recommendation: "Turn off high-draw appliances to avoid peak charges.",
      threshold: 4.5,
      value: 4.8,
    },
  },
  {
    key: "voltage",
    label: "Voltage drop",
    icon: "trending-down",
    color: C.yellow,
    payload: {
      type: "warning",
      title: "Voltage drop: 198V on Circuit B",
      description: "Voltage fell below the 200V safe operating threshold.",
      threshold: 200,
      value: 198,
    },
  },
  {
    key: "restored",
    label: "Power restored",
    icon: "flash",
    color: C.accent,
    payload: {
      type: "info",
      title: "Power restored",
      description: "Mains power is back online. All monitored circuits are nominal.",
    },
  },
  {
    key: "report",
    label: "Daily report ready",
    icon: "document-text",
    color: C.blue,
    payload: {
      type: "info",
      title: "Daily energy report ready",
      description: "You used 18.7 kWh today — 8% less than yesterday.",
    },
  },
];

export default function DemoFab() {
  const [open, setOpen] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [demoModal, setDemoModal] = useState<AlertPayload | null>(null);
  const [countdown, setCountdown] = useState(3);
  const [powerOff, setPowerOff] = useState(false);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!demoModal || demoModal.type === "info" || powerOff) return;
    if (countdown <= 0) {
      // Countdown expiring performs the same real shutdown as TURN OFF NOW.
      setPowerOff(true);
      void requestMasterShutdown();
      return;
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [demoModal, countdown, powerOff]);

  function setOpenAnimated(next: boolean) {
    setOpen(next);
    Animated.timing(anim, {
      toValue: next ? 1 : 0,
      duration: next ? 200 : 160,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }

  async function trigger(preset: Preset) {
    setOpenAnimated(false);
    setDemoModal(preset.payload);
    setCountdown(3);
    setPowerOff(false);
    setBusyKey(preset.key);
    try {
      await api.post<ApiAlert>("/alerts", preset.payload);
      emitAlertsChanged();
    } catch {
      // modal already visible; silently ignore API failure
    } finally {
      setBusyKey(null);
    }
  }

  function closeDemoModal() {
    setDemoModal(null);
  }

  function handleDemoPowerOff() {
    setPowerOff(true);
    // Lab demo is real: command the relay off through the backend so the
    // physical load actually loses power.
    void requestMasterShutdown();
    setTimeout(() => setDemoModal(null), 1500);
  }

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <AnomalyModal
        alert={demoModal}
        countdown={countdown}
        powerOff={powerOff}
        onPowerOff={handleDemoPowerOff}
        onSkip={closeDemoModal}
      />

      {open && <Pressable style={styles.backdrop} onPress={() => setOpenAnimated(false)} />}

      <View style={styles.wrap} pointerEvents="box-none">
        {open && (
          <Animated.View
            style={[
              styles.actions,
              {
                opacity: anim,
                transform: [
                  {
                    translateY: anim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [20, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            {PRESETS.map((preset) => (
              <View key={preset.key} style={styles.actionRow}>
                <View style={styles.actionLabelWrap}>
                  <Text style={styles.actionLabel}>{preset.label}</Text>
                </View>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: preset.color }]}
                  onPress={() => trigger(preset)}
                  disabled={busyKey !== null}
                  activeOpacity={0.85}
                >
                  {busyKey === preset.key ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Ionicons name={preset.icon} size={20} color="#fff" />
                  )}
                </TouchableOpacity>
              </View>
            ))}
          </Animated.View>
        )}

        <TouchableOpacity
          style={styles.fab}
          onPress={() => setOpenAnimated(!open)}
          activeOpacity={0.85}
          accessibilityLabel="Demo alert simulator"
        >
          <Ionicons name={open ? "close" : "flask"} size={26} color={C.bg} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  wrap: {
    position: "absolute",
    right: 20,
    bottom: Platform.OS === "ios" ? 100 : 84,
    alignItems: "flex-end",
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: C.accent,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 8,
  },
  actions: {
    alignItems: "flex-end",
    marginBottom: 14,
    gap: 12,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  actionLabelWrap: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  actionLabel: {
    color: C.text,
    fontSize: 13,
    fontWeight: "600",
  },
  actionBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 5,
  },
});

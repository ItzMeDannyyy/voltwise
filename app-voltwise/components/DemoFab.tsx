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
import { useDemoData } from "../context/DemoDataContext";
import { useTheme } from "../context/ThemeContext";
import { useThemedStyles } from "./themed";
import type { ThemeColors } from "../constants/theme";

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

function getPresets(colors: ThemeColors): Preset[] {
  // Preset events that exercise every branch of the alert system.
  return [
    {
      key: "anomaly",
      label: "Appliance power anomaly",
      icon: "pulse",
      color: colors.red,
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
      color: colors.red,
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
      color: colors.yellow,
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
      color: colors.yellow,
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
      color: colors.accent,
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
      color: "#3b82f6",
      payload: {
        type: "info",
        title: "Daily energy report ready",
        description: "You used 18.7 kWh today — 8% less than yesterday.",
      },
    },
  ];
}

export default function DemoFab() {
  const { colors } = useTheme();
  const { demoData, toggleDemoData } = useDemoData();
  const styles = useThemedStyles(createStyles);
  const PRESETS = getPresets(colors);
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
            {/* Sample data sits above the alert presets and behaves
                differently: it is a switch, not a one-shot event, so it stays
                lit while it is on and the menu closes to reveal the chip. */}
            <View style={styles.actionRow}>
              <View
                style={[
                  styles.actionLabelWrap,
                  demoData && { borderColor: colors.yellow },
                ]}
              >
                <Text style={styles.actionLabel}>
                  {demoData ? "Sample data: on — tap to hide" : "Show sample data"}
                </Text>
              </View>
              <TouchableOpacity
                style={[
                  styles.actionBtn,
                  { backgroundColor: demoData ? colors.yellow : colors.sub },
                ]}
                onPress={() => {
                  toggleDemoData();
                  setOpenAnimated(false);
                }}
                activeOpacity={0.85}
                accessibilityRole="switch"
                accessibilityLabel="Show sample data"
                accessibilityState={{ checked: demoData }}
              >
                <Ionicons
                  name={demoData ? "albums" : "albums-outline"}
                  size={20}
                  color={colors.white}
                />
              </TouchableOpacity>
            </View>

            <View style={styles.actionDivider} />

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
                    <ActivityIndicator color={colors.white} size="small" />
                  ) : (
                    <Ionicons name={preset.icon} size={20} color={colors.white} />
                  )}
                </TouchableOpacity>
              </View>
            ))}
          </Animated.View>
        )}

        {/* Standing reminder that the three data screens are showing the
            static sample set, not the meter. Without it a demo left switched on
            is indistinguishable from real readings. */}
        {demoData && !open && (
          <View style={styles.demoChip}>
            <Ionicons name="albums" size={12} color={colors.bg} />
            <Text style={styles.demoChipText}>SAMPLE DATA</Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.fab, demoData && { backgroundColor: colors.yellow }]}
          onPress={() => setOpenAnimated(!open)}
          activeOpacity={0.85}
          accessibilityLabel="Demo alert simulator"
        >
          <Ionicons name={open ? "close" : "flask"} size={26} color={colors.bg} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors, fontScale: number) {
  return StyleSheet.create({
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: colors.overlay,
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
      backgroundColor: colors.accent,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: colors.shadow,
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
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    actionLabel: {
      color: colors.text,
      fontSize: 13 * fontScale,
      fontWeight: "600",
    },
    actionDivider: {
      alignSelf: "stretch",
      height: 1,
      backgroundColor: colors.border,
      marginVertical: 2,
    },
    demoChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      backgroundColor: colors.yellow,
      borderRadius: 10,
      paddingHorizontal: 8,
      paddingVertical: 4,
      marginBottom: 8,
    },
    demoChipText: {
      color: colors.bg,
      fontSize: 11 * fontScale,
      fontWeight: "800",
      letterSpacing: 0.6,
    },
    actionBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.3,
      shadowRadius: 5,
      elevation: 5,
    },
  });
}

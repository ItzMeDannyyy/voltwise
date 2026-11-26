import { useEffect, useRef } from "react";
import { Modal, View, Text, Pressable, StyleSheet } from "react-native";
import { createAudioPlayer } from "expo-audio";
import * as Haptics from "expo-haptics";
import {
  AlertCircle,
  AlertTriangle,
  Info,
  Power,
} from "./LucideIcons";
import { useNotifications } from "../context/NotificationContext";
import { useTheme } from "../context/ThemeContext";
import { useThemedStyles } from "./themed";
import type { ThemeColors } from "../constants/theme";

export interface ModalAlertData {
  type: "critical" | "warning" | "info";
  title: string;
  description: string;
}

function severityColor(type: ModalAlertData["type"], colors: ThemeColors): string {
  switch (type) {
    case "critical": return colors.red;
    case "warning":  return colors.yellow;
    case "info":     return colors.accent;
  }
}

function typeLabel(type: ModalAlertData["type"]): string {
  switch (type) {
    case "critical": return "Critical fault · Auto relay trip";
    case "warning":  return "Electrical warning";
    case "info":     return "System notice";
  }
}

function SeverityGlyph({
  type,
  color,
  size,
}: {
  type: ModalAlertData["type"];
  color: string;
  size: number;
}) {
  if (type === "critical") return <AlertCircle size={size} color={color} strokeWidth={2.1} />;
  if (type === "warning") return <AlertTriangle size={size} color={color} strokeWidth={2.1} />;
  return <Info size={size} color={color} strokeWidth={2.1} />;
}

async function playSound(src: "beep" | "poweroff") {
  try {
    const file =
      src === "beep"
        ? require("../assets/sounds/beep.wav")
        : require("../assets/sounds/poweroff.wav");
    const player = createAudioPlayer(file);
    player.play();
  } catch {
    // audio unavailable — fail silently
  }
}

export function AnomalyModal({
  alert,
  countdown,
  powerOff,
  onPowerOff,
  onSkip,
}: {
  alert: ModalAlertData | null;
  countdown: number;
  powerOff: boolean;
  onPowerOff: () => void;
  onSkip: () => void;
}) {
  const { colors, fontScale } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { prefs } = useNotifications();
  const prevTitle     = useRef<string | null>(null);
  const prevCountdown = useRef(countdown);

  // Play ShakeAlert beep on modal open and on each countdown tick.
  useEffect(() => {
    if (!alert || alert.type === "info" || powerOff) return;

    const newAlert     = prevTitle.current !== alert.title;
    const newCountdown = prevCountdown.current !== countdown;

    if (newAlert || newCountdown) {
      if (prefs.sound) playSound("beep");
      if (prefs.haptics && newAlert) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      }
    }

    prevTitle.current     = alert.title;
    prevCountdown.current = countdown;
  }, [alert, countdown, powerOff, prefs.sound, prefs.haptics]);

  // Clear refs when modal closes.
  useEffect(() => {
    if (!alert) {
      prevTitle.current     = null;
      prevCountdown.current = 3;
    }
  }, [alert]);

  // Descending power-off tone.
  useEffect(() => {
    if (powerOff && prefs.sound) playSound("poweroff");
  }, [powerOff, prefs.sound]);

  if (!alert) return null;
  const color = severityColor(alert.type, colors);
  const showCountdown = alert.type === "critical" && countdown > 0 && !powerOff;
  const isCritical = alert.type === "critical";

  return (
    <Modal transparent animationType="fade" visible statusBarTranslucent>
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* Top badge row */}
          <View style={styles.headerRow}>
            <View
              style={[
                styles.iconTile,
                {
                  backgroundColor: color + "14",
                  borderColor: color + "40",
                },
              ]}
            >
              <SeverityGlyph type={alert.type} color={color} size={22 * fontScale} />
            </View>
            <View style={styles.headerMeta}>
              <Text style={[styles.typeLabel, { color }]}>{typeLabel(alert.type)}</Text>
              <Text style={styles.title}>{alert.title}</Text>
            </View>
          </View>

          <Text style={styles.desc}>{alert.description}</Text>

          {showCountdown && (
            <View style={styles.countdownPanel}>
              <Text style={styles.countdownLabel}>Master relay trips in</Text>
              <Text style={styles.countdownNum}>{countdown}s</Text>
            </View>
          )}

          {powerOff && (
            <View style={styles.countdownPanel}>
              <Text style={styles.shuttingDown}>Sending master relay cutoff…</Text>
            </View>
          )}

          {isCritical && (
            <Pressable
              style={({ pressed }) => [
                styles.powerBtn,
                pressed && !powerOff && styles.btnPressed,
                powerOff && styles.powerBtnDimmed,
              ]}
              onPress={onPowerOff}
              disabled={powerOff}
              accessibilityRole="button"
              accessibilityLabel="Cut master power now"
            >
              <Power size={18 * fontScale} color={colors.white} strokeWidth={2.2} />
              <Text style={styles.powerBtnText}>Cut master power now</Text>
            </Pressable>
          )}

          <Pressable
            style={({ pressed }) => [
              styles.skipBtn,
              pressed && styles.btnPressed,
            ]}
            onPress={onSkip}
            accessibilityRole="button"
          >
            <Text style={styles.skipText}>
              {showCountdown ? "Keep circuits energized" : "Close notice"}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors: ThemeColors, fontScale: number) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: colors.overlayStrong,
      justifyContent: "center",
      alignItems: "center",
      padding: 24,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 20,
      width: "100%",
      maxWidth: 400,
      borderWidth: 1,
      borderColor: colors.border,
    },
    headerRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 14,
      marginBottom: 12,
    },
    iconTile: {
      width: 44,
      height: 44,
      borderRadius: 10,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    headerMeta: {
      flex: 1,
    },
    typeLabel: {
      fontSize: 12.5 * fontScale,
      fontWeight: "600",
      marginBottom: 3,
    },
    title: {
      color: colors.text,
      fontSize: 17 * fontScale,
      fontWeight: "600",
      letterSpacing: -0.2,
      lineHeight: 23 * fontScale,
    },
    desc: {
      color: colors.sub,
      fontSize: 14 * fontScale,
      lineHeight: 20 * fontScale,
      marginBottom: 16,
    },
    countdownPanel: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: colors.red + "12",
      borderWidth: 1,
      borderColor: colors.red + "38",
      borderRadius: 8,
      paddingHorizontal: 14,
      paddingVertical: 10,
      marginBottom: 16,
    },
    countdownLabel: {
      color: colors.text,
      fontSize: 13.5 * fontScale,
      fontWeight: "500",
    },
    countdownNum: {
      color: colors.red,
      fontSize: 22 * fontScale,
      fontWeight: "600",
    },
    shuttingDown: {
      color: colors.red,
      fontSize: 14 * fontScale,
      fontWeight: "600",
    },
    powerBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      backgroundColor: colors.red,
      borderRadius: 8,
      height: 48,
      width: "100%",
      marginBottom: 10,
    },
    powerBtnDimmed: {
      opacity: 0.45,
    },
    powerBtnText: {
      color: colors.white,
      fontSize: 15.5 * fontScale,
      fontWeight: "600",
    },
    skipBtn: {
      height: 44,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bg,
      alignItems: "center",
      justifyContent: "center",
    },
    skipText: {
      color: colors.text,
      fontSize: 14.5 * fontScale,
      fontWeight: "500",
    },
    btnPressed: {
      opacity: 0.85,
      transform: [{ scale: 0.99 }],
    },
  });
}

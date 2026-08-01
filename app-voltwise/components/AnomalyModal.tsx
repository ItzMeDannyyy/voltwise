import { useEffect, useRef } from "react";
import { Modal, View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Audio } from "expo-av";
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

function severityIcon(type: ModalAlertData["type"]): keyof typeof Ionicons.glyphMap {
  switch (type) {
    case "critical": return "alert-circle";
    case "warning":  return "warning";
    case "info":     return "information-circle";
  }
}

function typeLabel(type: ModalAlertData["type"]): string {
  switch (type) {
    case "critical": return "ANOMALY DETECTED";
    case "warning":  return "WARNING DETECTED";
    case "info":     return "ALERT";
  }
}

async function playSound(src: "beep" | "poweroff") {
  try {
    await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
    const file =
      src === "beep"
        ? require("../assets/sounds/beep.wav")
        : require("../assets/sounds/poweroff.wav");
    const { sound } = await Audio.Sound.createAsync(file);
    await sound.playAsync();
    sound.setOnPlaybackStatusUpdate((s) => {
      if (s.isLoaded && s.didJustFinish) sound.unloadAsync();
    });
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
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const prevTitle     = useRef<string | null>(null);
  const prevCountdown = useRef(countdown);

  // Play ShakeAlert beep on modal open and on each countdown tick.
  useEffect(() => {
    if (!alert || alert.type === "info" || powerOff) return;

    const newAlert     = prevTitle.current !== alert.title;
    const newCountdown = prevCountdown.current !== countdown;

    if (newAlert || newCountdown) playSound("beep");

    prevTitle.current     = alert.title;
    prevCountdown.current = countdown;
  }, [alert, countdown, powerOff]);

  // Clear refs when modal closes.
  useEffect(() => {
    if (!alert) {
      prevTitle.current     = null;
      prevCountdown.current = 3;
    }
  }, [alert]);

  // Descending power-off tone.
  useEffect(() => {
    if (powerOff) playSound("poweroff");
  }, [powerOff]);

  if (!alert) return null;
  const color = severityColor(alert.type, colors);
  const icon  = severityIcon(alert.type);
  const showCountdown = alert.type !== "info" && !powerOff;

  return (
    <Modal transparent animationType="fade" visible statusBarTranslucent>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={[styles.iconCircle, { backgroundColor: color + "26" }]}>
            <Ionicons name={icon} size={36} color={color} />
          </View>

          <Text style={[styles.typeLabel, { color }]}>{typeLabel(alert.type)}</Text>

          <Text style={styles.title}>{alert.title}</Text>
          <Text style={styles.desc}>{alert.description}</Text>

          {showCountdown && (
            <View style={styles.countdownRow}>
              <Text style={styles.countdownLabel}>Power shutting down in</Text>
              <Text style={styles.countdownNum}>{countdown}</Text>
              <Text style={styles.countdownLabel}>seconds</Text>
            </View>
          )}

          {powerOff && (
            <Text style={styles.shuttingDown}>Shutting down…</Text>
          )}

          <TouchableOpacity
            style={[styles.powerBtn, powerOff && styles.powerBtnDimmed]}
            onPress={onPowerOff}
            activeOpacity={0.8}
            disabled={powerOff}
          >
            <Ionicons name="power" size={28} color={colors.white} />
            <Text style={styles.powerBtnText}>TURN OFF NOW</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.skipBtn} onPress={onSkip}>
            <Text style={styles.skipText}>Skip Alert</Text>
          </TouchableOpacity>
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
      borderRadius: 20,
      padding: 28,
      width: "100%",
      alignItems: "center",
      borderWidth: 1,
      borderColor: colors.border,
    },
    iconCircle: {
      width: 72,
      height: 72,
      borderRadius: 36,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 14,
    },
    typeLabel: {
      fontSize: 13 * fontScale,
      fontWeight: "800",
      letterSpacing: 1.5,
      marginBottom: 10,
    },
    title: {
      color: colors.text,
      fontSize: 16 * fontScale,
      fontWeight: "700",
      textAlign: "center",
      marginBottom: 6,
      lineHeight: 22 * fontScale,
    },
    desc: {
      color: colors.sub,
      fontSize: 13 * fontScale,
      textAlign: "center",
      lineHeight: 19 * fontScale,
      marginBottom: 20,
    },
    countdownRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 20,
    },
    countdownLabel: {
      color: colors.sub,
      fontSize: 13 * fontScale,
    },
    countdownNum: {
      color: colors.red,
      fontSize: 36 * fontScale,
      fontWeight: "800",
      lineHeight: 40 * fontScale,
      minWidth: 36,
      textAlign: "center",
    },
    shuttingDown: {
      color: colors.red,
      fontSize: 15 * fontScale,
      fontWeight: "700",
      marginBottom: 20,
      letterSpacing: 0.5,
    },
    powerBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      backgroundColor: colors.red,
      borderRadius: 14,
      paddingVertical: 18,
      width: "100%",
      marginBottom: 14,
      shadowColor: colors.red,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.45,
      shadowRadius: 8,
      elevation: 6,
    },
    powerBtnDimmed: {
      opacity: 0.45,
    },
    powerBtnText: {
      color: colors.white,
      fontSize: 17 * fontScale,
      fontWeight: "800",
      letterSpacing: 1,
    },
    skipBtn: {
      paddingVertical: 10,
    },
    skipText: {
      color: colors.sub,
      fontSize: 14 * fontScale,
      fontWeight: "500",
    },
  });
}

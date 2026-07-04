import { useEffect, useRef } from "react";
import { Modal, View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Audio } from "expo-av";

const C = {
  bg: "#1a1f2e",
  card: "#242b3d",
  accent: "#00d4aa",
  text: "#ffffff",
  sub: "#9ca3af",
  border: "#2d3448",
  yellow: "#f59e0b",
  red: "#ef4444",
};

export interface ModalAlertData {
  type: "critical" | "warning" | "info";
  title: string;
  description: string;
}

function severityColor(type: ModalAlertData["type"]): string {
  switch (type) {
    case "critical": return C.red;
    case "warning":  return C.yellow;
    case "info":     return C.accent;
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
  const color = severityColor(alert.type);
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
            <Ionicons name="power" size={28} color="#fff" />
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

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    backgroundColor: C.card,
    borderRadius: 20,
    padding: 28,
    width: "100%",
    alignItems: "center",
    borderWidth: 1,
    borderColor: C.border,
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
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  title: {
    color: C.text,
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 6,
    lineHeight: 22,
  },
  desc: {
    color: C.sub,
    fontSize: 13,
    textAlign: "center",
    lineHeight: 19,
    marginBottom: 20,
  },
  countdownRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 20,
  },
  countdownLabel: {
    color: C.sub,
    fontSize: 13,
  },
  countdownNum: {
    color: C.red,
    fontSize: 36,
    fontWeight: "800",
    lineHeight: 40,
    minWidth: 36,
    textAlign: "center",
  },
  shuttingDown: {
    color: C.red,
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 20,
    letterSpacing: 0.5,
  },
  powerBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: C.red,
    borderRadius: 14,
    paddingVertical: 18,
    width: "100%",
    marginBottom: 14,
    shadowColor: C.red,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 8,
    elevation: 6,
  },
  powerBtnDimmed: {
    opacity: 0.45,
  },
  powerBtnText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: 1,
  },
  skipBtn: {
    paddingVertical: 10,
  },
  skipText: {
    color: C.sub,
    fontSize: 14,
    fontWeight: "500",
  },
});

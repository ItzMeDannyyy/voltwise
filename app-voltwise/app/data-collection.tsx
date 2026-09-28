import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Platform,
  Animated,
  Switch,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import ConfirmModal from "../components/ConfirmModal";
import { ScreenContainer, useThemedStyles } from "../components/themed";
import { useMqtt } from "../context/MqttContext";
import { usePowerControl } from "../context/PowerControlContext";
import { useTheme } from "../context/ThemeContext";
import { useUnits } from "../context/UnitsContext";
import {
  startDataCollection,
  stopDataCollection,
  resetDatabaseReadings,
  setSafetyCutoff,
  setCountdownTimer,
} from "../lib/api";
import { saveExport, type SaveResult } from "../lib/export-file";
import type { ThemeColors } from "../constants/theme";

interface TelemetryRecord {
  timestamp: string;
  appliance: string;
  voltage: number;
  current: number;
  watts: number;
  kwh: number;
  frequency: number;
  powerFactor: number;
}

interface CompletedSessionData {
  applianceName: string;
  durationSeconds: number;
  sampleCount: number;
  avgWatts: number;
  maxWatts: number;
  totalKwh: number;
  csvContent: string;
  filename: string;
  exportResult: SaveResult | null;
}

const PRESET_APPLIANCES = [
  "Electric Fan",
  "Refrigerator",
  "Rice Cooker",
  "Smart TV",
  "Air Conditioner",
  "Microwave",
  "Washing Machine",
  "Water Kettle",
  "Laptop / PC",
  "Electric Iron",
];

const TARGET_LINES: { id: "all" | "low" | "high"; label: string; sub: string }[] = [
  { id: "all", label: "All Lines", sub: "Pins 25 & 26" },
  { id: "low", label: "Low Load (10A)", sub: "Pin 25" },
  { id: "high", label: "High Load (30A)", sub: "Pin 26" },
];

function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export default function DataCollectionScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { formatPower, formatEnergy } = useUnits();

  // Hardware telemetry & connection
  const { telemetry, relayState, safetyState, countdownState } = useMqtt();
  const {
    masterOn,
    highOn,
    lowOn,
    pending: powerPending,
    toggleMaster,
    toggleHighLine,
    toggleLowLine,
  } = usePowerControl();

  // Safety Cutoff quick toggle
  const [safetyLocal, setSafetyLocal] = useState<boolean | null>(null);
  const [safetyToggling, setSafetyToggling] = useState(false);

  useEffect(() => {
    if (safetyState === null) return;
    setSafetyLocal(null);
    setSafetyToggling(false);
  }, [safetyState]);

  const effectiveSafetyEnabled =
    safetyLocal !== null ? safetyLocal : safetyState?.enabled ?? true;
  const effectiveSafetyWatts = safetyState?.thresholdWatts ?? 3000;

  const handleToggleSafety = async (next: boolean) => {
    setSafetyLocal(next);
    setSafetyToggling(true);
    try {
      await setSafetyCutoff(next, effectiveSafetyWatts);
    } catch (err) {
      setSafetyLocal(null);
      setNoticeMessage(err instanceof Error ? err.message : "Failed to toggle safety cutoff.");
    } finally {
      setSafetyToggling(false);
    }
  };

  // Auto-Shutdown Countdown quick toggle
  const [countdownLocal, setCountdownLocal] = useState<boolean | null>(null);
  const [countdownToggling, setCountdownToggling] = useState(false);

  useEffect(() => {
    if (countdownState === null) return;
    setCountdownLocal(null);
    setCountdownToggling(false);
  }, [countdownState]);

  const effectiveCountdownEnabled =
    countdownLocal !== null ? countdownLocal : countdownState?.enabled ?? false;
  const effectiveCountdownSeconds = countdownState?.seconds ?? 1800;

  const handleToggleCountdown = async (next: boolean) => {
    setCountdownLocal(next);
    setCountdownToggling(true);
    try {
      await setCountdownTimer(next, effectiveCountdownSeconds);
    } catch (err) {
      setCountdownLocal(null);
      setNoticeMessage(err instanceof Error ? err.message : "Failed to toggle countdown timer.");
    } finally {
      setCountdownToggling(false);
    }
  };

  // Setup inputs
  const [applianceName, setApplianceName] = useState("");
  const [targetLine, setTargetLine] = useState<"all" | "low" | "high">("all");
  const [nameError, setNameError] = useState<string | null>(null);

  // Collection session state
  const [isCollecting, setIsCollecting] = useState(false);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [bufferedReadings, setBufferedReadings] = useState<TelemetryRecord[]>([]);

  // Confirmation modals
  const [confirmStartModal, setConfirmStartModal] = useState(false);
  const [confirmResetOnlyModal, setConfirmResetOnlyModal] = useState(false);
  const [resettingDb, setResettingDb] = useState(false);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);

  // Completed session details
  const [completedSession, setCompletedSession] = useState<CompletedSessionData | null>(null);
  const [resharing, setResharing] = useState(false);

  // Pulsing animation for recording badge
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Stale guard for active collection variables
  const isCollectingRef = useRef(isCollecting);
  isCollectingRef.current = isCollecting;
  const applianceNameRef = useRef(applianceName);
  applianceNameRef.current = applianceName;

  // Animate recording dot
  useEffect(() => {
    if (!isCollecting) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.3,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [isCollecting, pulseAnim]);

  // Stopwatch timer
  useEffect(() => {
    if (!isCollecting) return;
    const timer = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [isCollecting]);

  // Buffer incoming MQTT telemetry when collecting
  useEffect(() => {
    if (!isCollecting || !telemetry) return;

    const record: TelemetryRecord = {
      timestamp: new Date().toISOString(),
      appliance: applianceNameRef.current.trim() || "Unspecified Appliance",
      voltage: typeof telemetry.voltage === "number" ? telemetry.voltage : 0,
      current: typeof telemetry.current === "number" ? telemetry.current : 0,
      watts: typeof telemetry.watts === "number" ? telemetry.watts : 0,
      kwh: typeof telemetry.kwh === "number" ? telemetry.kwh : 0,
      frequency: typeof telemetry.frequency === "number" ? telemetry.frequency : 0,
      powerFactor: typeof telemetry.powerFactor === "number" ? telemetry.powerFactor : 0,
    };

    setBufferedReadings((prev) => [...prev, record]);
  }, [telemetry, isCollecting]);

  // Quick preset selection
  const handleSelectPreset = (name: string) => {
    setApplianceName(name);
    setNameError(null);
  };

  // Validation before starting
  const handlePressStart = () => {
    const trimmed = applianceName.trim();
    if (!trimmed) {
      setNameError("Please enter an appliance name before collecting data.");
      return;
    }
    setNameError(null);
    setConfirmStartModal(true);
  };

  // Execute Start Collection: Wipes DB, sets active appliance, turns ON relay
  const handleConfirmStart = async () => {
    setConfirmStartModal(false);
    setStarting(true);
    setNoticeMessage(null);
    setCompletedSession(null);
    setBufferedReadings([]);
    setElapsedSeconds(0);

    try {
      if (Platform.OS !== "web") {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      // Automatically ensure auto-shutdown timer is disabled for the data collection session
      try {
        await setCountdownTimer(false);
      } catch {
        // Non-fatal if offline
      }

      const res = await startDataCollection({
        applianceName: applianceName.trim(),
        line: targetLine,
        clearReadings: true,
      });

      setIsCollecting(true);
      setNoticeMessage(
        `Database purged (${res.clearedReadingsCount} records). Relay turned ON for "${res.session.applianceName}".`
      );
    } catch (error) {
      setNoticeMessage(
        error instanceof Error ? error.message : "Failed to start data collection session."
      );
    } finally {
      setStarting(false);
    }
  };

  // Compile CSV from records
  const generateCsv = (records: TelemetryRecord[]): string => {
    const headers = [
      "timestamp",
      "appliance",
      "voltage_v",
      "current_a",
      "power_watts",
      "energy_kwh",
      "frequency_hz",
      "power_factor",
    ];

    const lines = records.map((r) =>
      [
        r.timestamp,
        `"${r.appliance.replace(/"/g, '""')}"`,
        r.voltage.toFixed(2),
        r.current.toFixed(3),
        r.watts.toFixed(2),
        r.kwh.toFixed(4),
        r.frequency.toFixed(1),
        r.powerFactor.toFixed(3),
      ].join(",")
    );

    return [headers.join(","), ...lines].join("\r\n");
  };

  // Execute Stop Collection: Turns OFF relay, stops session, saves CSV
  const handleStopCollection = async () => {
    setStopping(true);
    try {
      if (Platform.OS !== "web") {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }

      await stopDataCollection(targetLine);

      const records = [...bufferedReadings];
      const count = records.length;
      const totalWatts = records.reduce((sum, r) => sum + r.watts, 0);
      const avgWatts = count > 0 ? totalWatts / count : 0;
      const maxWatts = records.reduce((max, r) => Math.max(max, r.watts), 0);
      const finalKwh = records.length > 0 ? records[records.length - 1].kwh : 0;
      const startKwh = records.length > 0 ? records[0].kwh : 0;
      const consumedKwh = Math.max(0, finalKwh - startKwh);

      const csvString = generateCsv(records);
      const cleanName = applianceName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_") || "appliance";
      const timestampStr = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const filename = `voltwise_${cleanName}_${timestampStr}.csv`;

      // Save & export CSV immediately
      let saveRes: SaveResult | null = null;
      try {
        saveRes = await saveExport(filename, csvString, "csv");
      } catch (err) {
        console.warn("Export save error:", err);
      }

      setCompletedSession({
        applianceName: applianceName.trim(),
        durationSeconds: elapsedSeconds,
        sampleCount: count,
        avgWatts,
        maxWatts,
        totalKwh: consumedKwh,
        csvContent: csvString,
        filename,
        exportResult: saveRes,
      });

      setIsCollecting(false);
      setNoticeMessage(`Data collection stopped. Relay switched OFF. CSV ready.`);
    } catch (error) {
      setNoticeMessage(error instanceof Error ? error.message : "Failed to stop data collection.");
    } finally {
      setStopping(false);
    }
  };

  // Reshare the CSV
  const handleReshare = async () => {
    if (!completedSession) return;
    setResharing(true);
    try {
      const res = await saveExport(
        completedSession.filename,
        completedSession.csvContent,
        "csv"
      );
      setCompletedSession((prev) => (prev ? { ...prev, exportResult: res } : null));
    } catch (err) {
      console.warn("Reshare error:", err);
    } finally {
      setResharing(false);
    }
  };

  // Standalone Database Reset
  const handleConfirmResetOnly = async () => {
    setConfirmResetOnlyModal(false);
    setResettingDb(true);
    try {
      const res = await resetDatabaseReadings();
      setNoticeMessage(`Database cleared: removed ${res.count} existing energy reading records.`);
    } catch (error) {
      setNoticeMessage(error instanceof Error ? error.message : "Failed to purge database readings.");
    } finally {
      setResettingDb(false);
    }
  };

  // Live telemetry metrics during recording or idle
  const currentWatts = telemetry?.watts ?? 0;
  const currentAmps = telemetry?.current ?? 0;
  const currentVolts = telemetry?.voltage ?? 0;
  const currentPf = telemetry?.powerFactor ?? 0;
  const currentKwh = telemetry?.kwh ?? 0;
  const currentHz = telemetry?.frequency ?? 0;

  return (
    <ScreenContainer edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* ============================================================ */}
        {/* TOP PANEL: MANUAL RELAY CONTROL                             */}
        {/* ============================================================ */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <View style={styles.sectionTitleWithIcon}>
              <View
                style={[
                  styles.headerIconCircle,
                  { backgroundColor: (masterOn ? colors.green : colors.red) + "20" },
                ]}
              >
                <Ionicons
                  name="power"
                  size={18}
                  color={masterOn ? colors.green : colors.red}
                />
              </View>
              <Text style={styles.sectionTitle}>Relay Control Panel</Text>
            </View>
            <View
              style={[
                styles.badge,
                { backgroundColor: (masterOn ? colors.green : colors.red) + "22" },
              ]}
            >
              <Text
                style={[
                  styles.badgeText,
                  { color: masterOn ? colors.green : colors.red },
                ]}
              >
                {masterOn ? "ALL ENERGIZED (ON)" : "ALL CUT OFF (OFF)"}
              </Text>
            </View>
          </View>

          <View style={styles.card}>
            {/* Status overview */}
            <View style={styles.relayStatusRow}>
              <View style={styles.relayStatusLeft}>
                <Text style={styles.relayStatusLabel}>Power Feeds</Text>
                <View style={styles.relayLinesRow}>
                  <View
                    style={[
                      styles.lineIndicator,
                      {
                        backgroundColor: lowOn ? colors.green + "25" : colors.surface,
                        borderColor: lowOn ? colors.green : colors.border,
                      },
                    ]}
                  >
                    <Ionicons
                      name={lowOn ? "flash" : "flash-off"}
                      size={13}
                      color={lowOn ? colors.green : colors.sub}
                    />
                    <Text
                      style={[
                        styles.lineIndicatorText,
                        { color: lowOn ? colors.green : colors.sub },
                      ]}
                    >
                      Low Line (Pin 25, 10A): {lowOn ? "ON" : "OFF"}
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.lineIndicator,
                      {
                        backgroundColor: highOn ? colors.green + "25" : colors.surface,
                        borderColor: highOn ? colors.green : colors.border,
                      },
                    ]}
                  >
                    <Ionicons
                      name={highOn ? "flash" : "flash-off"}
                      size={13}
                      color={highOn ? colors.green : colors.sub}
                    />
                    <Text
                      style={[
                        styles.lineIndicatorText,
                        { color: highOn ? colors.green : colors.sub },
                      ]}
                    >
                      High Line (Pin 26, 30A): {highOn ? "ON" : "OFF"}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Master toggle button */}
              <Pressable
                style={[
                  styles.masterToggleButton,
                  {
                    backgroundColor: masterOn ? colors.red : colors.green,
                    opacity: powerPending ? 0.6 : 1,
                  },
                ]}
                onPress={() => toggleMaster(!masterOn)}
                disabled={powerPending}
              >
                {powerPending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons
                      name={masterOn ? "power" : "flash"}
                      size={18}
                      color="#fff"
                      style={{ marginRight: 6 }}
                    />
                    <Text style={styles.masterToggleText}>
                      {masterOn ? "TURN OFF" : "TURN ON"}
                    </Text>
                  </>
                )}
              </Pressable>
            </View>

            {/* Individual Line Controls */}
            <View style={styles.individualControlsRow}>
              <Pressable
                style={[
                  styles.lineSubButton,
                  lowOn ? styles.lineSubButtonActive : styles.lineSubButtonInactive,
                ]}
                onPress={() => toggleLowLine(!lowOn)}
                disabled={powerPending}
              >
                <Ionicons
                  name={lowOn ? "radio-button-on" : "radio-button-off"}
                  size={15}
                  color={lowOn ? colors.green : colors.sub}
                />
                <Text
                  style={[
                    styles.lineSubButtonText,
                    { color: lowOn ? colors.green : colors.text },
                  ]}
                >
                  Low Line: {lowOn ? "Turn OFF" : "Turn ON"}
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.lineSubButton,
                  highOn ? styles.lineSubButtonActive : styles.lineSubButtonInactive,
                ]}
                onPress={() => toggleHighLine(!highOn)}
                disabled={powerPending}
              >
                <Ionicons
                  name={highOn ? "radio-button-on" : "radio-button-off"}
                  size={15}
                  color={highOn ? colors.green : colors.sub}
                />
                <Text
                  style={[
                    styles.lineSubButtonText,
                    { color: highOn ? colors.green : colors.text },
                  ]}
                >
                  High Line: {highOn ? "Turn OFF" : "Turn ON"}
                </Text>
              </Pressable>
            </View>

            {relayState?.reason && (
              <View style={styles.relayMetaRow}>
                <Ionicons name="information-circle-outline" size={13} color={colors.sub} />
                <Text style={styles.relayMetaText}>
                  Relay status origin: <Text style={{ fontWeight: "600" }}>{relayState.reason}</Text>
                  {relayState.reason === "countdown" && " (Safety Auto-Shutdown)"}
                  {relayState.reason === "overpower" && " (Overload Protection Cutoff)"}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Notices */}
        {noticeMessage && (
          <View style={styles.noticeCard}>
            <Ionicons name="notifications-outline" size={18} color={colors.accent} />
            <Text style={styles.noticeText}>{noticeMessage}</Text>
            <Pressable onPress={() => setNoticeMessage(null)}>
              <Ionicons name="close" size={16} color={colors.sub} />
            </Pressable>
          </View>
        )}

        {/* ============================================================ */}
        {/* ACTIVE RECORDING VIEW (WHEN COLLECTING)                      */}
        {/* ============================================================ */}
        {isCollecting ? (
          <View style={styles.section}>
            <View style={[styles.card, styles.recordingCard]}>
              {/* Recording status header */}
              <View style={styles.recordingHeader}>
                <View style={styles.recordingIndicatorRow}>
                  <Animated.View
                    style={[styles.recordingDot, { opacity: pulseAnim }]}
                  />
                  <Text style={styles.recordingTitle}>RECORDING TELEMETRY</Text>
                </View>
                <View style={styles.targetBadge}>
                  <Text style={styles.targetBadgeText}>
                    {targetLine.toUpperCase()} LINE
                  </Text>
                </View>
              </View>

              {/* Appliance Name Display */}
              <View style={styles.activeApplianceBanner}>
                <Ionicons name="pricetag-outline" size={16} color={colors.text} />
                <Text style={styles.activeApplianceText}>
                  Appliance: <Text style={{ fontWeight: "700" }}>{applianceName}</Text>
                </Text>
              </View>

              {/* Big Stopwatch Timer & Samples counter */}
              <View style={styles.timerSection}>
                <Text style={styles.timerDisplay}>{formatTime(elapsedSeconds)}</Text>
                <View style={styles.samplesCounterRow}>
                  <Ionicons name="layers-outline" size={14} color={colors.sub} />
                  <Text style={styles.samplesCounterText}>
                    {bufferedReadings.length} samples collected (polling ~2s)
                  </Text>
                </View>
              </View>

              {/* Live Metric Grid */}
              <View style={styles.metricsGrid}>
                <View style={styles.metricCell}>
                  <Text style={styles.metricCellLabel}>POWER</Text>
                  <Text style={[styles.metricCellValue, { color: colors.green }]}>
                    {formatPower(currentWatts)}
                  </Text>
                </View>
                <View style={styles.metricCell}>
                  <Text style={styles.metricCellLabel}>CURRENT</Text>
                  <Text style={styles.metricCellValue}>{currentAmps.toFixed(2)} A</Text>
                </View>
                <View style={styles.metricCell}>
                  <Text style={styles.metricCellLabel}>VOLTAGE</Text>
                  <Text style={styles.metricCellValue}>{currentVolts.toFixed(1)} V</Text>
                </View>
                <View style={styles.metricCell}>
                  <Text style={styles.metricCellLabel}>POWER FACTOR</Text>
                  <Text style={styles.metricCellValue}>{currentPf.toFixed(2)}</Text>
                </View>
                <View style={styles.metricCell}>
                  <Text style={styles.metricCellLabel}>FREQUENCY</Text>
                  <Text style={styles.metricCellValue}>{currentHz.toFixed(1)} Hz</Text>
                </View>
                <View style={styles.metricCell}>
                  <Text style={styles.metricCellLabel}>ENERGY</Text>
                  <Text style={styles.metricCellValue}>{formatEnergy(currentKwh, 3)}</Text>
                </View>
              </View>

              {/* Live Samples Preview (Last 3) */}
              {bufferedReadings.length > 0 && (
                <View style={styles.liveLogSection}>
                  <Text style={styles.liveLogTitle}>Recent Readings Log</Text>
                  {bufferedReadings.slice(-3).reverse().map((r, i) => (
                    <View key={i} style={styles.logRow}>
                      <Text style={styles.logTime}>
                        {r.timestamp.split("T")[1]?.slice(0, 8)}
                      </Text>
                      <Text style={styles.logWatts}>{r.watts.toFixed(1)} W</Text>
                      <Text style={styles.logAmps}>{r.current.toFixed(2)} A</Text>
                      <Text style={styles.logVolts}>{r.voltage.toFixed(1)} V</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Stop & Save Button */}
              <Pressable
                style={[
                  styles.stopButton,
                  { opacity: stopping ? 0.7 : 1 },
                ]}
                onPress={handleStopCollection}
                disabled={stopping}
              >
                {stopping ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="stop-circle" size={22} color="#fff" style={{ marginRight: 8 }} />
                    <Text style={styles.stopButtonText}>
                      STOP COLLECTING & SAVE CSV
                    </Text>
                  </>
                )}
              </Pressable>
            </View>
          </View>
        ) : (
          /* ============================================================ */
          /* APPLIANCE SETUP & GATHER DATA FORM (WHEN IDLE)              */
          /* ============================================================ */
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionTitleWithIcon}>
                <Ionicons name="flask-outline" size={20} color={colors.accent} />
                <Text style={styles.sectionTitle}>Appliance Data Gathering</Text>
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.formHint}>
                Enter the name of the appliance connected to the smart relay. Starting data
                collection will purge previous readings in the database, energize the relay, and
                log clean telemetry.
              </Text>

              {/* Appliance Name Input */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Appliance Name *</Text>
                <View
                  style={[
                    styles.inputContainer,
                    nameError ? { borderColor: colors.red } : {},
                  ]}
                >
                  <Ionicons name="hardware-chip-outline" size={18} color={colors.sub} />
                  <TextInput
                    style={styles.textInput}
                    placeholder="e.g. Electric Fan, Refrigerator, Rice Cooker"
                    placeholderTextColor={colors.sub}
                    value={applianceName}
                    onChangeText={(text) => {
                      setApplianceName(text);
                      if (nameError) setNameError(null);
                    }}
                    autoCapitalize="words"
                  />
                  {applianceName.length > 0 && (
                    <Pressable onPress={() => setApplianceName("")}>
                      <Ionicons name="close-circle" size={18} color={colors.sub} />
                    </Pressable>
                  )}
                </View>
                {nameError && <Text style={styles.errorText}>{nameError}</Text>}
              </View>

              {/* Quick Appliance Presets */}
              <View style={styles.presetsGroup}>
                <Text style={styles.presetsLabel}>Quick Presets:</Text>
                <View style={styles.chipsWrap}>
                  {PRESET_APPLIANCES.map((preset) => {
                    const isSelected = applianceName.toLowerCase() === preset.toLowerCase();
                    return (
                      <Pressable
                        key={preset}
                        style={[
                          styles.presetChip,
                          isSelected ? styles.presetChipSelected : {},
                        ]}
                        onPress={() => handleSelectPreset(preset)}
                      >
                        <Text
                          style={[
                            styles.presetChipText,
                            isSelected ? { color: "#fff", fontWeight: "600" } : {},
                          ]}
                        >
                          {preset}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* Line Selector */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Target Power Line</Text>
                <View style={styles.lineSelectorRow}>
                  {TARGET_LINES.map((l) => {
                    const selected = targetLine === l.id;
                    return (
                      <Pressable
                        key={l.id}
                        style={[
                          styles.lineChoiceCard,
                          selected ? styles.lineChoiceCardSelected : {},
                        ]}
                        onPress={() => setTargetLine(l.id)}
                      >
                        <Text
                          style={[
                            styles.lineChoiceLabel,
                            selected ? { color: colors.accent, fontWeight: "700" } : {},
                          ]}
                        >
                          {l.label}
                        </Text>
                        <Text style={styles.lineChoiceSub}>{l.sub}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* Overload Safety Cutoff Quick Toggle */}
              <View style={styles.inputGroup}>
                <View style={styles.safetyBox}>
                  <View style={{ flex: 1, paddingRight: 10 }}>
                    <View style={styles.safetyTitleRow}>
                      <Ionicons
                        name={effectiveSafetyEnabled ? "shield-checkmark" : "shield-outline"}
                        size={17}
                        color={effectiveSafetyEnabled ? colors.green : colors.amber}
                      />
                      <Text style={styles.safetyBoxTitle}>Hardware Safety Cutoff</Text>
                      <View
                        style={[
                          styles.safetySmallBadge,
                          {
                            backgroundColor:
                              (effectiveSafetyEnabled ? colors.green : colors.amber) + "20",
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.safetySmallBadgeText,
                            { color: effectiveSafetyEnabled ? colors.green : colors.amber },
                          ]}
                        >
                          {effectiveSafetyEnabled ? `${effectiveSafetyWatts}W` : "OFF"}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.safetyBoxDesc}>
                      {effectiveSafetyEnabled
                        ? `Auto-trips relay if load exceeds ${effectiveSafetyWatts}W. Turn OFF if profiling high inrush appliances like an Air Conditioner.`
                        : "Cutoff protection disabled. Heavy startup inrush will not trip the relay."}
                    </Text>
                  </View>
                  {safetyToggling ? (
                    <ActivityIndicator size="small" color={colors.accent} />
                  ) : (
                    <Switch
                      value={effectiveSafetyEnabled}
                      onValueChange={handleToggleSafety}
                      trackColor={{ false: colors.border, true: colors.accent }}
                      thumbColor={Platform.OS === "android" ? "#ffffff" : undefined}
                    />
                  )}
                </View>
              </View>

              {/* Aircon inrush tip banner */}
              {applianceName.toLowerCase().includes("air") && effectiveSafetyEnabled && (
                <View style={styles.airconTipBanner}>
                  <Ionicons name="information-circle" size={18} color={colors.accent} />
                  <Text style={styles.airconTipText}>
                    Air conditioner compressors often cause sudden inrush surges when starting. If the relay shuts off immediately with "overpower", switch the Safety Cutoff above to OFF while logging.
                  </Text>
                </View>
              )}

              {/* Database Wipe Notice Banner */}
              <View style={styles.warningBanner}>
                <Ionicons name="trash-bin-outline" size={20} color={colors.amber} />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.warningTitle}>Database Auto-Reset</Text>
                  <Text style={styles.warningDesc}>
                    When you press "Start Data Collection", all previous database readings are
                    cleared to ensure your CSV and analytics isolate only this appliance.
                  </Text>
                </View>
              </View>

              {/* Big Start Button */}
              <Pressable
                style={[
                  styles.startButton,
                  { opacity: starting ? 0.7 : 1 },
                ]}
                onPress={handlePressStart}
                disabled={starting}
              >
                {starting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="play" size={20} color="#fff" style={{ marginRight: 8 }} />
                    <Text style={styles.startButtonText}>START DATA COLLECTION</Text>
                  </>
                )}
              </Pressable>
            </View>
          </View>
        )}

        {/* ============================================================ */}
        {/* COMPLETED SESSION / EXPORT SUMMARY CARD                      */}
        {/* ============================================================ */}
        {completedSession && !isCollecting && (
          <View style={styles.section}>
            <View style={[styles.card, styles.summaryCard]}>
              <View style={styles.summaryHeader}>
                <View style={styles.summarySuccessIcon}>
                  <Ionicons name="checkmark-done" size={22} color={colors.green} />
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.summaryTitle}>Collection Complete & Saved!</Text>
                  <Text style={styles.summarySub}>
                    Dataset ready for NILM & Machine Learning profiling.
                  </Text>
                </View>
              </View>

              {/* Statistics Grid */}
              <View style={styles.summaryStatsGrid}>
                <View style={styles.summaryStatItem}>
                  <Text style={styles.summaryStatLabel}>Appliance</Text>
                  <Text style={styles.summaryStatValue} numberOfLines={1}>
                    {completedSession.applianceName}
                  </Text>
                </View>

                <View style={styles.summaryStatItem}>
                  <Text style={styles.summaryStatLabel}>Duration</Text>
                  <Text style={styles.summaryStatValue}>
                    {formatTime(completedSession.durationSeconds)}
                  </Text>
                </View>

                <View style={styles.summaryStatItem}>
                  <Text style={styles.summaryStatLabel}>Samples</Text>
                  <Text style={styles.summaryStatValue}>
                    {completedSession.sampleCount} rows
                  </Text>
                </View>

                <View style={styles.summaryStatItem}>
                  <Text style={styles.summaryStatLabel}>Avg Power</Text>
                  <Text style={styles.summaryStatValue}>
                    {formatPower(completedSession.avgWatts)}
                  </Text>
                </View>

                <View style={styles.summaryStatItem}>
                  <Text style={styles.summaryStatLabel}>Peak Power</Text>
                  <Text style={styles.summaryStatValue}>
                    {formatPower(completedSession.maxWatts)}
                  </Text>
                </View>

                <View style={styles.summaryStatItem}>
                  <Text style={styles.summaryStatLabel}>Total Energy</Text>
                  <Text style={styles.summaryStatValue}>
                    {formatEnergy(completedSession.totalKwh, 3)}
                  </Text>
                </View>
              </View>

              {/* Export actions */}
              <View style={styles.summaryActionsRow}>
                <Pressable
                  style={styles.reshareButton}
                  onPress={handleReshare}
                  disabled={resharing}
                >
                  <Ionicons
                    name="share-social-outline"
                    size={16}
                    color="#fff"
                    style={{ marginRight: 6 }}
                  />
                  <Text style={styles.reshareButtonText}>
                    {resharing ? "Sharing..." : "Re-Share / Save CSV"}
                  </Text>
                </Pressable>

                <Pressable
                  style={styles.newSessionButton}
                  onPress={() => {
                    setCompletedSession(null);
                    setApplianceName("");
                  }}
                >
                  <Ionicons
                    name="refresh-outline"
                    size={16}
                    color={colors.text}
                    style={{ marginRight: 6 }}
                  />
                  <Text style={styles.newSessionButtonText}>Collect Another</Text>
                </Pressable>
              </View>
            </View>
          </View>
        )}

        {/* ============================================================ */}
        {/* STANDALONE DATABASE PURGE UTILITY                            */}
        {/* ============================================================ */}
        <View style={styles.section}>
          <View style={styles.dangerZoneCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.dangerZoneTitle}>Reset Database Readings</Text>
              <Text style={styles.dangerZoneSub}>
                Purge all energy records without starting a collection session.
              </Text>
            </View>
            <Pressable
              style={styles.dangerResetButton}
              onPress={() => setConfirmResetOnlyModal(true)}
              disabled={resettingDb || isCollecting}
            >
              {resettingDb ? (
                <ActivityIndicator size="small" color={colors.red} />
              ) : (
                <Text style={styles.dangerResetButtonText}>Purge DB</Text>
              )}
            </Pressable>
          </View>
        </View>
      </ScrollView>

      {/* Start Collection Confirmation Modal */}
      <ConfirmModal
        visible={confirmStartModal}
        icon="alert-circle"
        title="Start Data Collection?"
        message={`This will permanently purge previous energy readings in the database, energize the relay module, and begin logging telemetry for "${applianceName}". Ready to proceed?`}
        confirmText="Start & Turn ON Relay"
        cancelText="Cancel"
        onConfirm={handleConfirmStart}
        onCancel={() => setConfirmStartModal(false)}
      />

      {/* Reset Only Confirmation Modal */}
      <ConfirmModal
        visible={confirmResetOnlyModal}
        destructive
        icon="trash"
        title="Purge All Energy Readings?"
        message="Are you sure you want to delete all historical energy readings from the database? This action cannot be undone."
        confirmText="Yes, Purge Database"
        cancelText="Cancel"
        onConfirm={handleConfirmResetOnly}
        onCancel={() => setConfirmResetOnlyModal(false)}
      />
    </ScreenContainer>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    scroll: {
      padding: 16,
      paddingBottom: 40,
    },
    section: {
      marginBottom: 20,
    },
    sectionHeaderRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 8,
      paddingHorizontal: 4,
    },
    sectionTitleWithIcon: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    headerIconCircle: {
      width: 28,
      height: 28,
      borderRadius: 14,
      justifyContent: "center",
      alignItems: "center",
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.text,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: 14,
      padding: 16,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    badge: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
    },
    badgeText: {
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 0.3,
    },
    relayStatusRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingBottom: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    relayStatusLeft: {
      flex: 1,
      marginRight: 12,
    },
    relayStatusLabel: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.sub,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      marginBottom: 6,
    },
    relayLinesRow: {
      flexDirection: "column",
      gap: 6,
    },
    lineIndicator: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
      borderWidth: 1,
    },
    lineIndicatorText: {
      fontSize: 12,
      fontWeight: "600",
    },
    masterToggleButton: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: 10,
    },
    masterToggleText: {
      color: "#fff",
      fontWeight: "700",
      fontSize: 13,
      letterSpacing: 0.5,
    },
    individualControlsRow: {
      flexDirection: "row",
      gap: 10,
      marginTop: 12,
    },
    lineSubButton: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingVertical: 10,
      borderRadius: 8,
      borderWidth: 1,
    },
    lineSubButtonActive: {
      backgroundColor: colors.green + "15",
      borderColor: colors.green + "40",
    },
    lineSubButtonInactive: {
      backgroundColor: colors.bg,
      borderColor: colors.border,
    },
    lineSubButtonText: {
      fontSize: 12,
      fontWeight: "600",
    },
    relayMetaRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginTop: 10,
      paddingTop: 8,
    },
    relayMetaText: {
      fontSize: 11,
      color: colors.sub,
    },
    noticeCard: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.accentSoft,
      borderWidth: 1,
      borderColor: colors.accentBorder,
      borderRadius: 10,
      padding: 12,
      marginBottom: 16,
      gap: 8,
    },
    noticeText: {
      flex: 1,
      fontSize: 13,
      color: colors.text,
      lineHeight: 18,
    },
    formHint: {
      fontSize: 13,
      color: colors.sub,
      lineHeight: 18,
      marginBottom: 16,
    },
    inputGroup: {
      marginBottom: 14,
    },
    inputLabel: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.text,
      marginBottom: 6,
    },
    inputContainer: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.bg,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      height: 48,
      gap: 8,
    },
    textInput: {
      flex: 1,
      fontSize: 15,
      color: colors.text,
    },
    errorText: {
      fontSize: 12,
      color: colors.red,
      marginTop: 4,
    },
    presetsGroup: {
      marginBottom: 16,
    },
    presetsLabel: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.sub,
      marginBottom: 8,
    },
    chipsWrap: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    presetChip: {
      backgroundColor: colors.bg,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 20,
    },
    presetChipSelected: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    presetChipText: {
      fontSize: 12,
      color: colors.text,
      fontWeight: "500",
    },
    lineSelectorRow: {
      flexDirection: "row",
      gap: 8,
    },
    lineChoiceCard: {
      flex: 1,
      backgroundColor: colors.bg,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      paddingVertical: 10,
      paddingHorizontal: 6,
      alignItems: "center",
    },
    lineChoiceCardSelected: {
      borderColor: colors.accent,
      backgroundColor: colors.accentSoft,
    },
    lineChoiceLabel: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.text,
      marginBottom: 2,
    },
    lineChoiceSub: {
      fontSize: 10,
      color: colors.sub,
    },
    warningBanner: {
      flexDirection: "row",
      backgroundColor: colors.amber + "15",
      borderWidth: 1,
      borderColor: colors.amber + "40",
      borderRadius: 10,
      padding: 12,
      marginBottom: 16,
      alignItems: "flex-start",
    },
    warningTitle: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.amber,
      marginBottom: 2,
    },
    warningDesc: {
      fontSize: 12,
      color: colors.text,
      lineHeight: 16,
    },
    startButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.green,
      borderRadius: 12,
      paddingVertical: 15,
      marginTop: 4,
    },
    startButtonText: {
      color: "#fff",
      fontWeight: "700",
      fontSize: 15,
      letterSpacing: 0.5,
    },
    recordingCard: {
      borderColor: colors.red,
      borderWidth: 1.5,
    },
    recordingHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 10,
    },
    recordingIndicatorRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    recordingDot: {
      width: 12,
      height: 12,
      borderRadius: 6,
      backgroundColor: colors.red,
    },
    recordingTitle: {
      fontSize: 14,
      fontWeight: "800",
      color: colors.red,
      letterSpacing: 0.5,
    },
    targetBadge: {
      backgroundColor: colors.bg,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    targetBadgeText: {
      fontSize: 11,
      fontWeight: "700",
      color: colors.sub,
    },
    activeApplianceBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: colors.bg,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 8,
      marginBottom: 16,
    },
    activeApplianceText: {
      fontSize: 14,
      color: colors.text,
    },
    timerSection: {
      alignItems: "center",
      paddingVertical: 14,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      marginBottom: 16,
    },
    timerDisplay: {
      fontSize: 48,
      fontWeight: "800",
      fontVariant: ["tabular-nums"],
      color: colors.text,
      letterSpacing: 2,
    },
    samplesCounterRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginTop: 4,
    },
    samplesCounterText: {
      fontSize: 12,
      color: colors.sub,
    },
    metricsGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginBottom: 16,
    },
    metricCell: {
      width: "31%",
      backgroundColor: colors.bg,
      borderRadius: 8,
      padding: 10,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      alignItems: "center",
    },
    metricCellLabel: {
      fontSize: 10,
      fontWeight: "700",
      color: colors.sub,
      letterSpacing: 0.5,
      marginBottom: 4,
    },
    metricCellValue: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.text,
      fontVariant: ["tabular-nums"],
    },
    liveLogSection: {
      backgroundColor: colors.bg,
      borderRadius: 8,
      padding: 10,
      marginBottom: 16,
    },
    liveLogTitle: {
      fontSize: 11,
      fontWeight: "700",
      color: colors.sub,
      textTransform: "uppercase",
      marginBottom: 6,
    },
    logRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingVertical: 3,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    logTime: {
      fontSize: 11,
      color: colors.sub,
      fontVariant: ["tabular-nums"],
    },
    logWatts: {
      fontSize: 11,
      fontWeight: "600",
      color: colors.green,
      fontVariant: ["tabular-nums"],
    },
    logAmps: {
      fontSize: 11,
      color: colors.text,
      fontVariant: ["tabular-nums"],
    },
    logVolts: {
      fontSize: 11,
      color: colors.sub,
      fontVariant: ["tabular-nums"],
    },
    stopButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.red,
      borderRadius: 12,
      paddingVertical: 15,
    },
    stopButtonText: {
      color: "#fff",
      fontWeight: "800",
      fontSize: 14,
      letterSpacing: 0.5,
    },
    summaryCard: {
      borderColor: colors.green,
      borderWidth: 1.5,
    },
    summaryHeader: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 14,
    },
    summarySuccessIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.green + "20",
      justifyContent: "center",
      alignItems: "center",
    },
    summaryTitle: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.text,
    },
    summarySub: {
      fontSize: 12,
      color: colors.sub,
      marginTop: 2,
    },
    summaryStatsGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      paddingVertical: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      marginBottom: 16,
    },
    summaryStatItem: {
      width: "31%",
      backgroundColor: colors.bg,
      borderRadius: 8,
      padding: 8,
    },
    summaryStatLabel: {
      fontSize: 10,
      color: colors.sub,
      fontWeight: "600",
      marginBottom: 2,
    },
    summaryStatValue: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.text,
      fontVariant: ["tabular-nums"],
    },
    summaryActionsRow: {
      flexDirection: "row",
      gap: 10,
    },
    reshareButton: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.accent,
      borderRadius: 10,
      paddingVertical: 12,
    },
    reshareButtonText: {
      color: "#fff",
      fontSize: 13,
      fontWeight: "700",
    },
    newSessionButton: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.bg,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingVertical: 12,
    },
    newSessionButtonText: {
      color: colors.text,
      fontSize: 13,
      fontWeight: "600",
    },
    dangerZoneCard: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.red + "30",
    },
    dangerZoneTitle: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.text,
    },
    dangerZoneSub: {
      fontSize: 12,
      color: colors.sub,
      marginTop: 2,
    },
    dangerResetButton: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 8,
      backgroundColor: colors.red + "15",
      borderWidth: 1,
      borderColor: colors.red + "40",
    },
    dangerResetButtonText: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.red,
    },
    safetyBox: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      padding: 12,
      borderRadius: 12,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    safetyTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    safetyBoxTitle: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.text,
    },
    safetySmallBadge: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
    },
    safetySmallBadgeText: {
      fontSize: 10,
      fontWeight: "700",
    },
    safetyBoxDesc: {
      fontSize: 11,
      color: colors.sub,
      lineHeight: 15,
      marginTop: 4,
    },
    airconTipBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      padding: 12,
      borderRadius: 10,
      backgroundColor: colors.accent + "18",
      borderWidth: 1,
      borderColor: colors.accent + "35",
      marginBottom: 16,
    },
    airconTipText: {
      flex: 1,
      fontSize: 12,
      lineHeight: 16,
      color: colors.text,
    },
  });
}

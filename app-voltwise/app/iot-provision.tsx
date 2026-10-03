import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ActivityIndicator,
  ScrollView,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { ScreenContainer, useThemedStyles } from "../components/themed";
import { useTheme } from "../context/ThemeContext";
import { useMqtt } from "../context/MqttContext";
import type { ThemeColors } from "../constants/theme";

interface DeviceStatus {
  deviceUid: string;
  mac: string;
  configured: boolean;
  apSsid: string;
  ip: string;
}

interface ScannedNetwork {
  ssid: string;
  rssi: number;
  secure: boolean;
}

export default function IotProvisionScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { setDeviceUid, discovered, deviceOnline } = useMqtt();

  // Wizard Steps: 1: Hotspot, 2: Select Wi-Fi, 3: Password & UID, 4: Transfer, 5: Verify
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);

  // Hotspot & Device state
  const [checkingHotspot, setCheckingHotspot] = useState(false);
  const [hotspotError, setHotspotError] = useState<string | null>(null);
  const [deviceInfo, setDeviceInfo] = useState<DeviceStatus | null>(null);

  // Scan state
  const [scanning, setScanning] = useState(false);
  const [networks, setNetworks] = useState<ScannedNetwork[]>([]);
  const [scanError, setScanError] = useState<string | null>(null);

  // Form state
  const [selectedSsid, setSelectedSsid] = useState("");
  const [isManualSsid, setIsManualSsid] = useState(false);
  const [wifiPassword, setWifiPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [customUid, setCustomUid] = useState("");

  // Transfer state
  const [transferring, setTransferring] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);

  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, []);

  // ─────────────────────────────────────────────────────────────
  // STEP 2: Scan Networks
  // ─────────────────────────────────────────────────────────────

  const fetchNetworks = useCallback(async () => {
    setScanning(true);
    setScanError(null);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const res = await fetch("http://192.168.4.1/api/scan", {
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.ok) {
        const data: ScannedNetwork[] = await res.json();
        // Sort by signal strength descending
        data.sort((a, b) => b.rssi - a.rssi);
        setNetworks(data);
      } else {
        throw new Error(`Scan returned HTTP ${res.status}`);
      }
    } catch {
      clearTimeout(timeout);
      setScanError(
        "Failed to scan networks. You can retry or enter your network name manually."
      );
    } finally {
      setScanning(false);
    }
  }, []);

  // ─────────────────────────────────────────────────────────────
  // STEP 1: Ping Hotspot
  // ─────────────────────────────────────────────────────────────

  const checkHotspot = useCallback(
    async (silent = false) => {
      if (!silent) {
        setCheckingHotspot(true);
        setHotspotError(null);
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);

      try {
        const res = await fetch("http://192.168.4.1/api/status", {
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (res.ok) {
          const data: DeviceStatus = await res.json();
          setDeviceInfo(data);
          if (data.deviceUid) {
            setCustomUid(data.deviceUid);
          }
          setCheckingHotspot(false);
          setStep(2);
          void fetchNetworks();
          return true;
        }
        throw new Error(`Device responded with HTTP ${res.status}`);
      } catch {
        clearTimeout(timeout);
        if (!silent) {
          setCheckingHotspot(false);
          setHotspotError(
            "Could not reach VoltWise setup hotspot at 192.168.4.1. Please make sure your phone's Wi-Fi is connected to the 'VoltWise-Setup-XXXX' network."
          );
        }
        return false;
      }
    },
    [fetchNetworks]
  );

  // Auto-poll hotspot every 3s in Step 1
  useEffect(() => {
    if (step === 1) {
      pollTimerRef.current = setInterval(() => {
        void checkHotspot(true);
      }, 3000);
      return () => {
        if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      };
    }
  }, [step, checkHotspot]);

  const handleSelectNetwork = (ssid: string) => {
    setSelectedSsid(ssid);
    setIsManualSsid(false);
    setStep(3);
  };

  const handleManualEntry = () => {
    setSelectedSsid("");
    setIsManualSsid(true);
    setStep(3);
  };

  // ─────────────────────────────────────────────────────────────
  // STEP 3 & 4: Transmit Credentials
  // ─────────────────────────────────────────────────────────────

  const handleProvision = async () => {
    const finalSsid = selectedSsid.trim();
    if (!finalSsid) {
      Alert.alert("SSID Required", "Please specify a Wi-Fi network name.");
      return;
    }

    const finalUid = customUid.trim() || deviceInfo?.deviceUid || "esp32-01";

    setStep(4);
    setTransferring(true);
    setTransferError(null);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      const res = await fetch("http://192.168.4.1/api/provision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ssid: finalSsid,
          password: wifiPassword,
          deviceUid: finalUid,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.ok) {
        setTransferring(false);
        setStep(5);
        void setDeviceUid(finalUid);
      } else {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP ${res.status}`);
      }
    } catch (err: unknown) {
      clearTimeout(timeout);
      setTransferring(false);
      const msg = err instanceof Error ? err.message : "Failed to transmit credentials to the sensor.";
      setTransferError(msg);
    }
  };

  // ─────────────────────────────────────────────────────────────
  // STEP 5: Verification & MQTT Handshake
  // ─────────────────────────────────────────────────────────────

  const targetUid = customUid.trim() || deviceInfo?.deviceUid || "esp32-01";
  const verified = step === 5 && (deviceOnline || discovered.some((s) => s.uid === targetUid && s.online));

  const handleComplete = async () => {
    await setDeviceUid(targetUid);
    router.replace("/(tabs)/dashboard");
  };

  return (
    <ScreenContainer edges={["bottom"]}>
      {/* Progress Stepper Bar */}
      <View style={styles.stepperContainer}>
        {[1, 2, 3, 4, 5].map((s) => (
          <View key={s} style={styles.stepItem}>
            <View
              style={[
                styles.stepCircle,
                step >= s && { backgroundColor: colors.accent },
                step === s && { borderColor: colors.text, borderWidth: 2 },
              ]}
            >
              {step > s ? (
                <Ionicons name="checkmark" size={14} color="#fff" />
              ) : (
                <Text
                  style={[
                    styles.stepNumber,
                    step >= s && { color: "#fff", fontWeight: "700" },
                  ]}
                >
                  {s}
                </Text>
              )}
            </View>
            {s < 5 && (
              <View
                style={[
                  styles.stepLine,
                  step > s && { backgroundColor: colors.accent },
                ]}
              />
            )}
          </View>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* ───────────────────────────────────────────────────────── */}
        {/* STEP 1: Connect to Hotspot                                */}
        {/* ───────────────────────────────────────────────────────── */}
        {step === 1 && (
          <View style={styles.card}>
            <View style={styles.iconWrap}>
              <Ionicons name="wifi" size={32} color={colors.accent} />
            </View>
            <Text style={styles.title}>Connect to VoltWise Hotspot</Text>
            <Text style={styles.subtitle}>
              Your phone must first connect directly to the sensor&apos;s temporary
              Wi-Fi network to transfer your home credentials.
            </Text>

            <View style={styles.instructionBox}>
              <View style={styles.instructionRow}>
                <Text style={styles.instructionBadge}>1</Text>
                <Text style={styles.instructionText}>
                  Ensure your VoltWise device is powered on. If the hotspot is not
                  visible, hold the <Text style={styles.bold}>BOOT</Text> button on
                  the ESP32 for 3 seconds.
                </Text>
              </View>

              <View style={styles.instructionRow}>
                <Text style={styles.instructionBadge}>2</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.instructionText}>
                    Go to your phone&apos;s Wi-Fi Settings and connect to:
                  </Text>
                  <View style={styles.highlightBadge}>
                    <Ionicons name="radio-outline" size={16} color={colors.accent} />
                    <Text style={styles.highlightBadgeText}>
                      VoltWise-Setup-XXXX
                    </Text>
                  </View>
                  <Text style={styles.noteText}>
                    (Open network — no password required)
                  </Text>
                </View>
              </View>

              <View style={styles.instructionRow}>
                <Text style={styles.instructionBadge}>3</Text>
                <Text style={styles.instructionText}>
                  Return here. The app will detect the connection automatically.
                </Text>
              </View>
            </View>

            {hotspotError && (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={18} color={colors.red} />
                <Text style={styles.errorText}>{hotspotError}</Text>
              </View>
            )}

            <Pressable
              style={[styles.primaryBtn, checkingHotspot && styles.disabledBtn]}
              onPress={() => void checkHotspot()}
              disabled={checkingHotspot}
            >
              {checkingHotspot ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                  <Text style={styles.primaryBtnText}>Check Hotspot Connection</Text>
                </>
              )}
            </Pressable>
          </View>
        )}

        {/* ───────────────────────────────────────────────────────── */}
        {/* STEP 2: Select Wi-Fi Network                              */}
        {/* ───────────────────────────────────────────────────────── */}
        {step === 2 && (
          <View style={styles.card}>
            <View style={styles.iconWrap}>
              <Ionicons name="search" size={32} color={colors.accent} />
            </View>
            <Text style={styles.title}>Select Home Wi-Fi</Text>
            <Text style={styles.subtitle}>
              Choose the 2.4 GHz network you want VoltWise to connect to.
            </Text>

            <View style={styles.bandWarning}>
              <Ionicons name="information-circle" size={18} color={colors.amber} />
              <Text style={styles.bandWarningText}>
                The ESP32 supports <Text style={styles.bold}>2.4 GHz Wi-Fi</Text> only.
                5 GHz networks cannot be joined.
              </Text>
            </View>

            <View style={styles.listHeaderRow}>
              <Text style={styles.listHeading}>Nearby Networks</Text>
              <Pressable
                onPress={fetchNetworks}
                disabled={scanning}
                style={styles.refreshBtn}
              >
                {scanning ? (
                  <ActivityIndicator size="small" color={colors.accent} />
                ) : (
                  <>
                    <Ionicons name="refresh" size={14} color={colors.accent} />
                    <Text style={styles.refreshText}>Rescan</Text>
                  </>
                )}
              </Pressable>
            </View>

            {scanError && (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={16} color={colors.red} />
                <Text style={styles.errorText}>{scanError}</Text>
              </View>
            )}

            {networks.length > 0 ? (
              <View style={styles.networkList}>
                {networks.map((net, idx) => (
                  <Pressable
                    key={idx}
                    style={styles.networkItem}
                    onPress={() => handleSelectNetwork(net.ssid)}
                  >
                    <View style={styles.networkLeft}>
                      <Ionicons
                        name={net.rssi > -65 ? "wifi" : "wifi-outline"}
                        size={20}
                        color={colors.accent}
                      />
                      <Text style={styles.networkName}>{net.ssid}</Text>
                    </View>
                    <View style={styles.networkRight}>
                      {net.secure && (
                        <Ionicons name="lock-closed" size={14} color={colors.sub} />
                      )}
                      <Ionicons
                        name="chevron-forward"
                        size={16}
                        color={colors.sub}
                      />
                    </View>
                  </Pressable>
                ))}
              </View>
            ) : !scanning ? (
              <Text style={styles.emptyText}>No Wi-Fi networks found.</Text>
            ) : null}

            <Pressable
              style={styles.manualEntryBtn}
              onPress={handleManualEntry}
            >
              <Ionicons name="create-outline" size={16} color={colors.accent} />
              <Text style={styles.manualEntryText}>
                Enter Network Name (SSID) Manually
              </Text>
            </Pressable>
          </View>
        )}

        {/* ───────────────────────────────────────────────────────── */}
        {/* STEP 3: Enter Password & Sensor UID                       */}
        {/* ───────────────────────────────────────────────────────── */}
        {step === 3 && (
          <View style={styles.card}>
            <View style={styles.iconWrap}>
              <Ionicons name="key" size={32} color={colors.accent} />
            </View>
            <Text style={styles.title}>Wi-Fi Password</Text>
            <Text style={styles.subtitle}>
              Enter credentials for {isManualSsid ? "your network" : `"${selectedSsid}"`}.
            </Text>

            {isManualSsid && (
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Wi-Fi Network Name (SSID)</Text>
                <View style={styles.inputRow}>
                  <TextInput
                    style={styles.input}
                    placeholder="Enter network name"
                    placeholderTextColor={colors.sub}
                    value={selectedSsid}
                    onChangeText={setSelectedSsid}
                    autoCapitalize="none"
                  />
                </View>
              </View>
            )}

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Wi-Fi Password</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder="Enter Wi-Fi password (if any)"
                  placeholderTextColor={colors.sub}
                  value={wifiPassword}
                  onChangeText={setWifiPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                />
                <Pressable
                  onPress={() => setShowPassword(!showPassword)}
                  style={styles.eyeBtn}
                >
                  <Ionicons
                    name={showPassword ? "eye-off-outline" : "eye-outline"}
                    size={20}
                    color={colors.sub}
                  />
                </Pressable>
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Sensor Device ID (Optional)</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. esp32-01"
                  placeholderTextColor={colors.sub}
                  value={customUid}
                  onChangeText={setCustomUid}
                  autoCapitalize="none"
                />
              </View>
              <Text style={styles.hintText}>
                Identifies this sensor on HiveMQ Cloud. Defaults to the hardware factory ID.
              </Text>
            </View>

            <View style={styles.btnRow}>
              <Pressable
                style={styles.secondaryBtn}
                onPress={() => setStep(2)}
              >
                <Text style={styles.secondaryBtnText}>Back</Text>
              </Pressable>
              <Pressable
                style={[styles.primaryBtn, { flex: 2 }]}
                onPress={handleProvision}
              >
                <Ionicons name="paper-plane" size={16} color="#fff" />
                <Text style={styles.primaryBtnText}>Connect Sensor</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* ───────────────────────────────────────────────────────── */}
        {/* STEP 4: Transferring                                      */}
        {/* ───────────────────────────────────────────────────────── */}
        {step === 4 && (
          <View style={styles.card}>
            <View style={styles.iconWrap}>
              {transferring ? (
                <ActivityIndicator size="large" color={colors.accent} />
              ) : (
                <Ionicons name="alert-circle" size={32} color={colors.red} />
              )}
            </View>
            <Text style={styles.title}>
              {transferring ? "Configuring VoltWise..." : "Configuration Failed"}
            </Text>
            <Text style={styles.subtitle}>
              {transferring
                ? "Sending Wi-Fi network credentials to your VoltWise hardware."
                : transferError}
            </Text>

            {!transferring && (
              <Pressable
                style={styles.primaryBtn}
                onPress={() => setStep(3)}
              >
                <Text style={styles.primaryBtnText}>Try Again</Text>
              </Pressable>
            )}
          </View>
        )}

        {/* ───────────────────────────────────────────────────────── */}
        {/* STEP 5: Verification & Completion                         */}
        {/* ───────────────────────────────────────────────────────── */}
        {step === 5 && (
          <View style={styles.card}>
            <View
              style={[
                styles.iconWrap,
                verified && { backgroundColor: colors.green + "26" },
              ]}
            >
              <Ionicons
                name={verified ? "checkmark-circle" : "sync-outline"}
                size={36}
                color={verified ? colors.green : colors.accent}
              />
            </View>

            <Text style={styles.title}>
              {verified ? "Sensor Connected!" : "Switching to Home Wi-Fi"}
            </Text>

            <Text style={styles.subtitle}>
              {verified
                ? `VoltWise is now online and paired with "${targetUid}". Live telemetry and safety controls are active.`
                : "Credentials have been applied to your sensor! Please switch your phone's Wi-Fi back to your home network."}
            </Text>

            {!verified && (
              <View style={styles.instructionBox}>
                <View style={styles.instructionRow}>
                  <Ionicons name="phone-portrait-outline" size={20} color={colors.accent} />
                  <Text style={styles.instructionText}>
                    Reconnect your phone to <Text style={styles.bold}>{selectedSsid || "your home Wi-Fi"}</Text> so the app can reach the cloud broker.
                  </Text>
                </View>
              </View>
            )}

            <Pressable
              style={[
                styles.primaryBtn,
                verified && { backgroundColor: colors.green },
              ]}
              onPress={handleComplete}
            >
              <Ionicons
                name={verified ? "arrow-forward" : "checkmark-done"}
                size={18}
                color="#fff"
              />
              <Text style={styles.primaryBtnText}>
                {verified ? "Go to Dashboard" : "I&apos;m Reconnected — Complete Setup"}
              </Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

function createStyles(colors: ThemeColors, fontScale: number) {
  return StyleSheet.create({
    stepperContainer: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 16,
      paddingHorizontal: 24,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    stepItem: {
      flexDirection: "row",
      alignItems: "center",
    },
    stepCircle: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
    },
    stepNumber: {
      color: colors.sub,
      fontSize: 12 * fontScale,
      fontWeight: "600",
    },
    stepLine: {
      width: 32,
      height: 2,
      backgroundColor: colors.border,
      marginHorizontal: 4,
    },
    content: {
      padding: 20,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 24,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
    },
    iconWrap: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: colors.accentSoft,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 16,
    },
    title: {
      fontSize: 20 * fontScale,
      fontWeight: "700",
      color: colors.text,
      textAlign: "center",
      marginBottom: 8,
    },
    subtitle: {
      fontSize: 14 * fontScale,
      color: colors.sub,
      textAlign: "center",
      lineHeight: 20 * fontScale,
      marginBottom: 20,
    },
    instructionBox: {
      width: "100%",
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 16,
      gap: 16,
      marginBottom: 20,
      borderWidth: 1,
      borderColor: colors.border,
    },
    instructionRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 12,
    },
    instructionBadge: {
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: colors.accent,
      color: "#fff",
      fontWeight: "700",
      fontSize: 12 * fontScale,
      textAlign: "center",
      lineHeight: 22,
    },
    instructionText: {
      flex: 1,
      fontSize: 13 * fontScale,
      color: colors.text,
      lineHeight: 18 * fontScale,
    },
    bold: {
      fontWeight: "700",
      color: colors.text,
    },
    highlightBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: colors.accentSoft,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 8,
      marginTop: 8,
      alignSelf: "flex-start",
    },
    highlightBadgeText: {
      color: colors.accent,
      fontWeight: "700",
      fontSize: 13 * fontScale,
    },
    noteText: {
      fontSize: 11 * fontScale,
      color: colors.sub,
      marginTop: 4,
    },
    errorBox: {
      width: "100%",
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: colors.red + "15",
      borderWidth: 1,
      borderColor: colors.red + "40",
      padding: 12,
      borderRadius: 10,
      marginBottom: 16,
    },
    errorText: {
      flex: 1,
      fontSize: 12 * fontScale,
      color: colors.red,
      lineHeight: 16 * fontScale,
    },
    bandWarning: {
      width: "100%",
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: colors.amber + "15",
      borderWidth: 1,
      borderColor: colors.amber + "40",
      padding: 10,
      borderRadius: 8,
      marginBottom: 16,
    },
    bandWarningText: {
      flex: 1,
      fontSize: 12 * fontScale,
      color: colors.amber,
      lineHeight: 16 * fontScale,
    },
    listHeaderRow: {
      width: "100%",
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 10,
    },
    listHeading: {
      fontSize: 14 * fontScale,
      fontWeight: "700",
      color: colors.text,
    },
    refreshBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    refreshText: {
      fontSize: 12 * fontScale,
      color: colors.accent,
      fontWeight: "600",
    },
    networkList: {
      width: "100%",
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
      marginBottom: 16,
    },
    networkItem: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    networkLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      flex: 1,
    },
    networkName: {
      fontSize: 14 * fontScale,
      fontWeight: "600",
      color: colors.text,
    },
    networkRight: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    emptyText: {
      fontSize: 13 * fontScale,
      color: colors.sub,
      textAlign: "center",
      marginVertical: 16,
    },
    manualEntryBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingVertical: 10,
    },
    manualEntryText: {
      fontSize: 13 * fontScale,
      color: colors.accent,
      fontWeight: "600",
    },
    inputGroup: {
      width: "100%",
      marginBottom: 16,
    },
    inputLabel: {
      fontSize: 12 * fontScale,
      fontWeight: "600",
      color: colors.sub,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      marginBottom: 6,
    },
    inputRow: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.surface,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    input: {
      color: colors.text,
      fontSize: 15 * fontScale,
      padding: 0,
    },
    eyeBtn: {
      padding: 4,
    },
    hintText: {
      fontSize: 11 * fontScale,
      color: colors.sub,
      marginTop: 4,
    },
    btnRow: {
      flexDirection: "row",
      width: "100%",
      gap: 12,
      marginTop: 10,
    },
    primaryBtn: {
      width: "100%",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      backgroundColor: colors.accent,
      borderRadius: 12,
      paddingVertical: 14,
    },
    primaryBtnText: {
      color: "#fff",
      fontSize: 15 * fontScale,
      fontWeight: "700",
    },
    secondaryBtn: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 14,
    },
    secondaryBtnText: {
      color: colors.text,
      fontSize: 14 * fontScale,
      fontWeight: "600",
    },
    disabledBtn: {
      opacity: 0.6,
    },
  });
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  TextInput,
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import ConfirmModal from "../components/ConfirmModal";
import { PullToRefresh } from "../components/pull-to-refresh";
import { ScreenContainer, useThemedStyles } from "../components/themed";
import { useMqtt } from "../context/MqttContext";
import { useTheme } from "../context/ThemeContext";
import { useUnits } from "../context/UnitsContext";
import { usePullToRefresh } from "../hooks/usePullToRefresh";
import { api, type IotStatus } from "../lib/api";
import {
  DEFAULT_DEVICE_UID,
  DEVICE_UID_HINT,
  LINK_DESCRIPTIONS,
  LINK_LABELS,
  MAX_DEVICE_UID_LENGTH,
  RELAY_REASON_LABELS,
  brokerLabel,
  deviceTopics,
  formatAge,
  linkHealth,
  normalizeDeviceUid,
  type LinkHealth,
} from "../lib/iot-prefs";
import { clearDeviceUid } from "../lib/iot-storage";
import type { ThemeColors } from "../constants/theme";

/**
 * Sensor & IoT — the screen behind that Settings row.
 *
 * Three things live here that exist nowhere else in the app:
 *
 *  - the honest answer to "is my sensor working", assembled from three
 *    independent signals (this app's broker socket, the sensor's retained
 *    status, and the backend's own connection) rather than any single one;
 *  - pairing, which lets an install follow a different ESP32 without a rebuild;
 *  - the raw PZEM channels — voltage, current, frequency, power factor — which
 *    the dashboard deliberately summarises away.
 *
 * The relay control is duplicated from the dashboard on purpose: this is the
 * screen someone opens when the dashboard says the link is down, and being
 * unable to cut power from the page that diagnoses the sensor would be absurd.
 */

/** How often the backend's view of the broker is re-polled while open. */
const STATUS_POLL_MS = 15_000;
/** Give up on a relay command after this and let the UI fall back to reality. */
const RELAY_TIMEOUT_MS = 10_000;

export default function IotSettingsScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { formatPower, formatEnergy } = useUnits();
  const {
    connected,
    configured,
    lastError,
    brokerUrl,
    telemetry,
    telemetryAt,
    relayState,
    deviceOnline,
    deviceUid,
    isCustomUid,
    setDeviceUid,
    discovered,
    reconnect,
  } = useMqtt();

  const [status, setStatus] = useState<IotStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  /** Ticks so "last seen" ages and the live/stale verdict stay honest. */
  const [now, setNow] = useState(() => Date.now());

  // Relay: optimistic value while a command is in flight, reconciled when the
  // firmware confirms on the retained relay/state topic.
  const [relayLocal, setRelayLocal] = useState<boolean | null>(null);
  const [relayPending, setRelayPending] = useState(false);
  const [relayError, setRelayError] = useState<string | null>(null);
  const [confirmCutoff, setConfirmCutoff] = useState(false);
  const relayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Pairing editor.
  const [uidModalVisible, setUidModalVisible] = useState(false);
  const [uidInput, setUidInput] = useState("");
  const [uidError, setUidError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      setStatus(await api.get<IotStatus>("/iot/status"));
      setStatusError(null);
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : "Server unreachable.");
    }
  }, []);

  const { refreshing, onRefresh } = usePullToRefresh(fetchStatus);

  useEffect(() => {
    void fetchStatus();
    const poll = setInterval(() => void fetchStatus(), STATUS_POLL_MS);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [fetchStatus]);

  // A relay/state message is the firmware's confirmation — it always wins over
  // the optimistic value, including when the firmware refuses the command.
  useEffect(() => {
    if (relayState === null) return;
    if (relayTimeoutRef.current) clearTimeout(relayTimeoutRef.current);
    setRelayLocal(null);
    setRelayPending(false);
  }, [relayState]);

  useEffect(
    () => () => {
      if (relayTimeoutRef.current) clearTimeout(relayTimeoutRef.current);
    },
    []
  );

  // ---- Derived state ----

  const health: LinkHealth = linkHealth({
    configured,
    appConnected: connected,
    deviceOnline,
    telemetryAt,
    now,
  });

  const healthColor =
    health === "live"
      ? colors.green
      : health === "offline"
        ? colors.red
        : health === "unconfigured"
          ? colors.sub
          : colors.amber;

  const isLive = health === "live";

  /**
   * MQTT telemetry when this app has any, otherwise the backend's last-known
   * reading — which is still a real measurement, just an old one. The card says
   * which of the two it is showing rather than letting a frozen value pass for
   * a current one.
   */
  const reading = telemetry ?? status?.lastTelemetry ?? null;
  const readingAt =
    telemetryAt ??
    (status?.lastTelemetryAt ? new Date(status.lastTelemetryAt).getTime() : null);

  /**
   * The app and the backend pair themselves independently (the backend's UID is
   * an env var on the server). When they disagree the dashboard can show live
   * readings that are never written to the database — worth saying out loud,
   * because every symptom of it looks like something else.
   */
  const mismatchedUid = status !== null && status.deviceUid !== deviceUid;

  const relayOn = relayLocal ?? relayState?.on ?? true;
  const relayReason =
    RELAY_REASON_LABELS[relayState?.reason ?? ""] ??
    (relayOn ? "Power is on" : "Power is off");
  /**
   * The command path is REST → backend → broker, and the backend publishes to
   * its OWN uid. So a mismatch is not a cosmetic warning here: the button would
   * switch a different board from the one whose state is displayed above it.
   * Reachability likewise comes from either end seeing the device, since the
   * app's own broker socket is not on the command path at all.
   */
  const relayReachable =
    !mismatchedUid && (isLive || (status?.brokerConnected === true && status.online));
  const relayDisabled = relayPending || !relayReachable;

  const topics = useMemo(() => deviceTopics(deviceUid), [deviceUid]);
  const broker = brokerLabel(brokerUrl);

  // ---- Actions ----

  const sendRelay = useCallback(async (next: boolean) => {
    setRelayError(null);
    setRelayLocal(next);
    setRelayPending(true);
    if (relayTimeoutRef.current) clearTimeout(relayTimeoutRef.current);
    // Nothing came back from the firmware — drop the optimistic value rather
    // than leaving a switch that claims a state the hardware never reached.
    relayTimeoutRef.current = setTimeout(() => {
      setRelayLocal(null);
      setRelayPending(false);
      setRelayError("The sensor did not confirm the command.");
    }, RELAY_TIMEOUT_MS);

    try {
      await api.post<IotStatus>("/iot/relay", { on: next });
    } catch (error) {
      if (relayTimeoutRef.current) clearTimeout(relayTimeoutRef.current);
      setRelayLocal(null);
      setRelayPending(false);
      setRelayError(error instanceof Error ? error.message : "Command failed.");
    }
  }, []);

  const handleRelayPress = () => {
    // Switching mains off is the one action here with a physical consequence,
    // so it asks first; switching back on does not.
    if (relayOn) setConfirmCutoff(true);
    else void sendRelay(true);
  };

  const openUidEditor = () => {
    setUidInput(deviceUid);
    setUidError(null);
    setUidModalVisible(true);
  };

  const handleSaveUid = async () => {
    const next = normalizeDeviceUid(uidInput);
    if (next === null) {
      setUidError(`Enter a valid sensor ID. ${DEVICE_UID_HINT}`);
      return;
    }
    Keyboard.dismiss();
    setUidModalVisible(false);
    await setDeviceUid(next);
  };

  const handleResetUid = async () => {
    await setDeviceUid(DEFAULT_DEVICE_UID);
    // setDeviceUid persists the value; clearing afterwards means a later change
    // to EXPO_PUBLIC_MQTT_DEVICE_UID is picked up instead of being shadowed.
    await clearDeviceUid().catch(() => {});
  };

  // ---- Render ----

  return (
    <ScreenContainer edges={["bottom"]}>
      <PullToRefresh
        refreshing={refreshing}
        onRefresh={onRefresh}
        contentContainerStyle={styles.scroll}
      >
        {mismatchedUid && (
          <View style={[styles.banner, { borderColor: colors.amber + "66" }]}>
            <Ionicons name="git-compare-outline" size={18} color={colors.amber} />
            <Text style={[styles.bannerText, { color: colors.amber }]}>
              This app is watching <Text style={styles.bannerStrong}>{deviceUid}</Text>, but
              the server records readings from{" "}
              <Text style={styles.bannerStrong}>{status?.deviceUid}</Text>. Live values will
              not match your history until the two agree.
            </Text>
          </View>
        )}

        {/* ---- Link health ---- */}
        <View style={styles.group}>
          <Text style={styles.groupHeading}>Connection</Text>
          <View style={styles.card}>
            <View style={styles.hero}>
              <View style={[styles.heroIcon, { backgroundColor: healthColor + "26" }]}>
                <Ionicons
                  name={isLive ? "flash" : health === "offline" ? "cloud-offline" : "alert"}
                  size={26}
                  color={healthColor}
                />
              </View>
              <View style={styles.heroBody}>
                <View style={styles.heroTitleRow}>
                  <Text style={styles.heroTitle}>{LINK_LABELS[health]}</Text>
                  {isLive && <View style={[styles.dot, { backgroundColor: colors.green }]} />}
                </View>
                <Text style={styles.heroSubtitle}>{LINK_DESCRIPTIONS[health]}</Text>
              </View>
            </View>

            <StatusRow
              styles={styles}
              colors={colors}
              icon="phone-portrait-outline"
              label="This app to broker"
              value={connected ? "Connected" : configured ? "Disconnected" : "Disabled"}
              tone={connected ? "good" : configured ? "bad" : "muted"}
            />
            <StatusRow
              styles={styles}
              colors={colors}
              icon="server-outline"
              label="Server to broker"
              value={
                statusError !== null
                  ? "Server unreachable"
                  : status === null
                    ? "Checking…"
                    : status.brokerConnected
                      ? "Connected"
                      : "Disconnected"
              }
              tone={
                statusError !== null || status?.brokerConnected === false
                  ? "bad"
                  : status?.brokerConnected
                    ? "good"
                    : "muted"
              }
            />
            <StatusRow
              styles={styles}
              colors={colors}
              icon="hardware-chip-outline"
              label="Last reading"
              value={readingAt === null ? "Never" : formatAge(now - readingAt)}
              tone={isLive ? "good" : readingAt === null ? "muted" : "warn"}
            />
            <StatusRow
              styles={styles}
              colors={colors}
              icon="cloud-upload-outline"
              label="Recording to history"
              // The backend only ingests from its own UID, so a mismatch means
              // nothing is being stored no matter how healthy the link looks.
              value={
                status?.online && !mismatchedUid ? "Yes" : mismatchedUid ? "No — ID mismatch" : "No"
              }
              tone={status?.online && !mismatchedUid ? "good" : "warn"}
            />

            {configured && (
              <Pressable
                style={[styles.row, styles.rowDivider]}
                onPress={reconnect}
                accessibilityRole="button"
                accessibilityLabel="Reconnect to the broker"
              >
                <View style={styles.rowIcon}>
                  <Ionicons name="refresh" size={18} color={colors.accent} />
                </View>
                <View style={styles.rowBody}>
                  <Text style={[styles.rowTitle, { color: colors.accent }]}>Reconnect</Text>
                  <Text style={styles.rowSubtitle}>
                    Drop the broker connection and dial in again
                  </Text>
                </View>
              </Pressable>
            )}
          </View>

          {lastError !== null && (
            <Text style={styles.footnote}>Last broker error: {lastError}</Text>
          )}
        </View>

        {/* ---- Sensor channels ---- */}
        <View style={styles.group}>
          <Text style={styles.groupHeading}>Sensor readings</Text>
          <View style={styles.card}>
            {reading === null ? (
              <View style={styles.empty}>
                <Ionicons name="pulse-outline" size={24} color={colors.sub} />
                <Text style={styles.emptyText}>
                  No readings yet. They appear here as soon as the sensor publishes.
                </Text>
              </View>
            ) : (
              <>
                <View style={styles.metricGrid}>
                  <Metric
                    styles={styles}
                    label="Voltage"
                    value={reading.voltage !== undefined ? `${reading.voltage.toFixed(1)} V` : "—"}
                  />
                  <Metric
                    styles={styles}
                    label="Current"
                    value={reading.current !== undefined ? `${reading.current.toFixed(2)} A` : "—"}
                  />
                  <Metric styles={styles} label="Power" value={formatPower(reading.watts)} />
                  <Metric styles={styles} label="Energy" value={formatEnergy(reading.kwh, 3)} />
                  <Metric
                    styles={styles}
                    label="Frequency"
                    value={
                      reading.frequency !== undefined ? `${reading.frequency.toFixed(1)} Hz` : "—"
                    }
                  />
                  <Metric
                    styles={styles}
                    label="Power factor"
                    value={
                      reading.powerFactor !== undefined ? reading.powerFactor.toFixed(2) : "—"
                    }
                  />
                </View>
                <View style={[styles.sourceRow, styles.rowDivider]}>
                  <Ionicons
                    name={isLive ? "radio-outline" : "time-outline"}
                    size={14}
                    color={isLive ? colors.green : colors.sub}
                  />
                  <Text style={styles.sourceText}>
                    {isLive
                      ? "Streaming live from the sensor, about every 2 seconds."
                      : `Last known reading${readingAt !== null ? ` — ${formatAge(now - readingAt)}` : ""}. Not updating.`}
                  </Text>
                </View>
              </>
            )}
          </View>
        </View>

        {/* ---- Relay ---- */}
        <View style={styles.group}>
          <Text style={styles.groupHeading}>Master power</Text>
          <View style={styles.card}>
            <View style={styles.relayRow}>
              <View
                style={[
                  styles.rowIcon,
                  { backgroundColor: (relayOn ? colors.green : colors.red) + "26" },
                ]}
              >
                <Ionicons name="power" size={20} color={relayOn ? colors.green : colors.red} />
              </View>
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle}>{relayOn ? "Relay is on" : "Relay is off"}</Text>
                <Text style={styles.rowSubtitle}>
                  {relayPending
                    ? "Waiting for the sensor to confirm…"
                    : mismatchedUid
                      ? `The server switches ${status?.deviceUid}, not this sensor`
                      : relayReachable
                        ? relayReason
                        : "Nothing can reach the sensor right now"}
                </Text>
              </View>
              <Pressable
                style={[
                  styles.relayBtn,
                  {
                    borderColor: relayOn ? colors.red : colors.green,
                    backgroundColor: (relayOn ? colors.red : colors.green) + "1F",
                    opacity: relayDisabled ? 0.45 : 1,
                  },
                ]}
                onPress={handleRelayPress}
                disabled={relayDisabled}
                accessibilityRole="button"
                accessibilityLabel={relayOn ? "Turn master power off" : "Turn master power on"}
                accessibilityState={{ disabled: relayDisabled }}
              >
                {relayPending ? (
                  <ActivityIndicator size="small" color={relayOn ? colors.red : colors.green} />
                ) : (
                  <Text
                    style={[styles.relayBtnText, { color: relayOn ? colors.red : colors.green }]}
                  >
                    {relayOn ? "Turn off" : "Turn on"}
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
          <Text style={styles.footnote}>
            {relayError !== null
              ? relayError
              : "The firmware's over-power cutoff always wins — it cannot be overridden from here."}
          </Text>
        </View>

        {/* ---- Pairing ---- */}
        <View style={styles.group}>
          <Text style={styles.groupHeading}>Paired sensor</Text>
          <View style={styles.card}>
            <Pressable
              style={styles.row}
              onPress={openUidEditor}
              accessibilityRole="button"
              accessibilityLabel={`Sensor ID, currently ${deviceUid}`}
            >
              <View style={styles.rowIcon}>
                <Ionicons name="pricetag-outline" size={18} color={colors.sub} />
              </View>
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle}>Sensor ID</Text>
                <Text style={styles.rowSubtitle}>
                  {isCustomUid ? "Set on this device" : "From the app build"}
                </Text>
              </View>
              <Text style={styles.rowValue}>{deviceUid}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.sub} />
            </Pressable>

            {isCustomUid && (
              <Pressable
                style={[styles.row, styles.rowDivider]}
                onPress={handleResetUid}
                accessibilityRole="button"
                accessibilityLabel="Reset to the default sensor"
              >
                <View style={styles.rowIcon}>
                  <Ionicons name="arrow-undo-outline" size={18} color={colors.sub} />
                </View>
                <View style={styles.rowBody}>
                  <Text style={styles.rowTitle}>Use the default sensor</Text>
                  <Text style={styles.rowSubtitle}>{DEFAULT_DEVICE_UID}</Text>
                </View>
              </Pressable>
            )}
          </View>

          {/* Discovery is passive: every board's status topic is retained, so
              subscribing to the wildcard lists them without asking anything. */}
          <Text style={[styles.groupHeading, styles.subHeading]}>Sensors on the broker</Text>
          <View style={styles.card}>
            {discovered.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="search-outline" size={24} color={colors.sub} />
                <Text style={styles.emptyText}>
                  {configured
                    ? connected
                      ? "No sensors have announced themselves yet. A board appears here the first time it connects."
                      : "Connect to the broker to see the sensors on it."
                    : "Broker credentials are not built into this app, so sensors cannot be discovered."}
                </Text>
              </View>
            ) : (
              discovered.map((sensor, idx) => {
                const paired = sensor.uid === deviceUid;
                return (
                  <Pressable
                    key={sensor.uid}
                    style={[styles.row, idx > 0 && styles.rowDivider]}
                    onPress={() => void setDeviceUid(sensor.uid)}
                    disabled={paired}
                    accessibilityRole="button"
                    accessibilityState={{ selected: paired }}
                    accessibilityLabel={`Sensor ${sensor.uid}, ${
                      sensor.online ? "online" : "offline"
                    }`}
                  >
                    <View
                      style={[
                        styles.rowIcon,
                        {
                          backgroundColor:
                            (sensor.online ? colors.green : colors.sub) + "26",
                        },
                      ]}
                    >
                      <Ionicons
                        name="hardware-chip-outline"
                        size={18}
                        color={sensor.online ? colors.green : colors.sub}
                      />
                    </View>
                    <View style={styles.rowBody}>
                      <Text style={styles.rowTitle}>{sensor.uid}</Text>
                      <Text style={styles.rowSubtitle}>
                        {sensor.online ? "Online" : "Offline"} · seen{" "}
                        {formatAge(now - sensor.lastSeenAt)}
                      </Text>
                    </View>
                    {paired ? (
                      <View style={styles.pairedBadge}>
                        <Text style={styles.pairedBadgeText}>Paired</Text>
                      </View>
                    ) : (
                      <Text style={styles.linkText}>Pair</Text>
                    )}
                  </Pressable>
                );
              })
            )}
          </View>
          <Text style={styles.footnote}>
            The ID must match DEVICE_UID in the sensor&apos;s firmware. Changing it here only
            affects this device — the server keeps recording from the sensor it was configured
            with.
          </Text>
        </View>

        {/* ---- Diagnostics ---- */}
        <View style={styles.group}>
          <Text style={styles.groupHeading}>Diagnostics</Text>
          <View style={styles.card}>
            <InfoRow styles={styles} label="Broker" value={broker ?? "Not configured"} />
            <InfoRow
              styles={styles}
              label="Server records from"
              value={status?.deviceUid ?? "Unknown"}
            />
            <InfoRow styles={styles} label="Telemetry topic" value={topics.telemetry} />
            <InfoRow styles={styles} label="Relay topic" value={topics.relaySet} />
            <InfoRow styles={styles} label="Status topic" value={topics.status} />
          </View>
        </View>

        <View style={{ height: 32 }} />
      </PullToRefresh>

      <ConfirmModal
        visible={confirmCutoff}
        icon="power"
        destructive
        title="Cut master power?"
        message={`This switches the relay on ${deviceUid} off, killing mains power to everything behind it.`}
        confirmText="Turn off"
        cancelText="Cancel"
        onConfirm={() => {
          setConfirmCutoff(false);
          void sendRelay(false);
        }}
        onCancel={() => setConfirmCutoff(false)}
      />

      <Modal
        visible={uidModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setUidModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <Pressable style={styles.backdrop} onPress={() => setUidModalVisible(false)}>
            <Pressable style={styles.modalCard} onPress={Keyboard.dismiss}>
              <View style={styles.modalIconWrap}>
                <Ionicons name="hardware-chip-outline" size={28} color={colors.accent} />
              </View>

              <Text style={styles.modalTitle}>Sensor ID</Text>
              <Text style={styles.modalMessage}>
                Enter the DEVICE_UID the board publishes under. This device will follow that
                sensor instead.
              </Text>

              <View style={styles.inputRow}>
                <TextInput
                  style={styles.input}
                  value={uidInput}
                  onChangeText={(text) => {
                    setUidInput(text);
                    if (uidError) setUidError(null);
                  }}
                  placeholder={DEFAULT_DEVICE_UID}
                  placeholderTextColor={colors.sub}
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={MAX_DEVICE_UID_LENGTH}
                  selectTextOnFocus
                  autoFocus
                  accessibilityLabel="Sensor ID"
                />
              </View>

              <Text style={uidError !== null ? styles.errorText : styles.hintText}>
                {uidError ?? DEVICE_UID_HINT}
              </Text>

              <View style={styles.modalActions}>
                <Pressable
                  style={styles.modalBtn}
                  onPress={() => setUidModalVisible(false)}
                  accessibilityRole="button"
                >
                  <Text style={[styles.modalBtnText, { color: colors.sub }]}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.modalBtn, styles.modalBtnPrimary]}
                  onPress={handleSaveUid}
                  accessibilityRole="button"
                >
                  <Text style={[styles.modalBtnText, { color: colors.bg }]}>Pair</Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </ScreenContainer>
  );
}

/** A labelled connection fact with a colour-coded verdict on the right. */
function StatusRow({
  styles,
  colors,
  icon,
  label,
  value,
  tone,
}: {
  styles: ReturnType<typeof createStyles>;
  colors: ThemeColors;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  tone: "good" | "warn" | "bad" | "muted";
}) {
  const tint =
    tone === "good"
      ? colors.green
      : tone === "warn"
        ? colors.amber
        : tone === "bad"
          ? colors.red
          : colors.sub;

  return (
    <View style={[styles.row, styles.rowDivider]}>
      <View style={styles.rowIcon}>
        <Ionicons name={icon} size={18} color={colors.sub} />
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle}>{label}</Text>
      </View>
      <Text style={[styles.rowValue, { color: tint }]}>{value}</Text>
    </View>
  );
}

/** One PZEM channel in the readings grid. */
function Metric({
  styles,
  label,
  value,
}: {
  styles: ReturnType<typeof createStyles>;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

/** Monospace-ish key/value line for the diagnostics card. */
function InfoRow({
  styles,
  label,
  value,
}: {
  styles: ReturnType<typeof createStyles>;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={1} ellipsizeMode="middle">
        {value}
      </Text>
    </View>
  );
}

function createStyles(colors: ThemeColors, fontScale: number) {
  return StyleSheet.create({
    flex: {
      flex: 1,
    },
    scroll: {
      paddingHorizontal: 20,
      paddingTop: 20,
    },
    banner: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
      marginBottom: 24,
    },
    bannerText: {
      fontSize: 13 * fontScale,
      lineHeight: 18 * fontScale,
      flex: 1,
    },
    bannerStrong: {
      fontWeight: "700",
    },
    group: {
      marginBottom: 24,
    },
    groupHeading: {
      color: colors.sub,
      fontSize: 12 * fontScale,
      fontWeight: "700",
      letterSpacing: 1,
      textTransform: "uppercase",
      marginBottom: 10,
      marginLeft: 4,
    },
    subHeading: {
      marginTop: 20,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
    },
    // ---- Link hero ----
    hero: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 14,
      padding: 16,
    },
    heroIcon: {
      width: 48,
      height: 48,
      borderRadius: 24,
      alignItems: "center",
      justifyContent: "center",
    },
    heroBody: {
      flex: 1,
    },
    heroTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    heroTitle: {
      color: colors.text,
      fontSize: 18 * fontScale,
      fontWeight: "700",
    },
    dot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    heroSubtitle: {
      color: colors.sub,
      fontSize: 13 * fontScale,
      lineHeight: 18 * fontScale,
      marginTop: 4,
    },
    // ---- Rows ----
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    rowDivider: {
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    rowIcon: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    rowBody: {
      flex: 1,
    },
    rowTitle: {
      color: colors.text,
      fontSize: 15 * fontScale,
      fontWeight: "600",
    },
    rowSubtitle: {
      color: colors.sub,
      fontSize: 12 * fontScale,
      lineHeight: 16 * fontScale,
      marginTop: 2,
    },
    rowValue: {
      color: colors.text,
      fontSize: 14 * fontScale,
      fontWeight: "700",
    },
    linkText: {
      color: colors.accent,
      fontSize: 14 * fontScale,
      fontWeight: "700",
    },
    pairedBadge: {
      backgroundColor: colors.accentSoft,
      borderRadius: 10,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    pairedBadgeText: {
      color: colors.accent,
      fontSize: 11 * fontScale,
      fontWeight: "700",
    },
    footnote: {
      color: colors.sub,
      fontSize: 12 * fontScale,
      lineHeight: 17 * fontScale,
      marginTop: 8,
      marginLeft: 4,
    },
    empty: {
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 24,
      paddingVertical: 24,
    },
    emptyText: {
      color: colors.sub,
      fontSize: 13 * fontScale,
      lineHeight: 18 * fontScale,
      textAlign: "center",
    },
    // ---- Readings ----
    metricGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      padding: 8,
    },
    metric: {
      width: "33.33%",
      paddingHorizontal: 8,
      paddingVertical: 10,
      gap: 4,
    },
    metricLabel: {
      color: colors.sub,
      fontSize: 11 * fontScale,
      fontWeight: "600",
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    metricValue: {
      color: colors.text,
      fontSize: 15 * fontScale,
      fontWeight: "700",
      fontVariant: ["tabular-nums"],
    },
    sourceRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    sourceText: {
      color: colors.sub,
      fontSize: 12 * fontScale,
      lineHeight: 16 * fontScale,
      flex: 1,
    },
    // ---- Relay ----
    relayRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      paddingHorizontal: 16,
      paddingVertical: 16,
    },
    relayBtn: {
      minWidth: 92,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 12,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    relayBtnText: {
      fontSize: 14 * fontScale,
      fontWeight: "700",
    },
    // ---- Diagnostics ----
    infoRow: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      gap: 2,
    },
    infoLabel: {
      color: colors.sub,
      fontSize: 11 * fontScale,
      fontWeight: "600",
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    infoValue: {
      color: colors.text,
      fontSize: 13 * fontScale,
      fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    },
    // ---- Pairing editor ----
    backdrop: {
      flex: 1,
      backgroundColor: colors.overlay,
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
    },
    modalCard: {
      width: "100%",
      maxWidth: 340,
      backgroundColor: colors.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 20,
      alignItems: "center",
    },
    modalIconWrap: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.accentSoft,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 12,
    },
    modalTitle: {
      color: colors.text,
      fontSize: 17 * fontScale,
      fontWeight: "700",
      textAlign: "center",
    },
    modalMessage: {
      color: colors.sub,
      fontSize: 13 * fontScale,
      lineHeight: 18 * fontScale,
      textAlign: "center",
      marginTop: 6,
    },
    inputRow: {
      alignSelf: "stretch",
      marginTop: 16,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    input: {
      color: colors.text,
      fontSize: 17 * fontScale,
      fontWeight: "600",
      padding: 0,
    },
    hintText: {
      color: colors.sub,
      fontSize: 12 * fontScale,
      lineHeight: 16 * fontScale,
      marginTop: 10,
      textAlign: "center",
    },
    errorText: {
      color: colors.red,
      fontSize: 12 * fontScale,
      lineHeight: 16 * fontScale,
      marginTop: 10,
      textAlign: "center",
    },
    modalActions: {
      flexDirection: "row",
      alignSelf: "stretch",
      gap: 10,
      marginTop: 18,
    },
    modalBtn: {
      flex: 1,
      paddingVertical: 11,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
    },
    modalBtnPrimary: {
      backgroundColor: colors.accent,
    },
    modalBtnText: {
      fontSize: 14 * fontScale,
      fontWeight: "700",
    },
  });
}

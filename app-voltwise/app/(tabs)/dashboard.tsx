import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  FlatList,
  Animated,
  Easing,
  LayoutAnimation,
  Platform,
  UIManager,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api, checkHealth, DashboardData, DashboardDevice, Reading } from "../../lib/api";
import { useMqtt } from "../../context/MqttContext";
import { useDemoData } from "../../context/DemoDataContext";
import { demoDashboard, demoLiveReading } from "../../lib/demo-data";
import RangeNavigator from "../../components/RangeNavigator";
import DeviceUsageChart from "../../components/DeviceUsageChart";
import { getStoredBillingCycle, saveBillingCycle } from "../../lib/billing-storage";
import {
  defaultRangeState,
  dotRadiusFor,
  axisLabelStep,
  rangeLabel,
  rangeQuery,
  thinLabels,
  type BillingCycle,
  type RangeState,
} from "../../lib/range-prefs";
import { RELAY_REASON_LABELS } from "../../lib/iot-prefs";
import AppHeader from "../../components/AppHeader";
import { PullToRefresh } from "../../components/pull-to-refresh";
import { usePullToRefresh } from "../../hooks/usePullToRefresh";
import { useTheme } from "../../context/ThemeContext";
import { useUnits } from "../../context/UnitsContext";
import { usePowerControl } from "../../context/PowerControlContext";
import { useThemedStyles } from "../../components/themed";
import type { ThemeColors } from "../../constants/theme";

// Enable LayoutAnimation on Android.
if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// Metric display definitions — order determines grid order.
const METRIC_DEFS: {
  key: keyof Omit<Reading, "timestamp">;
  label: string;
  unit: string;
  decimals: number;
}[] = [
  { key: "voltage",     label: "Voltage",      unit: "V",   decimals: 1 },
  { key: "current",     label: "Current",      unit: "A",   decimals: 2 },
  { key: "activePower", label: "Active Power", unit: "W",   decimals: 1 },
  { key: "energy",      label: "Energy",       unit: "kWh", decimals: 2 },
  { key: "frequency",   label: "Frequency",    unit: "Hz",  decimals: 2 },
  { key: "powerFactor", label: "Power Factor", unit: "PF",  decimals: 2 },
];


type PillStatus = "online" | "offline" | "degraded" | "unknown";

function StatusPill({ label, status }: { label: string; status: PillStatus }) {
  const { colors } = useTheme();
  const pillSt = useThemedStyles(createPillStyles);
  const dot  = status === "online" ? colors.accent : status === "offline" ? colors.red : status === "degraded" ? colors.amber : colors.sub;
  const bg   = status === "online" ? colors.accent + "26" : status === "offline" ? colors.red + "26" : status === "degraded" ? colors.amber + "26" : colors.card;
  const clr  = status === "online" ? colors.accent : status === "offline" ? colors.red : status === "degraded" ? colors.amber : colors.sub;
  return (
    <View style={[pillSt.pill, { backgroundColor: bg }]}>
      <View style={[pillSt.dot, { backgroundColor: dot }]} />
      <Text style={[pillSt.text, { color: clr }]}>{label}</Text>
    </View>
  );
}

function createPillStyles(colors: ThemeColors, fontScale: number) {
  return StyleSheet.create({
    pill: { flexDirection: "row", alignItems: "center", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, gap: 5 },
    dot:  { width: 7, height: 7, borderRadius: 4 },
    text: { fontSize: 12 * fontScale, fontWeight: "700", letterSpacing: 0.5 },
  });
}

type LiveMetrics = Omit<Reading, "timestamp">;

// Telemetry older than this is stale — the device publishes every ~2 s, so a
// 10 s gap means the feed is effectively down and the UI must say so.
const TELEMETRY_FRESH_MS = 10_000;

// What is currently driving the live metrics. There is no third option on
// purpose: either real PZEM telemetry is arriving, or the panel shows nothing.
// The UI must never invent a reading.
//   "mqtt" — real PZEM telemetry streaming from the broker
//   "off"  — no live feed; metrics render as "—"
type LiveSource = "mqtt" | "off";

// Reachability of the ESP32 as the UI reports it:
//   "live"    — fresh MQTT telemetry; relay commands will land
//   "nolink"  — backend claims it's up but nothing is arriving over MQTT
//   "unknown" — still resolving on first load
//   "offline" — the device is not there
type IotState = "live" | "nolink" | "unknown" | "offline";

export default function DashboardScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { formatPower, formatEnergy, formatCostOf, powerParts, energyParts } = useUnits();
  const { demoData } = useDemoData();
  // null until the backend or the sensor supplies a real figure.
  const [currentKw, setCurrentKw]         = useState<number | null>(null);
  // Which slice of time the chart is showing. Always opens on today — see
  // defaultRangeState — and the saved billing cycle is folded in once it loads.
  const [range, setRange]                 = useState<RangeState>(() => defaultRangeState("Day"));
  const [dashboard, setDashboard]         = useState<DashboardData | null>(null);
  // Card starts expanded (true).
  const [expanded, setExpanded]           = useState(true);
  // null until real telemetry arrives — the grid renders "—" until then.
  const [liveMetrics, setLiveMetrics]     = useState<LiveMetrics | null>(null);

  const [serverOnline, setServerOnline] = useState<boolean | null>(null);
  const [iotOnline, setIotOnline]       = useState<boolean | null>(null);

  // Real-time IoT feed (direct MQTT subscription to the broker).
  const { telemetry, telemetryAt, relayState } = useMqtt();
  const {
    masterOn,
    highOn,
    lowOn,
    pending: powerPending,
    isOffline: powerOffline,
    toggleMaster,
  } = usePowerControl();
  const [liveSource, setLiveSource] = useState<LiveSource>("off");
  // Read inside the interval tick without re-creating the interval.
  const telemetryAtRef = useRef<number | null>(null);

  const intervalRef       = useRef<ReturnType<typeof setInterval> | null>(null);
  const healthIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Animated value for the expand/collapse body: 0 = collapsed, 1 = expanded.
  const expandAnim      = useRef(new Animated.Value(1)).current;
  // Animated value for chevron rotation.
  const chevronAnim     = useRef(new Animated.Value(1)).current;

  // Load the user's saved billing window once, so the Bill tab opens on their
  // real cycle instead of the current-month default.
  useEffect(() => {
    let cancelled = false;
    getStoredBillingCycle().then((cycle) => {
      if (cycle && !cancelled) setRange((prev) => ({ ...prev, cycle }));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCycleSave = useCallback((cycle: BillingCycle) => {
    void saveBillingCycle(cycle);
  }, []);

  const rangeKey = rangeQuery(range);

  // Fetch dashboard data — shared by the range effect below and pull-to-refresh.
  const fetchDashboard = useCallback(async () => {
    const data = await api.get<DashboardData>(`/dashboard?${rangeKey}`);
    setDashboard(data);
    setCurrentKw(data.currentKw);
    setIotOnline(data.iotOnline ?? false);
  }, [rangeKey]);

  // Refetch whenever the selected range changes.
  useEffect(() => {
    fetchDashboard().catch(() => {
      // Offline-first: keep whatever was last shown rather than inventing data.
    });
  }, [fetchDashboard]);

  // A pull refreshes the data and re-checks liveness in one go — allSettled so
  // one failing call never hides the other's result.
  const refreshDashboard = useCallback(async () => {
    await Promise.allSettled([
      fetchDashboard(),
      checkHealth().then(setServerOnline),
    ]);
  }, [fetchDashboard]);

  const { refreshing, onRefresh } = usePullToRefresh(refreshDashboard);

  // Server health polling — immediate on mount, then every 15 seconds.
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      const alive = await checkHealth();
      if (!cancelled) setServerOnline(alive);
    };
    poll();
    healthIntervalRef.current = setInterval(poll, 15_000);
    return () => {
      cancelled = true;
      if (healthIntervalRef.current) clearInterval(healthIntervalRef.current);
    };
  }, []);

  // Apply real MQTT telemetry the moment it arrives: the six PZEM metrics and
  // the hero kW value come straight from the sensor. This is the only place
  // liveMetrics is ever populated.
  useEffect(() => {
    if (!telemetry || telemetryAt === null) return;
    telemetryAtRef.current = telemetryAt;
    setLiveSource("mqtt");
    setCurrentKw(Math.round((telemetry.watts / 1000) * 100) / 100);
    setLiveMetrics((prev) => ({
      voltage:     telemetry.voltage     ?? prev?.voltage     ?? 0,
      current:     telemetry.current     ?? prev?.current     ?? 0,
      activePower: telemetry.watts,
      energy:      telemetry.kwh,
      frequency:   telemetry.frequency   ?? prev?.frequency   ?? 0,
      powerFactor: telemetry.powerFactor ?? prev?.powerFactor ?? 0,
    }));
  }, [telemetry, telemetryAt]);


  // 2-second tick that only classifies the feed: telemetry is either fresh
  // enough to show, or it is not. Nothing is generated here.
  useEffect(() => {
    const tick = () => {
      const fresh =
        telemetryAtRef.current !== null &&
        Date.now() - telemetryAtRef.current < TELEMETRY_FRESH_MS;

      setLiveSource(fresh ? "mqtt" : "off");

      // Drop stale readings rather than leaving the last live values on screen
      // looking current.
      if (!fresh) {
        setLiveMetrics(null);
      }
    };

    tick();
    intervalRef.current = setInterval(tick, 2000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [iotOnline]);


  function toggleExpanded() {
    const next = !expanded;
    Animated.timing(expandAnim, {
      toValue: next ? 1 : 0,
      duration: next ? 220 : 180,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
    Animated.timing(chevronAnim, {
      toValue: next ? 1 : 0,
      duration: next ? 200 : 160,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(next);
  }

  const chevronRotate = chevronAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "180deg"],
  });

  // Single reachability judgement, shared by the status pill and the Master
  // Power card so the two can never contradict each other. Real telemetry
  // beats the backend's opinion; the simulation is shown honestly as degraded.
  // ── Sample data ───────────────────────────────────────────────────────────
  // A render-time overlay only: the fetched payload and the live telemetry stay
  // in state underneath, so switching it back off restores the real screen with
  // nothing to re-fetch. Memoised on the period because the chart must not be
  // handed a freshly-built array on every render.
  const demoDash = useMemo(
    () => (demoData ? demoDashboard(range, undefined, { highOn, lowOn }) : null),
    [demoData, range, highOn, lowOn]
  );
  const demoReading = useMemo(
    () => (demoData ? demoLiveReading(undefined, { highOn, lowOn }) : null),
    [demoData, highOn, lowOn]
  );
  const view = demoDash ?? dashboard;

  const iotState: IotState = demoData
    ? "live"
    : liveSource === "mqtt"
      ? "live"
      : iotOnline === true
        ? "nolink"
        : iotOnline === null && telemetryAt === null
          ? "unknown"
          : "offline";
  // Only a live MQTT feed means commands can actually reach the firmware.
  const iotReachable = iotState === "live";
  // Whether the Current Usage card gets to claim a live feed.
  const liveFeedOn = demoData || liveSource !== "off";
  // The six PZEM metrics and the hero figure, from the sample set or the sensor.
  const displayMetrics = demoReading ?? liveMetrics;
  const displayKw = demoData ? demoDash?.currentKw ?? null : currentKw;

  // Master relay display state driven by unified PowerControlContext
  const relayOn = masterOn;
  const relayPending = powerPending;
  const relayReasonLabel = relayOn
    ? "Power is flowing to your loads"
    : RELAY_REASON_LABELS[relayState?.reason ?? ""] ?? "All circuits powered off";

  // Button is ONLY clickable if in Demo Mode OR if IoT is reachable:
  // "buttons should not be clicked if it is offline, and no offline manuever, what I said there is a show sample data in the lab if I turn that on I can demo the feature, if not then it stays offline and not clickable since it is offline"
  const relayControlDisabled = demoData ? false : relayPending || !iotReachable;
  const relayButtonLabel = !iotReachable && !demoData
    ? iotState === "unknown"
      ? "..."
      : "OFFLINE"
    : relayOn
      ? "ON"
      : "CLOSE";

  const relaySubtitle = demoData
    ? `Sample Data Demo — ${relayOn ? "whole-home power simulated" : "all circuits de-energized"}`
    : !iotReachable
      ? iotState === "unknown"
        ? "Checking device..."
        : `${iotState === "offline" ? "Device offline" : "No live link to device"} · control unavailable`
      : relayPending
        ? "Waiting for device confirmation..."
        : relayReasonLabel;

  const relayTint = !iotReachable && !demoData
    ? colors.sub
    : relayOn
      ? colors.accent
      : colors.red;

  const iotPill: { label: string; status: PillStatus } =
    iotState === "live"
      ? { label: "IoT Live", status: "online" }
      : iotState === "nolink"
        ? { label: "IoT No Link", status: "degraded" }
        : iotState === "unknown"
          ? { label: "IoT...", status: "unknown" }
          : { label: "IoT Offline", status: "offline" };

  // Chart data comes from the backend or not at all — an empty chart is the
  // honest answer when there are no readings, and a demo curve here would be
  const visibleLabels  = view?.deviceHistory.labels ?? [];
  const deviceSeries   = view?.deviceHistory.series ?? [];
  const devices        = view?.devices        ?? [];
  const topConsumers   = view?.topConsumers   ?? [];
  const totalToday     = view?.totalTodayKwh  ?? 0;

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      {/* Brand header — logo + interactive bell/profile. Sits outside the
          scroller so it stays pinned while the content pulls down. */}
      <View style={styles.headerBar}>
        <AppHeader />
      </View>

      <PullToRefresh
        refreshing={refreshing}
        onRefresh={onRefresh}
        contentContainerStyle={styles.scroll}
        indicatorColor={colors.accent}
      >
        {/* Status Row */}
        <View style={styles.statusRow}>
          <StatusPill
            label={
              demoData
                ? "Server Live"
                : serverOnline === null
                  ? "Server..."
                  : serverOnline
                    ? "Server Live"
                    : "Server Offline"
            }
            status={
              demoData ? "online" : serverOnline === null ? "unknown" : serverOnline ? "online" : "offline"
            }
          />
          <StatusPill label={iotPill.label} status={iotPill.status} />
        </View>

        {/* Current Usage Card — hero always visible, metric grid collapsible */}
        <View style={styles.usageCard}>
          {/* Always-visible hero row */}
          <View style={styles.usageCardTop}>
            <Text style={styles.usageLabel}>Current{"\n"}Usage</Text>
            <View style={styles.usageTopRight}>
              {liveFeedOn ? (
                <View style={styles.livePill}>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveText}>LIVE</Text>
                </View>
              ) : (
                <View style={styles.offlinePill}>
                  <View style={styles.offlineDot} />
                  <Text style={styles.offlineText}>OFFLINE</Text>
                </View>
              )}
              {/* Collapse toggle chevron */}
              <TouchableOpacity
                onPress={toggleExpanded}
                style={styles.chevronBtn}
                accessibilityRole="button"
                accessibilityLabel={expanded ? "Collapse sensor metrics" : "Expand sensor metrics"}
                accessibilityState={{ expanded }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Animated.View style={{ transform: [{ rotate: chevronRotate }] }}>
                  <Ionicons name="chevron-down" size={20} color={colors.sub} />
                </Animated.View>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.kwRow}>
            {/* currentKw is kW; the formatter works in watts. Null until a real
                figure arrives — the hero never shows a placeholder number. */}
            <Text style={styles.kwValue}>
              {displayKw === null ? "—" : powerParts(displayKw * 1000).value}
            </Text>
            <Text style={styles.kwUnit}>
              {displayKw === null ? "" : powerParts(displayKw * 1000).unit}
            </Text>
          </View>
          <Text style={styles.totalToday}>
            Total today: {formatEnergy(totalToday, 1)}
          </Text>

          {/* Collapsible metric grid — 3 columns x 2 rows */}
          {expanded && (
            <Animated.View
              style={[
                styles.metricGrid,
                {
                  opacity: expandAnim,
                  transform: [
                    {
                      translateY: expandAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [-8, 0],
                      }),
                    },
                  ],
                },
              ]}
            >
              {METRIC_DEFS.map((def) => {
                const raw = displayMetrics?.[def.key];
                // No sensor reading — show the absence rather than a number
                // the system cannot stand behind.
                const parts =
                  raw === undefined
                    ? { value: "—", unit: def.unit }
                    : def.key === "activePower"
                      ? powerParts(raw)
                      : def.key === "energy"
                        ? energyParts(raw, def.decimals)
                        : { value: raw.toFixed(def.decimals), unit: def.unit };
                return (
                  <View key={def.key} style={styles.metricCell}>
                    <Text style={styles.metricValue}>
                      {parts.value}
                      <Text style={styles.metricUnit}> {parts.unit}</Text>
                    </Text>
                    <Text style={styles.metricLabel}>{def.label}</Text>
                  </View>
                );
              })}
            </Animated.View>
          )}
        </View>

        {/* Master Power — remote relay control for the whole-home feed */}
        <View style={styles.relayCard}>
          <View
            style={[
              styles.relayIconWrap,
              { backgroundColor: relayTint + "26" },
            ]}
          >
            <Ionicons
              name={iotReachable ? "flash" : "cloud-offline"}
              size={22}
              color={relayTint}
            />
          </View>
          <View style={styles.relayTextWrap}>
            <View style={styles.relayTitleRow}>
              <Text style={styles.relayTitle}>Master Power</Text>
              {demoData ? (
                <View
                  style={[
                    styles.relayBadge,
                    { backgroundColor: colors.accent + "26" },
                  ]}
                >
                  <Text style={[styles.relayBadgeText, { color: colors.accent }]}>
                    DEMO
                  </Text>
                </View>
              ) : powerOffline ? (
                <View
                  style={[
                    styles.relayBadge,
                    { backgroundColor: colors.red + "26" },
                  ]}
                >
                  <Text style={[styles.relayBadgeText, { color: colors.red }]}>
                    OFFLINE
                  </Text>
                </View>
              ) : (
                <View
                  style={[
                    styles.relayBadge,
                    { backgroundColor: colors.green + "26" },
                  ]}
                >
                  <Text style={[styles.relayBadgeText, { color: colors.green }]}>
                    LIVE
                  </Text>
                </View>
              )}
            </View>
            <Text style={styles.relaySubtitle}>{relaySubtitle}</Text>

            {/* Dual-line status indicators */}
            <View style={styles.lineBadgesRow}>
              <View style={styles.lineBadgeItem}>
                <View
                  style={[
                    styles.lineBadgeDot,
                    { backgroundColor: highOn ? colors.green : colors.red },
                  ]}
                />
                <Text style={styles.lineBadgeText}>
                  High: {highOn ? "ON" : "OFF"}
                </Text>
              </View>
              <View style={styles.lineBadgeItem}>
                <View
                  style={[
                    styles.lineBadgeDot,
                    { backgroundColor: lowOn ? colors.green : colors.red },
                  ]}
                />
                <Text style={styles.lineBadgeText}>
                  Low: {lowOn ? "ON" : "OFF"}
                </Text>
              </View>
            </View>
          </View>
          {/* Tap-to-toggle power button */}
          <TouchableOpacity
            onPress={() => toggleMaster(!relayOn)}
            disabled={relayControlDisabled}
            activeOpacity={0.7}
            style={[
              styles.relayButton,
              {
                backgroundColor: relayTint + "1F",
                borderColor: relayTint,
                opacity: relayControlDisabled ? 0.5 : 1,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Master power relay"
            accessibilityState={{ disabled: relayControlDisabled }}
            accessibilityHint={
              demoData || iotReachable
                ? `Turns master power ${relayOn ? "off" : "on"}`
                : "Unavailable — the IoT device is offline"
            }
          >
            <Ionicons name="power" size={24} color={relayTint} />
            <Text style={[styles.relayButtonLabel, { color: relayTint }]}>
              {relayButtonLabel}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Device Cards */}
        {devices.length === 0 ? (
          <View style={styles.emptyStrip}>
            <Ionicons name="flash-outline" size={16} color={colors.sub} />
            <Text style={styles.emptyStripText}>
              No devices registered — add them in the Devices tab.
            </Text>
          </View>
        ) : (
        <FlatList
          data={devices}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.deviceList}
          renderItem={({ item }: { item: DashboardDevice }) => (
            <View style={styles.deviceCard}>
              <View style={styles.deviceStatusRow}>
                <View
                  style={[
                    styles.statusDot,
                    { backgroundColor: item.active ? colors.accent : colors.yellow },
                  ]}
                />
                <Text style={styles.deviceStatus}>
                  {item.active ? "Active" : "Standby"}
                </Text>
              </View>
              <Text style={styles.deviceName}>{item.name}</Text>
              <Text style={styles.deviceWatts}>{formatPower(item.watts)}</Text>
            </View>
          )}
        />
        )}

        {/* Usage History */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Usage History</Text>
          </View>

          {/* Period + timeline. Shared with Analytics so the two screens can
              never describe time differently. */}
          <View style={styles.navigatorWrap}>
            <RangeNavigator
              state={range}
              onChange={setRange}
              onCycleSave={handleCycleSave}
            />
          </View>

          <DeviceUsageChart
            labels={visibleLabels}
            series={deviceSeries}
            period={range.period}
            rangeLabelText={rangeLabel(range)}
          />
        </View>

        {/* Top Consumers */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Top Consumers</Text>
          <View style={styles.consumersCard}>
            {topConsumers.length === 0 && (
              <Text style={styles.emptyStripText}>
                No consumption data yet — readings will appear once your devices
                report usage.
              </Text>
            )}
            {topConsumers.map((item) => (
              <View key={item.id} style={styles.consumerRow}>
                <View
                  style={[styles.consumerDot, { backgroundColor: item.color }]}
                />
                <Text style={styles.consumerName}>{item.name}</Text>
                <View style={styles.consumerBarBg}>
                  <View
                    style={[
                      styles.consumerBar,
                      { width: `${item.pct}%`, backgroundColor: item.color },
                    ]}
                  />
                </View>
                <View style={styles.consumerRight}>
                  <Text style={styles.consumerPct}>{item.pct}%</Text>
                  {/* Priced from kWh at the user's own tariff rather than the
                      API's cost field, so a rate change shows up immediately. */}
                  <Text style={styles.consumerCost}>{formatCostOf(item.kwh)}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        <View style={{ height: 16 }} />
      </PullToRefresh>
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors, fontScale: number) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.bg,
    },
    // The header carries the top padding now that it lives outside the
    // scroller; its own marginBottom supplies the gap to the status row.
    headerBar: {
      paddingHorizontal: 16,
      paddingTop: 8,
    },
    scroll: {
      paddingHorizontal: 16,
    },
    statusRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 12,
    },
    usageCard: {
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 20,
      marginBottom: 16,
    },
    usageCardTop: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      marginBottom: 12,
    },
    usageTopRight: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    usageLabel: {
      color: colors.sub,
      fontSize: 14 * fontScale,
      lineHeight: 20 * fontScale,
    },
    livePill: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.accentSoft,
      borderRadius: 20,
      paddingHorizontal: 10,
      paddingVertical: 4,
      gap: 5,
    },
    liveDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: colors.accent,
    },
    liveText: {
      color: colors.accent,
      fontSize: 12 * fontScale,
      fontWeight: "700",
      letterSpacing: 0.5,
    },
    offlinePill: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.surface,
      borderRadius: 20,
      paddingHorizontal: 10,
      paddingVertical: 4,
      gap: 5,
    },
    offlineDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: colors.sub,
    },
    offlineText: {
      color: colors.sub,
      fontSize: 12 * fontScale,
      fontWeight: "700",
      letterSpacing: 0.5,
    },
    chevronBtn: {
      padding: 4,
      alignItems: "center",
      justifyContent: "center",
      minWidth: 28,
      minHeight: 28,
    },
    kwRow: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: 6,
      marginBottom: 8,
    },
    kwValue: {
      color: colors.text,
      fontSize: 52 * fontScale,
      fontWeight: "700",
      lineHeight: 56 * fontScale,
    },
    kwUnit: {
      color: colors.text,
      fontSize: 22 * fontScale,
      fontWeight: "500",
      marginBottom: 6,
    },
    totalToday: {
      color: colors.sub,
      fontSize: 14 * fontScale,
    },
    // Metric grid: 3 columns.
    metricGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      marginTop: 16,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      paddingTop: 16,
      gap: 0,
    },
    metricCell: {
      width: "33.33%",
      paddingVertical: 8,
      paddingHorizontal: 4,
      alignItems: "flex-start",
    },
    metricValue: {
      color: colors.text,
      fontSize: 16 * fontScale,
      fontWeight: "700",
      lineHeight: 20 * fontScale,
    },
    metricUnit: {
      color: colors.sub,
      fontSize: 12 * fontScale,
      fontWeight: "400",
    },
    metricLabel: {
      color: colors.sub,
      fontSize: 11 * fontScale,
      marginTop: 3,
    },
    relayCard: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 16,
      marginBottom: 16,
      gap: 12,
    },
    relayIconWrap: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
    },
    relayTextWrap: {
      flex: 1,
    },
    relayTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 2,
    },
    relayTitle: {
      color: colors.text,
      fontSize: 15 * fontScale,
      fontWeight: "700",
    },
    relayBadge: {
      borderRadius: 20,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    relayBadgeText: {
      fontSize: 10 * fontScale,
      fontWeight: "700",
      letterSpacing: 0.5,
    },
    relayButton: {
      width: 64,
      height: 64,
      borderRadius: 32,
      borderWidth: 2,
      alignItems: "center",
      justifyContent: "center",
      gap: 1,
    },
    relayButtonLabel: {
      fontSize: 10 * fontScale,
      fontWeight: "800",
      letterSpacing: 0.6,
    },
    relaySubtitle: {
      color: colors.sub,
      fontSize: 12 * fontScale,
    },
    lineBadgesRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginTop: 8,
      paddingTop: 8,
      borderTopWidth: 1,
      borderTopColor: colors.border + "80",
    },
    lineBadgeItem: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.surface,
      paddingHorizontal: 7,
      paddingVertical: 3,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 5,
    },
    lineBadgeDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    lineBadgeText: {
      fontSize: 10 * fontScale,
      fontWeight: "600",
      color: colors.text,
    },
    deviceList: {
      gap: 10,
      paddingRight: 4,
      marginBottom: 24,
    },
    emptyStrip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: colors.card,
      borderRadius: 14,
      padding: 14,
      marginBottom: 24,
    },
    emptyStripText: {
      color: colors.sub,
      fontSize: 13 * fontScale,
      flex: 1,
    },
    deviceCard: {
      backgroundColor: colors.card,
      borderRadius: 14,
      padding: 14,
      width: 120,
    },
    deviceStatusRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      marginBottom: 8,
    },
    statusDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
    },
    deviceStatus: {
      color: colors.sub,
      fontSize: 12 * fontScale,
    },
    deviceName: {
      color: colors.text,
      fontSize: 15 * fontScale,
      fontWeight: "600",
      marginBottom: 4,
    },
    deviceWatts: {
      color: colors.text,
      fontSize: 18 * fontScale,
      fontWeight: "700",
    },
    section: {
      marginBottom: 24,
    },
    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 12,
    },
    sectionTitle: {
      color: colors.text,
      fontSize: 18 * fontScale,
      fontWeight: "700",
    },
    navigatorWrap: {
      marginBottom: 12,
    },
    consumersCard: {
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 16,
      gap: 14,
    },
    consumerRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    consumerDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
    },
    consumerName: {
      color: colors.text,
      fontSize: 13 * fontScale,
      width: 120,
    },
    consumerBarBg: {
      flex: 1,
      height: 6,
      backgroundColor: colors.border,
      borderRadius: 3,
      overflow: "hidden",
    },
    consumerBar: {
      height: 6,
      borderRadius: 3,
    },
    consumerRight: {
      alignItems: "flex-end",
      width: 60,
    },
    consumerPct: {
      color: colors.sub,
      fontSize: 12 * fontScale,
      textAlign: "right",
    },
    consumerCost: {
      color: colors.text,
      fontSize: 11 * fontScale,
      fontWeight: "600",
      marginTop: 2,
      textAlign: "right",
    },
  });
}

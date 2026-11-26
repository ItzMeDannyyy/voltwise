import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Easing,
  LayoutAnimation,
  Platform,
  UIManager,
  DeviceEventEmitter,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  api,
  checkHealth,
  ApiDevice,
  ApiDeviceReading,
  DashboardData,
  DashboardDevice,
  Reading,
  DEVICES_CHANGED_EVENT,
} from "../../lib/api";
import { useMqtt } from "../../context/MqttContext";
import { useDemoData } from "../../context/DemoDataContext";
import {
  DEMO_HIGH_LINE_IDS,
  DEMO_LOW_LINE_IDS,
  demoDashboard,
  demoLiveReading,
} from "../../lib/demo-data";
import RangeNavigator from "../../components/RangeNavigator";
import DeviceUsageChart from "../../components/DeviceUsageChart";
import { getStoredBillingCycle, saveBillingCycle } from "../../lib/billing-storage";
import {
  defaultRangeState,
  rangeLabel,
  rangeQuery,
  type BillingCycle,
  type RangeState,
} from "../../lib/range-prefs";
import { RELAY_REASON_LABELS, TELEMETRY_FRESH_MS } from "../../lib/iot-prefs";
import AppHeader from "../../components/AppHeader";
import PowerPlaneClusterMap from "../../components/PowerPlaneClusterMap";
import { PullToRefresh } from "../../components/pull-to-refresh";
import { usePullToRefresh } from "../../hooks/usePullToRefresh";
import { useTheme } from "../../context/ThemeContext";
import { useUnits } from "../../context/UnitsContext";
import { usePowerControl } from "../../context/PowerControlContext";
import { AlertCircle, ChevronRight } from "../../components/LucideIcons";
import { useThemedStyles } from "../../components/themed";
import type { ThemeColors } from "../../constants/theme";

// Enable LayoutAnimation on Android.
if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Metric display definitions — order determines grid order.
const METRIC_DEFS: {
  key: keyof Omit<Reading, "timestamp">;
  label: string;
  unit: string;
  decimals: number;
}[] = [
  { key: "voltage",     label: "Voltage",      unit: "V",   decimals: 1 },
  { key: "current",     label: "Current",      unit: "A",   decimals: 2 },
  { key: "activePower", label: "Active Power", unit: "W",   decimals: 2 },
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
  const router = useRouter();
  const { formatEnergy, formatCostOf, powerParts, energyParts, prefs } = useUnits();
  const { demoData } = useDemoData();
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
  const { telemetry, telemetryAt, relayState, lastEvent } = useMqtt();

  const powerPlaneEvent =
    lastEvent?.type === "power_plane_event" ? lastEvent.event : null;
  const powerPlaneCandidates =
    lastEvent?.type === "power_plane_event" ? lastEvent.candidates : undefined;
  const {
    masterOn,
    highOn,
    lowOn,
    isStaggering,
    staggerSeconds,
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
    const [data, deviceList] = await Promise.all([
      api.get<DashboardData>(`/dashboard?${rangeKey}`),
      api.get<ApiDevice[]>("/devices").catch(() => null),
    ]);

    const baseDevices = data.devices ?? [];
    const deviceMetaMap = new Map(
      (deviceList ?? []).map((d) => [String(d.id), d])
    );

    const readingsEntries = await Promise.all(
      baseDevices.map(async (d) => {
        try {
          const reading = await api.get<ApiDeviceReading | null>(
            `/devices/${d.id}/readings/latest`
          );
          return [String(d.id), reading] as const;
        } catch {
          return [String(d.id), null] as const;
        }
      })
    );
    const readingsMap = new Map(readingsEntries);

    const enrichedDevices: DashboardDevice[] = baseDevices.map((d) => {
      const meta = deviceMetaMap.get(String(d.id));
      const reading = readingsMap.get(String(d.id));
      const status = meta?.status ?? (d.active ? "ACTIVE" : "IDLE");
      const active = status === "ACTIVE";
      const watts = active ? (reading?.watts ?? d.watts) : 0;
      return {
        ...d,
        watts,
        active,
        room: meta?.room ?? d.room,
        category: meta?.category ?? d.category ?? null,
        status,
        voltage: reading?.voltage ?? d.voltage ?? null,
        current: reading?.current ?? d.current ?? null,
        frequency: reading?.frequency ?? d.frequency ?? null,
        powerFactor: reading?.powerFactor ?? d.powerFactor ?? null,
        todayKwh: reading?.todayKwh ?? d.todayKwh ?? null,
        totalKwh: reading?.kwh ?? d.totalKwh ?? null,
        costToday: reading?.costToday ?? d.costToday ?? null,
        lastActiveAt: reading?.timestamp ?? d.lastActiveAt ?? null,
      };
    });

    setDashboard({ ...data, devices: enrichedDevices });
    setIotOnline(data.iotOnline ?? false);
  }, [rangeKey]);

  // Refetch whenever the selected range changes.
  useEffect(() => {
    fetchDashboard().catch(() => {
      // Offline-first: keep whatever was last shown rather than inventing data.
    });
  }, [fetchDashboard]);

  // Refetch whenever devices change (added, edited, deleted) so changes reflect immediately
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(DEVICES_CHANGED_EVENT, () => {
      fetchDashboard().catch(() => {});
    });
    return () => sub.remove();
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
  // the hero Current Usage figure share `liveMetrics.activePower` directly from
  // the sensor so they always match down to 2 decimal places.
  useEffect(() => {
    if (!telemetry || telemetryAt === null) return;
    telemetryAtRef.current = telemetryAt;
    setLiveSource("mqtt");
    setLiveMetrics((prev) => ({
      voltage:     telemetry.voltage     ?? prev?.voltage     ?? 0,
      current:     telemetry.current     ?? prev?.current     ?? 0,
      activePower: telemetry.watts,
      energy:      telemetry.totalKwh ?? telemetry.kwh,
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
  // The six PZEM metrics and the Current Usage hero read from the exact same
  // live telemetry reading (`displayMetrics.activePower`), formatted to 2 decimal places.
  const displayMetrics = demoReading ?? liveMetrics;
  const heroPowerParts =
    displayMetrics !== null && displayMetrics !== undefined
      ? powerParts(displayMetrics.activePower, 2)
      : null;

  // Master relay display state driven by unified PowerControlContext
  const relayOn = masterOn;
  const relayPending = powerPending || isStaggering;
  const relayReasonLabel = relayOn
    ? "Power is connected to your appliances"
    : RELAY_REASON_LABELS[relayState?.reason ?? ""] ?? "All circuits powered off";

  // Button is ONLY clickable if in Demo Mode OR if IoT is reachable:
  // "buttons should not be clicked if it is offline, and no offline manuever, what I said there is a show sample data in the lab if I turn that on I can demo the feature, if not then it stays offline and not clickable since it is offline"
  const relayControlDisabled = demoData ? false : relayPending || !iotReachable;
  const relayButtonLabel = !iotReachable && !demoData
    ? iotState === "unknown"
      ? "..."
      : "OFFLINE"
    : isStaggering
      ? "WAIT"
      : relayPending
        ? "..."
        : relayOn
          ? "ON"
          : "TURN ON";

  const relaySubtitle = demoData
    ? isStaggering
      ? `Sample Data Demo — Inrush protection active (Line 1 energizing in ${staggerSeconds || 3}s)...`
      : `Sample Data Demo — ${relayOn ? "whole-home power simulated" : "all circuits turned off"}`
    : !iotReachable
      ? iotState === "unknown"
        ? "Checking device..."
        : `${iotState === "offline" ? "Device offline" : "No live link to device"} · control unavailable`
      : isStaggering
        ? `Inrush protection active — Line 1 energizing in ${staggerSeconds || 3}s...`
        : relayPending
          ? "Waiting for device confirmation..."
          : relayReasonLabel;

  const relayTint = !iotReachable && !demoData
    ? colors.sub
    : isStaggering
      ? colors.yellow
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

  // Sort appliances from newest to oldest activity, then display the top 3.
  const sortedDevices = useMemo(() => {
    const parseTime = (iso?: string | null) => {
      if (!iso) return 0;
      const ms = Date.parse(iso);
      return Number.isFinite(ms) ? ms : 0;
    };
    const parseIdNum = (id: string) => {
      const num = Number(id.replace(/[^0-9]/g, ""));
      return Number.isFinite(num) ? num : 0;
    };

    return [...devices].sort((a, b) => {
      // 1. Currently active appliances (drawing power right now) come first
      if (a.active !== b.active) return a.active ? -1 : 1;
      // 2. Most recent activity timestamp (newest to oldest)
      const timeDiff = parseTime(b.lastActiveAt) - parseTime(a.lastActiveAt);
      if (timeDiff !== 0) return timeDiff;
      // 3. Live power draw descending
      if (b.watts !== a.watts) return b.watts - a.watts;
      // 4. Most recently created/registered ID
      return parseIdNum(b.id) - parseIdNum(a.id);
    });
  }, [devices]);

  const recentDevices = useMemo(() => sortedDevices.slice(0, 3), [sortedDevices]);

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

        {/* Tariff Not Set Warning Banner */}
        {prefs.ratePerKwh <= 0 && (
          <TouchableOpacity
            style={styles.tariffAlertBanner}
            onPress={() => router.push("/units-settings")}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Electricity tariff not set. Tap here to configure your rate."
          >
            <View style={styles.tariffAlertIconWrap}>
              <AlertCircle size={20} color={colors.yellow} />
            </View>
            <View style={styles.tariffAlertContent}>
              <Text style={styles.tariffAlertTitle}>Electricity Tariff Not Set</Text>
              <Text style={styles.tariffAlertSubtitle}>
                Rate is currently ₱0.00 /kWh. Tap to set your rate and calculate power bills.
              </Text>
            </View>
            <ChevronRight size={18} color={colors.sub} />
          </TouchableOpacity>
        )}

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
            {/* Driven directly from live telemetry `displayMetrics.activePower` (2 decimals)
                so Current Usage and Active Power always match the hardware display. */}
            <Text
              style={styles.kwValue}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
            >
              {heroPowerParts === null ? "—" : heroPowerParts.value}
            </Text>
            <Text style={styles.kwUnit}>
              {heroPowerParts === null ? "" : heroPowerParts.unit}
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
                      ? powerParts(raw, def.decimals)
                      : def.key === "energy"
                        ? energyParts(raw, def.decimals)
                        : { value: raw.toFixed(def.decimals), unit: def.unit };
                return (
                  <View key={def.key} style={styles.metricCell}>
                    <Text
                      style={styles.metricValue}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.75}
                    >
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
                    {
                      backgroundColor: isStaggering
                        ? colors.yellow
                        : highOn
                          ? colors.green
                          : colors.red,
                    },
                  ]}
                />
                <Text style={styles.lineBadgeText}>
                  High: {isStaggering ? `WAIT (${staggerSeconds || 3}s)` : highOn ? "ON" : "OFF"}
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

        {/* Appliance Banners — top 3 sorted from newest to latest activity */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleGroup}>
              <Text style={styles.sectionTitle}>Appliances</Text>
              {devices.length > 0 && (
                <Text style={styles.sectionMeta}>
                  {devices.filter((d) => d.active).length} active · {devices.length} total
                </Text>
              )}
            </View>
            {devices.length > 0 && (
              <TouchableOpacity
                onPress={() => router.push("/(tabs)/devices")}
                activeOpacity={0.7}
                style={styles.headerSeeMoreBtn}
                accessibilityRole="button"
                accessibilityLabel="See more appliances in Devices screen"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.headerSeeMoreText}>See more</Text>
                <Ionicons name="arrow-forward" size={14} color={colors.accent} />
              </TouchableOpacity>
            )}
          </View>

          {devices.length === 0 ? (
            <View style={styles.emptyStrip}>
              <Ionicons name="flash-outline" size={16} color={colors.sub} />
              <Text style={styles.emptyStripText}>
                No devices registered — add them in the Devices tab.
              </Text>
            </View>
          ) : (
            <View style={styles.applianceBannerStack}>
              {recentDevices.map((item) => {
                const status = item.status ?? (item.active ? "ACTIVE" : "IDLE");
                const statusColor =
                  status === "ACTIVE"
                    ? colors.accent
                    : status === "IDLE"
                      ? colors.yellow
                      : status === "OFF"
                        ? colors.red
                        : colors.sub;
                const statusLabel =
                  status === "ACTIVE"
                    ? "Active"
                    : status === "IDLE"
                      ? "Standby"
                      : status === "OFF"
                        ? "Off"
                        : "Circuit off";

                const lineTier = DEMO_HIGH_LINE_IDS.has(item.id)
                  ? "High load"
                  : DEMO_LOW_LINE_IDS.has(item.id)
                    ? "Low load"
                    : null;

                let activityLabel: string | null = null;
                if (item.active) {
                  activityLabel = "Active now";
                } else if (item.lastActiveAt) {
                  const elapsedMin = Math.max(
                    0,
                    Math.round((Date.now() - Date.parse(item.lastActiveAt)) / 60_000)
                  );
                  if (Number.isFinite(elapsedMin)) {
                    if (elapsedMin < 1) activityLabel = "Just now";
                    else if (elapsedMin < 60) activityLabel = `${elapsedMin}m ago`;
                    else if (elapsedMin < 1440)
                      activityLabel = `${Math.round(elapsedMin / 60)}h ago`;
                    else activityLabel = `${Math.round(elapsedMin / 1440)}d ago`;
                  }
                }

                const metaParts = [
                  activityLabel,
                  item.room && item.room !== "Unassigned" ? item.room : null,
                  item.category || null,
                  lineTier,
                ].filter(Boolean) as string[];

                const livePower = powerParts(item.watts);
                const todayEnergy =
                  item.todayKwh != null
                    ? energyParts(item.todayKwh, 2)
                    : { value: "—", unit: energyParts(0, 2).unit };
                const todayCost =
                  item.todayKwh != null ? formatCostOf(item.todayKwh) : null;

                const bannerMetrics: {
                  key: string;
                  label: string;
                  value: string;
                  unit: string;
                }[] = [
                  {
                    key: "voltage",
                    label: "Voltage",
                    value:
                      item.voltage != null ? item.voltage.toFixed(1) : "—",
                    unit: "V",
                  },
                  {
                    key: "current",
                    label: "Current",
                    value:
                      item.current != null ? item.current.toFixed(2) : "—",
                    unit: "A",
                  },
                  {
                    key: "activePower",
                    label: "Active power",
                    value: livePower.value,
                    unit: livePower.unit,
                  },
                  {
                    key: "energyToday",
                    label: "Energy today",
                    value: todayEnergy.value,
                    unit: todayEnergy.unit,
                  },
                  {
                    key: "frequency",
                    label: "Frequency",
                    value:
                      item.frequency != null ? item.frequency.toFixed(2) : "—",
                    unit: "Hz",
                  },
                  {
                    key: "powerFactor",
                    label: "Power factor",
                    value:
                      item.powerFactor != null
                        ? item.powerFactor.toFixed(2)
                        : "—",
                    unit: "PF",
                  },
                ];

                return (
                  <View key={item.id} style={styles.applianceBanner}>
                    <View
                      style={[
                        styles.applianceBannerEdge,
                        { backgroundColor: statusColor },
                      ]}
                    />
                    <View style={styles.applianceBannerBody}>
                      {/* Banner Header: Identity & Primary Live Draw */}
                      <View style={styles.applianceBannerTop}>
                        <View style={styles.applianceBannerIdentity}>
                          <Text
                            style={styles.applianceBannerName}
                            numberOfLines={1}
                          >
                            {item.name}
                          </Text>
                          <View style={styles.applianceBannerMetaRow}>
                            <View
                              style={[
                                styles.applianceStatusDot,
                                { backgroundColor: statusColor },
                              ]}
                            />
                            <Text
                              style={[
                                styles.applianceStatusText,
                                { color: statusColor },
                              ]}
                            >
                              {statusLabel}
                            </Text>
                            {metaParts.length > 0 && (
                              <Text
                                style={styles.applianceMetaContext}
                                numberOfLines={1}
                              >
                                {" · "}
                                {metaParts.join(" · ")}
                              </Text>
                            )}
                          </View>
                        </View>

                        <View style={styles.applianceBannerPrimary}>
                          <Text
                            style={[
                              styles.appliancePrimaryWatts,
                              !item.active && { color: colors.sub },
                            ]}
                          >
                            {livePower.value}
                            <Text style={styles.appliancePrimaryUnit}>
                              {" "}
                              {livePower.unit}
                            </Text>
                          </Text>
                          {todayCost !== null && (
                            <Text style={styles.applianceCostToday}>
                              {todayCost} today
                            </Text>
                          )}
                        </View>
                      </View>

                      {/* 3x2 Electrical Telemetry Strip — hairline grid, no nested boxes */}
                      <View style={styles.applianceTelemetryGrid}>
                        {bannerMetrics.map((m, idx) => {
                          const isRightCol = idx % 3 === 2;
                          const isBottomRow = idx >= 3;
                          return (
                            <View
                              key={m.key}
                              style={[
                                styles.applianceTelemetryCell,
                                !isRightCol && styles.applianceTelemetryCellBorderRight,
                                isBottomRow && styles.applianceTelemetryCellBorderTop,
                              ]}
                            >
                              <Text style={styles.applianceTelemetryValue}>
                                {m.value}
                                <Text style={styles.applianceTelemetryUnit}>
                                  {" "}
                                  {m.unit}
                                </Text>
                              </Text>
                              <Text style={styles.applianceTelemetryLabel}>
                                {m.label}
                              </Text>
                            </View>
                          );
                        })}
                      </View>
                    </View>
                  </View>
                );
              })}

              {/* See more button -> redirects to Devices screen */}
              <TouchableOpacity
                onPress={() => router.push("/(tabs)/devices")}
                activeOpacity={0.75}
                style={styles.seeMoreBannerBtn}
                accessibilityRole="button"
                accessibilityLabel="See more appliances in Devices screen"
              >
                <Text style={styles.seeMoreBannerText}>
                  See more{devices.length > 3 ? ` (${devices.length - 3} more)` : ""}
                </Text>
                <Ionicons name="arrow-forward" size={16} color={colors.text} />
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* NILM Power-Plane Event Disaggregation (image.png) */}
        <View style={styles.section}>
          <PowerPlaneClusterMap
            event={powerPlaneEvent}
            candidates={powerPlaneCandidates}
          />
        </View>

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
    tariffAlertBanner: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.card,
      borderColor: colors.yellow,
      borderWidth: 1,
      borderRadius: 14,
      padding: 14,
      marginBottom: 16,
      gap: 12,
    },
    tariffAlertIconWrap: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.yellow + "1A",
      alignItems: "center",
      justifyContent: "center",
    },
    tariffAlertContent: {
      flex: 1,
    },
    tariffAlertTitle: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.yellow,
      marginBottom: 2,
    },
    tariffAlertSubtitle: {
      fontSize: 11,
      color: colors.sub,
      lineHeight: 16,
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
    emptyStrip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: colors.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
    },
    emptyStripText: {
      color: colors.sub,
      fontSize: 13 * fontScale,
      flex: 1,
    },
    applianceBannerStack: {
      gap: 12,
    },
    applianceBanner: {
      flexDirection: "row",
      backgroundColor: colors.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
    },
    applianceBannerEdge: {
      width: 3,
      alignSelf: "stretch",
    },
    applianceBannerBody: {
      flex: 1,
    },
    applianceBannerTop: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingTop: 14,
      paddingBottom: 12,
      gap: 12,
    },
    applianceBannerIdentity: {
      flex: 1,
      gap: 4,
    },
    applianceBannerName: {
      color: colors.text,
      fontSize: 16 * fontScale,
      fontWeight: "600",
      lineHeight: 22 * fontScale,
    },
    applianceBannerMetaRow: {
      flexDirection: "row",
      alignItems: "center",
    },
    applianceStatusDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      marginRight: 6,
    },
    applianceStatusText: {
      fontSize: 12 * fontScale,
      fontWeight: "600",
      lineHeight: 16 * fontScale,
    },
    applianceMetaContext: {
      color: colors.sub,
      fontSize: 12 * fontScale,
      lineHeight: 16 * fontScale,
      flexShrink: 1,
    },
    applianceBannerPrimary: {
      alignItems: "flex-end",
      gap: 2,
    },
    appliancePrimaryWatts: {
      color: colors.text,
      fontSize: 18 * fontScale,
      fontWeight: "700",
      lineHeight: 22 * fontScale,
      fontVariant: ["tabular-nums"],
    },
    appliancePrimaryUnit: {
      color: colors.sub,
      fontSize: 12 * fontScale,
      fontWeight: "500",
    },
    applianceCostToday: {
      color: colors.sub,
      fontSize: 12 * fontScale,
      lineHeight: 16 * fontScale,
      fontVariant: ["tabular-nums"],
    },
    applianceTelemetryGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    applianceTelemetryCell: {
      width: "33.3333%",
      paddingHorizontal: 14,
      paddingVertical: 10,
      alignItems: "flex-start",
    },
    applianceTelemetryCellBorderRight: {
      borderRightWidth: 1,
      borderRightColor: colors.border,
    },
    applianceTelemetryCellBorderTop: {
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    applianceTelemetryValue: {
      color: colors.text,
      fontSize: 14 * fontScale,
      fontWeight: "600",
      lineHeight: 18 * fontScale,
      fontVariant: ["tabular-nums"],
    },
    applianceTelemetryUnit: {
      color: colors.sub,
      fontSize: 11 * fontScale,
      fontWeight: "400",
    },
    applianceTelemetryLabel: {
      color: colors.sub,
      fontSize: 11 * fontScale,
      lineHeight: 15 * fontScale,
      marginTop: 2,
    },
    seeMoreBannerBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      height: 46,
      backgroundColor: colors.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 16,
    },
    seeMoreBannerText: {
      color: colors.text,
      fontSize: 14 * fontScale,
      fontWeight: "600",
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
    sectionTitleGroup: {
      flexDirection: "row",
      alignItems: "baseline",
      gap: 8,
    },
    sectionTitle: {
      color: colors.text,
      fontSize: 18 * fontScale,
      fontWeight: "700",
    },
    sectionMeta: {
      color: colors.sub,
      fontSize: 13 * fontScale,
      fontWeight: "500",
    },
    headerSeeMoreBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingVertical: 4,
      paddingHorizontal: 2,
    },
    headerSeeMoreText: {
      color: colors.accent,
      fontSize: 13 * fontScale,
      fontWeight: "600",
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

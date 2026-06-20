import { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  FlatList,
  Image,
  Animated,
  Easing,
  LayoutAnimation,
  Platform,
  UIManager,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LineChart } from "react-native-chart-kit";
import { api, checkHealth, DashboardData, DashboardDevice, Reading } from "../../lib/api";

// Enable LayoutAnimation on Android.
if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const { width: SCREEN_WIDTH } = Dimensions.get("window");

const C = {
  bg: "#1a1f2e",
  card: "#242b3d",
  accent: "#00d4aa",
  text: "#ffffff",
  sub: "#9ca3af",
  border: "#2d3448",
  yellow: "#f59e0b",
  red: "#ef4444",
  amber: "#f97316",
};

// ---- Offline-first fallback for the PZEM-004T reading ----
// Realistic values: 220 V mains, ~1.46 A, ~320 W, ~18.7 kWh, 60 Hz, 0.92 PF.
const FALLBACK_READING: Reading = {
  voltage: 220.4,
  current: 1.46,
  activePower: 319.8,
  energy: 18.7,
  frequency: 60.0,
  powerFactor: 0.92,
  timestamp: new Date().toISOString(),
};

// Per-metric jitter caps so random fluctuations stay physically plausible.
const JITTER = {
  voltage: 0.8,      // ± 0.8 V
  current: 0.05,     // ± 0.05 A
  activePower: 12,   // ± 12 W
  energy: 0.02,      // ± 0.02 kWh (ratchets up in practice; we keep it gentle here)
  frequency: 0.05,   // ± 0.05 Hz
  powerFactor: 0.01, // ± 0.01
};

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

const DAY_DATA   = [2.1, 2.4, 3.5, 3.8, 3.2, 2.0, 2.1, 2.3, 3.1, 3.6, 3.8, 3.4, 3.9];
const WEEK_DATA  = [18.7, 22.1, 19.4, 25.3, 21.8, 17.2, 23.5];
const MONTH_DATA = [580, 610, 595, 640, 620, 575, 655, 630, 600, 670, 645, 610];
const DAY_LABELS   = ["6a", "9a", "12p", "3p", "6p", "9p", "12a"];
const WEEK_LABELS  = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const DEVICES = [
  { id: "1", name: "AC",     watts: 1200, active: true  },
  { id: "2", name: "Fridge", watts: 180,  active: true  },
  { id: "3", name: "TV",     watts: 85,   active: false },
  { id: "4", name: "Washer", watts: 500,  active: false },
];

const TOP_CONSUMERS = [
  { id: "1", name: "Air Conditioner", pct: 47, color: "#00d4aa" },
  { id: "2", name: "Refrigerator",    pct: 21, color: "#3b82f6" },
  { id: "3", name: "Water Heater",    pct: 18, color: "#f59e0b" },
  { id: "4", name: "TV & Devices",    pct: 9,  color: "#8b5cf6" },
  { id: "5", name: "Lighting",        pct: 5,  color: "#ec4899" },
];

type PillStatus = "online" | "offline" | "degraded" | "unknown";

function StatusPill({ label, status }: { label: string; status: PillStatus }) {
  const dot  = status === "online" ? C.accent : status === "offline" ? C.red : status === "degraded" ? C.amber : C.sub;
  const bg   = status === "online" ? "#0d2b22" : status === "offline" ? "#2b0d0d" : status === "degraded" ? "#2b1a0d" : C.card;
  const clr  = status === "online" ? C.accent : status === "offline" ? C.red : status === "degraded" ? C.amber : C.sub;
  return (
    <View style={[pillSt.pill, { backgroundColor: bg }]}>
      <View style={[pillSt.dot, { backgroundColor: dot }]} />
      <Text style={[pillSt.text, { color: clr }]}>{label}</Text>
    </View>
  );
}

const pillSt = StyleSheet.create({
  pill: { flexDirection: "row", alignItems: "center", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, gap: 5 },
  dot:  { width: 7, height: 7, borderRadius: 4 },
  text: { fontSize: 12, fontWeight: "700", letterSpacing: 0.5 },
});

type Period = "Day" | "Week" | "Month";

function getChartConfig(period: Period) {
  switch (period) {
    case "Day":   return { data: DAY_DATA,   labels: DAY_LABELS   };
    case "Week":  return { data: WEEK_DATA,  labels: WEEK_LABELS  };
    case "Month": return { data: MONTH_DATA, labels: MONTH_LABELS };
  }
}

// Clamp a number to [min, max].
function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

// Apply a random jitter delta, clamped to sane PZEM ranges.
function jitter(value: number, range: number, min: number, max: number): number {
  const delta = (Math.random() - 0.5) * 2 * range;
  return Math.round(clamp(value + delta, min, max) * 1000) / 1000;
}

type LiveMetrics = Omit<Reading, "timestamp">;

export default function DashboardScreen() {
  const [currentKw, setCurrentKw]         = useState(3.24);
  const [period, setPeriod]               = useState<Period>("Day");
  const [dashboard, setDashboard]         = useState<DashboardData | null>(null);
  // Card starts expanded (true).
  const [expanded, setExpanded]           = useState(true);
  // Live fluctuating metric values, seeded from FALLBACK_READING.
  const [liveMetrics, setLiveMetrics]     = useState<LiveMetrics>({
    voltage:     FALLBACK_READING.voltage,
    current:     FALLBACK_READING.current,
    activePower: FALLBACK_READING.activePower,
    energy:      FALLBACK_READING.energy,
    frequency:   FALLBACK_READING.frequency,
    powerFactor: FALLBACK_READING.powerFactor,
  });

  const [serverOnline, setServerOnline] = useState<boolean | null>(null);
  const [iotOnline, setIotOnline]       = useState<boolean | null>(null);

  const intervalRef       = useRef<ReturnType<typeof setInterval> | null>(null);
  const healthIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Animated value for the expand/collapse body: 0 = collapsed, 1 = expanded.
  const expandAnim      = useRef(new Animated.Value(1)).current;
  // Animated value for chevron rotation.
  const chevronAnim     = useRef(new Animated.Value(1)).current;

  // Fetch dashboard data.
  useEffect(() => {
    let cancelled = false;
    api
      .get<DashboardData>(`/dashboard?period=${period}`)
      .then((data) => {
        if (cancelled) return;
        setDashboard(data);
        setCurrentKw(data.currentKw);
        setIotOnline(data.iotOnline ?? false);
        // Seed live metrics from the backend reading if present.
        if (data.reading) {
          const { timestamp: _ts, ...rest } = data.reading;
          setLiveMetrics(rest);
        }
      })
      .catch(() => {
        // Offline-first: keep showing FALLBACK_READING values.
      });
    return () => {
      cancelled = true;
    };
  }, [period]);

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

  // Unified 2-second tick: jitter currentKw AND all six PZEM metrics.
  // Each value random-walks from its previous value (matching the original
  // currentKw logic), so the latest API-seeded reading is preserved and
  // drifts gently rather than snapping back to the fallback base.
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      // kW fluctuation (unchanged from original logic).
      setCurrentKw((prev) => {
        const delta = (Math.random() - 0.5) * 0.1;
        return Math.round(Math.max(0.5, prev + delta) * 100) / 100;
      });

      // Six metric fluctuations — each jitters around its own latest value.
      setLiveMetrics((prev) => ({
        voltage:     jitter(prev.voltage,     JITTER.voltage,     190, 250),
        current:     jitter(prev.current,     JITTER.current,     0,   63),
        activePower: jitter(prev.activePower, JITTER.activePower, 0,   9999),
        energy:      jitter(prev.energy,      JITTER.energy,      0,   9999),
        frequency:   jitter(prev.frequency,   JITTER.frequency,   45,  65),
        powerFactor: jitter(prev.powerFactor, JITTER.powerFactor, 0,   1),
      }));
    }, 2000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

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

  // Backend supplies matched labels/data per period; fall back to local mock.
  const fallback       = getChartConfig(period);
  const visibleLabels  = dashboard?.history.labels ?? fallback.labels;
  const chartData      = dashboard?.history.data   ?? fallback.data;
  const devices        = dashboard?.devices        ?? DEVICES;
  const topConsumers   = dashboard?.topConsumers   ?? TOP_CONSUMERS;
  const totalToday     = dashboard?.totalTodayKwh  ?? 18.7;

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Image
            source={require("../../assets/images/voltwise-logo.png")}
            style={styles.logo}
            resizeMode="contain"
          />
          <View style={styles.headerIcons}>
            <TouchableOpacity style={styles.iconBtn}>
              <Ionicons name="notifications-outline" size={22} color={C.text} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.avatar}>
              <Ionicons name="person-outline" size={18} color={C.text} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Status Row */}
        <View style={styles.statusRow}>
          <StatusPill
            label={serverOnline === null ? "Server..." : serverOnline ? "Server Live" : "Server Offline"}
            status={serverOnline === null ? "unknown" : serverOnline ? "online" : "offline"}
          />
          <StatusPill
            label={iotOnline === null ? "IoT..." : iotOnline ? "IoT Live" : "IoT Offline"}
            status={iotOnline === null ? "unknown" : iotOnline ? "online" : "degraded"}
          />
        </View>

        {/* Current Usage Card — hero always visible, metric grid collapsible */}
        <View style={styles.usageCard}>
          {/* Always-visible hero row */}
          <View style={styles.usageCardTop}>
            <Text style={styles.usageLabel}>Current{"\n"}Usage</Text>
            <View style={styles.usageTopRight}>
              <View style={styles.livePill}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>LIVE</Text>
              </View>
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
                  <Ionicons name="chevron-down" size={20} color={C.sub} />
                </Animated.View>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.kwRow}>
            <Text style={styles.kwValue}>{currentKw.toFixed(2)}</Text>
            <Text style={styles.kwUnit}>kW</Text>
          </View>
          <Text style={styles.totalToday}>
            Total today: {totalToday.toFixed(1)} kWh
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
                const raw = liveMetrics[def.key];
                const display = raw.toFixed(def.decimals);
                return (
                  <View key={def.key} style={styles.metricCell}>
                    <Text style={styles.metricValue}>
                      {display}
                      <Text style={styles.metricUnit}> {def.unit}</Text>
                    </Text>
                    <Text style={styles.metricLabel}>{def.label}</Text>
                  </View>
                );
              })}
            </Animated.View>
          )}
        </View>

        {/* Device Cards */}
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
                    { backgroundColor: item.active ? C.accent : C.yellow },
                  ]}
                />
                <Text style={styles.deviceStatus}>
                  {item.active ? "Active" : "Standby"}
                </Text>
              </View>
              <Text style={styles.deviceName}>{item.name}</Text>
              <Text style={styles.deviceWatts}>
                {item.watts >= 1000
                  ? `${(item.watts / 1000).toFixed(1).replace(".0", "")}kW`
                  : `${item.watts}W`}
              </Text>
            </View>
          )}
        />

        {/* Usage History */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Usage History</Text>
            <View style={styles.periodSelector}>
              {(["Day", "Week", "Month"] as Period[]).map((p) => (
                <TouchableOpacity
                  key={p}
                  style={[
                    styles.periodBtn,
                    period === p && styles.periodBtnActive,
                  ]}
                  onPress={() => setPeriod(p)}
                >
                  <Text
                    style={[
                      styles.periodLabel,
                      period === p && styles.periodLabelActive,
                    ]}
                  >
                    {p}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.chartCard}>
            <LineChart
              data={{
                labels: visibleLabels,
                datasets: [{ data: chartData }],
              }}
              width={SCREEN_WIDTH - 32}
              height={200}
              withDots={false}
              withShadow={false}
              withInnerLines={true}
              withOuterLines={false}
              withVerticalLines={false}
              withHorizontalLines={true}
              fromZero
              chartConfig={{
                backgroundColor: C.card,
                backgroundGradientFrom: C.card,
                backgroundGradientTo: C.card,
                decimalPlaces: 1,
                color: () => C.accent,
                labelColor: () => C.sub,
                style: { borderRadius: 12 },
                propsForDots: { r: "0" },
                propsForBackgroundLines: {
                  stroke: C.border,
                  strokeDasharray: "4 4",
                },
              }}
              bezier
              style={styles.chart}
            />
          </View>
        </View>

        {/* Top Consumers */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Top Consumers</Text>
          <View style={styles.consumersCard}>
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
                <Text style={styles.consumerPct}>{item.pct}%</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={{ height: 16 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg,
  },
  scroll: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  logo: {
    width: 240,
    height: 72,
    marginLeft: -20,
  },
  headerIcons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconBtn: {
    padding: 4,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.card,
    alignItems: "center",
    justifyContent: "center",
  },
  usageCard: {
    backgroundColor: C.card,
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
    color: C.sub,
    fontSize: 14,
    lineHeight: 20,
  },
  livePill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1a3d30",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 5,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: C.accent,
  },
  liveText: {
    color: C.accent,
    fontSize: 12,
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
    color: C.text,
    fontSize: 52,
    fontWeight: "700",
    lineHeight: 56,
  },
  kwUnit: {
    color: C.text,
    fontSize: 22,
    fontWeight: "500",
    marginBottom: 6,
  },
  totalToday: {
    color: C.sub,
    fontSize: 14,
  },
  // Metric grid: 3 columns.
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: C.border,
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
    color: C.text,
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 20,
  },
  metricUnit: {
    color: C.sub,
    fontSize: 12,
    fontWeight: "400",
  },
  metricLabel: {
    color: C.sub,
    fontSize: 11,
    marginTop: 3,
  },
  deviceList: {
    gap: 10,
    paddingRight: 4,
    marginBottom: 24,
  },
  deviceCard: {
    backgroundColor: C.card,
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
    color: C.sub,
    fontSize: 12,
  },
  deviceName: {
    color: C.text,
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 4,
  },
  deviceWatts: {
    color: C.text,
    fontSize: 18,
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
    color: C.text,
    fontSize: 18,
    fontWeight: "700",
  },
  periodSelector: {
    flexDirection: "row",
    backgroundColor: C.card,
    borderRadius: 10,
    padding: 3,
  },
  periodBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
  },
  periodBtnActive: {
    backgroundColor: C.text,
  },
  periodLabel: {
    color: C.sub,
    fontSize: 13,
    fontWeight: "500",
  },
  periodLabelActive: {
    color: C.bg,
    fontWeight: "700",
  },
  chartCard: {
    backgroundColor: C.card,
    borderRadius: 16,
    overflow: "hidden",
  },
  chart: {
    borderRadius: 16,
  },
  consumersCard: {
    backgroundColor: C.card,
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
    color: C.text,
    fontSize: 13,
    width: 120,
  },
  consumerBarBg: {
    flex: 1,
    height: 6,
    backgroundColor: C.border,
    borderRadius: 3,
    overflow: "hidden",
  },
  consumerBar: {
    height: 6,
    borderRadius: 3,
  },
  consumerPct: {
    color: C.sub,
    fontSize: 12,
    width: 32,
    textAlign: "right",
  },
});

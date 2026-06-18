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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LineChart } from "react-native-chart-kit";
import { api, DashboardData, DashboardDevice } from "../../lib/api";

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
};

const DAY_DATA = [
  2.1, 2.4, 3.5, 3.8, 3.2, 2.0, 2.1, 2.3, 3.1, 3.6, 3.8, 3.4, 3.9,
];
const WEEK_DATA = [18.7, 22.1, 19.4, 25.3, 21.8, 17.2, 23.5];
const MONTH_DATA = [580, 610, 595, 640, 620, 575, 655, 630, 600, 670, 645, 610];
const DAY_LABELS = ["6a", "9a", "12p", "3p", "6p", "9p", "12a"];
const WEEK_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const DEVICES = [
  { id: "1", name: "AC", watts: 1200, active: true },
  { id: "2", name: "Fridge", watts: 180, active: true },
  { id: "3", name: "TV", watts: 85, active: false },
  { id: "4", name: "Washer", watts: 500, active: false },
];

const TOP_CONSUMERS = [
  { id: "1", name: "Air Conditioner", pct: 47, color: "#00d4aa" },
  { id: "2", name: "Refrigerator", pct: 21, color: "#3b82f6" },
  { id: "3", name: "Water Heater", pct: 18, color: "#f59e0b" },
  { id: "4", name: "TV & Devices", pct: 9, color: "#8b5cf6" },
  { id: "5", name: "Lighting", pct: 5, color: "#ec4899" },
];

type Period = "Day" | "Week" | "Month";

function getChartConfig(period: Period) {
  switch (period) {
    case "Day":
      return { data: DAY_DATA, labels: DAY_LABELS };
    case "Week":
      return { data: WEEK_DATA, labels: WEEK_LABELS };
    case "Month":
      return { data: MONTH_DATA, labels: MONTH_LABELS };
  }
}

export default function DashboardScreen() {
  const [currentKw, setCurrentKw] = useState(3.24);
  const [period, setPeriod] = useState<Period>("Day");
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch live dashboard data from the backend whenever the period changes.
  useEffect(() => {
    let cancelled = false;
    api
      .get<DashboardData>(`/dashboard?period=${period}`)
      .then((data) => {
        if (cancelled) return;
        setDashboard(data);
        setCurrentKw(data.currentKw);
      })
      .catch(() => {
        // Offline-first: keep showing fallback/last-known values.
      });
    return () => {
      cancelled = true;
    };
  }, [period]);

  // Subtle live fluctuation around the backend-reported current usage.
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setCurrentKw((prev) => {
        const delta = (Math.random() - 0.5) * 0.1;
        return Math.round(Math.max(0.5, prev + delta) * 100) / 100;
      });
    }, 2000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  // Backend supplies matched labels/data per period; fall back to local mock.
  const fallback = getChartConfig(period);
  const visibleLabels = dashboard?.history.labels ?? fallback.labels;
  const chartDisplayData = dashboard?.history.data ?? fallback.data;
  const devices: DashboardData["devices"] = dashboard?.devices ?? DEVICES;
  const topConsumers: DashboardData["topConsumers"] =
    dashboard?.topConsumers ?? TOP_CONSUMERS;
  const totalToday = dashboard?.totalTodayKwh ?? 18.7;

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

        {/* Current Usage Card */}
        <View style={styles.usageCard}>
          <View style={styles.usageCardTop}>
            <Text style={styles.usageLabel}>Current{"\n"}Usage</Text>
            <View style={styles.livePill}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>
          </View>
          <View style={styles.kwRow}>
            <Text style={styles.kwValue}>{currentKw.toFixed(2)}</Text>
            <Text style={styles.kwUnit}>kW</Text>
          </View>
          <Text style={styles.totalToday}>
            Total today: {totalToday.toFixed(1)} kWh
          </Text>
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
                datasets: [{ data: chartDisplayData }],
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

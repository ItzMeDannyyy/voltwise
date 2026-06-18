import { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Circle } from "react-native-svg";
import { api, AnalyticsData } from "../../lib/api";

const C = {
  bg: "#1a1f2e",
  card: "#242b3d",
  accent: "#00d4aa",
  text: "#ffffff",
  sub: "#9ca3af",
  border: "#2d3448",
  yellow: "#f59e0b",
  red: "#ef4444",
  blue: "#3b82f6",
  purple: "#8b5cf6",
  pink: "#ec4899",
};

const CIRCUMFERENCE = 502.655;
const RADIUS = 80;
const CX = 110;
const CY = 110;
const STROKE_WIDTH = 24;

const DONUT_SEGMENTS = [
  { label: "Aircon", pct: 42, color: C.accent },
  { label: "Fridge", pct: 21, color: C.blue },
  { label: "Lights", pct: 14, color: C.yellow },
  { label: "Others", pct: 23, color: "#4b5563" },
];

const TOP_CONSUMERS = [
  { id: "1", name: "Aircon", pct: 42, color: C.accent },
  { id: "2", name: "Fridge", pct: 21, color: C.blue },
  { id: "3", name: "Lights", pct: 14, color: C.yellow },
  { id: "4", name: "Washing Machine", pct: 9, color: C.purple },
  { id: "5", name: "Others", pct: 5, color: C.pink },
];

type Period = "Day" | "Week" | "Month";

const PERIODS: Period[] = ["Day", "Week", "Month"];

export default function AnalyticsScreen() {
  const [period, setPeriod] = useState<Period>("Day");
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);

  // Fetch analytics whenever the selected period changes.
  useEffect(() => {
    let cancelled = false;
    api
      .get<AnalyticsData>(`/analytics?period=${period}`)
      .then((data) => {
        if (!cancelled) setAnalytics(data);
      })
      .catch(() => {
        // Offline-first: fall back to local mock values.
      });
    return () => {
      cancelled = true;
    };
  }, [period]);

  function cyclePeriod() {
    setPeriod((p) => PERIODS[(PERIODS.indexOf(p) + 1) % PERIODS.length]);
  }

  const breakdown = analytics?.breakdown ?? DONUT_SEGMENTS;
  const topConsumers = analytics?.topConsumers ?? TOP_CONSUMERS;
  const totalKwh = analytics?.totalKwh ?? 87.4;
  const bill = analytics?.billPredictor ?? {
    tariff: 10.5,
    currency: "₱",
    accumulatedKwh: 87.4,
    estimatedBill: 917.7,
    cycleStart: "Jun 1, 2026",
  };

  let cumulative = 0;
  const segments = breakdown.map((seg) => {
    const dash = (seg.pct / 100) * CIRCUMFERENCE;
    const offset = -cumulative;
    cumulative += dash;
    return { ...seg, dash, offset };
  });

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.heading}>Analytics</Text>

        <View style={styles.card}>
          <View style={styles.billTopRow}>
            <Text style={styles.billLabel}>BILL PREDICTOR</Text>
            <Ionicons
              name="information-circle-outline"
              size={18}
              color={C.sub}
            />
          </View>

          <View style={styles.divider} />

          <View style={styles.billRow}>
            <Text style={styles.billRowLabel}>Tariff</Text>
            <Text style={[styles.billRowValue, styles.dashedValue]}>
              {bill.currency} {bill.tariff.toFixed(2)} /kWh
            </Text>
          </View>

          <View style={[styles.billRow, { marginTop: 10 }]}>
            <Text style={styles.billRowLabel}>Rate Accumulated</Text>
            <Text style={styles.billRowValue}>
              {bill.accumulatedKwh.toFixed(1)} kWh
            </Text>
          </View>

          <View style={[styles.billEstRow, { marginTop: 16 }]}>
            <Text style={styles.billEstLabel}>{"Est.\nBill"}</Text>
            <View style={styles.billAmountRow}>
              <Text style={styles.billCurrency}>{bill.currency}</Text>
              <Text style={styles.billAmount}>
                {bill.estimatedBill.toFixed(2)}
              </Text>
            </View>
          </View>

          <Text style={styles.billFooter}>
            {`Based on accumulated kWh since billing period.\nBilling cycle started: ${bill.cycleStart}`}
          </Text>
        </View>

        <Text style={[styles.sectionTitle, { marginTop: 24, marginBottom: 12 }]}>
          Usage Breakdown
        </Text>

        <View style={[styles.card, styles.donutCard]}>
          <View style={styles.donutWrapper}>
            <Svg
              width={220}
              height={220}
              viewBox="0 0 220 220"
              style={styles.donutSvg}
            >
              <Circle
                cx={CX}
                cy={CY}
                r={RADIUS}
                fill="none"
                stroke={C.border}
                strokeWidth={STROKE_WIDTH}
                strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
                strokeDashoffset={0}
              />
              {segments.map((seg) => (
                <Circle
                  key={seg.label}
                  cx={CX}
                  cy={CY}
                  r={RADIUS}
                  fill="none"
                  stroke={seg.color}
                  strokeWidth={STROKE_WIDTH}
                  strokeDasharray={`${seg.dash} ${CIRCUMFERENCE}`}
                  strokeDashoffset={seg.offset}
                  strokeLinecap="butt"
                />
              ))}
            </Svg>
            <View style={styles.donutCenter} pointerEvents="none">
              <Text style={styles.donutValue}>{totalKwh.toFixed(1)}</Text>
              <Text style={styles.donutUnit}>kWh</Text>
              <Text style={styles.donutTotal}>Total</Text>
            </View>
          </View>

          <View style={styles.legendGrid}>
            {breakdown.map((seg) => (
              <View key={seg.label} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: seg.color }]} />
                <Text style={styles.legendText}>
                  {seg.label} {seg.pct}%
                </Text>
              </View>
            ))}
          </View>
        </View>

        <View style={[styles.consumersHeader, { marginTop: 24, marginBottom: 12 }]}>
          <Text style={styles.sectionTitle}>Top Consumers</Text>
          <TouchableOpacity style={styles.periodPill} onPress={cyclePeriod}>
            <Text style={styles.periodPillText}>{period}</Text>
            <Ionicons name="chevron-down" size={12} color={C.text} />
          </TouchableOpacity>
        </View>

        <View style={[styles.card, styles.consumersCard]}>
          {topConsumers.map((item) => (
            <View key={item.id} style={styles.consumerRow}>
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
    paddingBottom: 24,
  },
  heading: {
    color: C.text,
    fontSize: 28,
    fontWeight: "700",
    marginBottom: 20,
  },
  card: {
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 16,
  },
  billTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  billLabel: {
    color: C.sub,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1,
  },
  divider: {
    height: 1,
    backgroundColor: C.border,
    marginVertical: 12,
  },
  billRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  billRowLabel: {
    color: C.sub,
    fontSize: 13,
  },
  billRowValue: {
    color: C.text,
    fontSize: 13,
    fontWeight: "600",
  },
  dashedValue: {
    borderBottomWidth: 1,
    borderBottomColor: C.sub,
    borderStyle: "dashed",
    paddingBottom: 1,
  },
  billEstRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  billEstLabel: {
    color: C.text,
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 22,
  },
  billAmountRow: {
    flexDirection: "row",
    alignItems: "flex-end",
  },
  billCurrency: {
    color: C.accent,
    fontSize: 20,
    marginBottom: 4,
    marginRight: 2,
  },
  billAmount: {
    color: C.accent,
    fontSize: 36,
    fontWeight: "800",
    lineHeight: 40,
  },
  billFooter: {
    color: C.sub,
    fontSize: 11,
    marginTop: 8,
    lineHeight: 16,
  },
  sectionTitle: {
    color: C.text,
    fontSize: 18,
    fontWeight: "700",
  },
  donutCard: {
    padding: 20,
    alignItems: "center",
  },
  donutWrapper: {
    width: 220,
    height: 220,
    alignItems: "center",
    justifyContent: "center",
  },
  donutSvg: {
    transform: [{ rotate: "-90deg" }],
  },
  donutCenter: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  donutValue: {
    color: C.text,
    fontSize: 28,
    fontWeight: "700",
    lineHeight: 32,
  },
  donutUnit: {
    color: C.sub,
    fontSize: 12,
    lineHeight: 16,
  },
  donutTotal: {
    color: C.sub,
    fontSize: 12,
    lineHeight: 16,
  },
  legendGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 16,
    width: "100%",
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    width: "50%",
    marginBottom: 8,
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    color: C.text,
    fontSize: 13,
  },
  consumersHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  periodPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 4,
  },
  periodPillText: {
    color: C.text,
    fontSize: 13,
  },
  consumersCard: {
    gap: 14,
  },
  consumerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  consumerName: {
    color: C.text,
    fontSize: 13,
    width: 110,
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
    width: 36,
    textAlign: "right",
  },
});

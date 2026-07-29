import { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Modal,
  ActivityIndicator,
  Pressable,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Circle } from "react-native-svg";
import { api, AnalyticsData, MetricStat } from "../../lib/api";
import Collapsible from "../../components/Collapsible";

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

// kwh/cost figures assume the same 87.4 kWh / ₱10.5 per kWh mock used by the
// bill predictor fallback below, so the offline demo numbers stay consistent.
const DONUT_SEGMENTS = [
  { label: "Aircon", pct: 42, color: C.accent,    kwh: 36.71, cost: 385.46 },
  { label: "Fridge", pct: 21, color: C.blue,      kwh: 18.35, cost: 192.68 },
  { label: "Lights", pct: 14, color: C.yellow,    kwh: 12.24, cost: 128.52 },
  { label: "Others", pct: 23, color: "#4b5563",   kwh: 20.10, cost: 211.05 },
];

const TOP_CONSUMERS = [
  { id: "1", name: "Aircon",          pct: 42, color: C.accent, kwh: 36.71, cost: 385.46 },
  { id: "2", name: "Fridge",          pct: 21, color: C.blue,   kwh: 18.35, cost: 192.68 },
  { id: "3", name: "Lights",          pct: 14, color: C.yellow, kwh: 12.24, cost: 128.52 },
  { id: "4", name: "Washing Machine", pct: 9,  color: C.purple, kwh: 7.87,  cost: 82.64  },
  { id: "5", name: "Others",          pct: 5,  color: C.pink,   kwh: 4.37,  cost: 45.89  },
];

// ---- Offline-first fallback for PZEM-004T metrics ----
// Avg/Min/Max are realistic 24-hour ranges; info strings match what the
// backend will serve so they read coherently offline.
const FALLBACK_METRICS: MetricStat[] = [
  {
    key: "voltage",
    label: "Voltage",
    unit: "V",
    avg: 220.1,
    min: 217.4,
    max: 223.8,
    info:
      "Mains voltage measured at the load. Philippine standard is 220 V ±10%. " +
      "Values below 198 V or above 242 V may damage appliances.",
  },
  {
    key: "current",
    label: "Current",
    unit: "A",
    avg: 1.44,
    min: 0.32,
    max: 3.12,
    info:
      "RMS current drawn by all connected loads. High sustained current " +
      "can indicate an overloaded circuit or a failing appliance.",
  },
  {
    key: "activePower",
    label: "Active Power",
    unit: "W",
    avg: 316.5,
    min: 70.2,
    max: 685.0,
    info:
      "Real power actually converted to useful work. Peaks often correspond " +
      "to motor start-up surges (AC compressor, refrigerator).",
  },
  {
    key: "energy",
    label: "Energy",
    unit: "kWh",
    avg: 18.7,
    min: 12.3,
    max: 26.1,
    info:
      "Cumulative energy consumed. The PZEM-004T resets this counter when " +
      "power is cycled unless the backend persists the value.",
  },
  {
    key: "frequency",
    label: "Frequency",
    unit: "Hz",
    avg: 60.01,
    min: 59.94,
    max: 60.08,
    info:
      "Grid frequency. In the Philippines the nominal is 60 Hz. " +
      "Significant deviation can indicate grid instability.",
  },
  {
    key: "powerFactor",
    label: "Power Factor",
    unit: "PF",
    avg: 0.92,
    min: 0.78,
    max: 0.99,
    info:
      "Ratio of active power to apparent power. A PF below 0.85 wastes " +
      "energy in reactive current. Capacitor banks can improve PF.",
  },
];

type Period = "Day" | "Week" | "Month";

const PERIODS: Period[] = ["Day", "Week", "Month"];

// Accent colour per metric key for the label pill.
const METRIC_ACCENT: Record<MetricStat["key"], string> = {
  voltage:     C.accent,
  current:     C.blue,
  activePower: C.yellow,
  energy:      C.purple,
  frequency:   C.pink,
  powerFactor: "#10b981",
};

export default function AnalyticsScreen() {
  const [period, setPeriod]     = useState<Period>("Day");
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // States for updating tariff rate
  const [tariffModalVisible, setTariffModalVisible] = useState(false);
  const [tariffInput, setTariffInput] = useState("");
  const [updatingTariff, setUpdatingTariff] = useState(false);
  const [tariffError, setTariffError] = useState<string | null>(null);

  // Fetch analytics whenever the selected period or refresh trigger changes.
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
  }, [period, refreshTrigger]);

  const breakdown    = analytics?.breakdown   ?? DONUT_SEGMENTS;
  const topConsumers = analytics !== null ? analytics.topConsumers : TOP_CONSUMERS;
  const totalKwh     = analytics?.totalKwh     ?? 87.4;
  const metrics      = analytics?.metrics      ?? FALLBACK_METRICS;
  const bill = analytics?.billPredictor ?? {
    tariff: 10.5,
    currency: "₱",
    accumulatedKwh: 87.4,
    estimatedBill: 917.7,
    cycleStart: "Jun 1, 2026",
  };

  const handleSaveTariff = async () => {
    const rate = parseFloat(tariffInput);
    if (isNaN(rate) || rate <= 0) {
      setTariffError("Please enter a valid rate greater than 0.");
      return;
    }

    setUpdatingTariff(true);
    setTariffError(null);

    try {
      await api.put("/analytics/tariff", { ratePerKwh: rate });
      setTariffModalVisible(false);
      setRefreshTrigger((prev) => prev + 1);
    } catch (err: any) {
      console.warn("Backend update failed, updating local state for offline demo:", err);
      // Fallback for offline mode: update local analytics state
      if (analytics) {
        setAnalytics({
          ...analytics,
          billPredictor: {
            ...analytics.billPredictor,
            tariff: rate,
            estimatedBill: parseFloat((rate * analytics.billPredictor.accumulatedKwh).toFixed(2)),
          },
        });
      }
      setTariffModalVisible(false);
    } finally {
      setUpdatingTariff(false);
    }
  };

  let cumulative = 0;
  const segments = breakdown.map((seg) => {
    const dash   = (seg.pct / 100) * CIRCUMFERENCE;
    const offset = -cumulative;
    cumulative  += dash;
    return { ...seg, dash, offset };
  });

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.heading}>Analytics</Text>

        {/* Bill Predictor */}
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

          <TouchableOpacity
            style={styles.billRow}
            onPress={() => {
              setTariffInput(bill.tariff.toString());
              setTariffError(null);
              setTariffModalVisible(true);
            }}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Edit Tariff Rate"
          >
            <Text style={styles.billRowLabel}>Tariff</Text>
            <View style={styles.tariffValueContainer}>
              <Text style={[styles.billRowValue, styles.dashedValue]}>
                {bill.currency} {bill.tariff.toFixed(2)} /kWh
              </Text>
              <Ionicons
                name="create-outline"
                size={14}
                color={C.accent}
                style={{ marginLeft: 6 }}
              />
            </View>
          </TouchableOpacity>

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

        {/* Usage Breakdown donut */}
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
                  {seg.label} {seg.pct}% · {bill.currency}{seg.cost.toFixed(2)}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Top Consumers */}
        <View style={[styles.consumersHeader, { marginTop: 24, marginBottom: 12 }]}>
          <Text style={styles.sectionTitle}>Top Consumers</Text>
          <View style={styles.periodSelector}>
            {PERIODS.map((p) => (
              <TouchableOpacity
                key={p}
                style={[styles.periodBtn, period === p && styles.periodBtnActive]}
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

        <View style={[styles.card, styles.consumersCard]}>
          {topConsumers.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="alert-circle-outline" size={24} color={C.sub} style={{ marginBottom: 6 }} />
              <Text style={styles.emptyText}>No appliances connected or active at the moment.</Text>
            </View>
          ) : (
            topConsumers.map((item) => (
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
                <View style={styles.consumerRight}>
                  <Text style={styles.consumerPct}>{item.pct}%</Text>
                  <Text style={styles.consumerCost}>
                    {bill.currency}{item.cost.toFixed(2)}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>

        {/* ---- Sensor Metrics section ---- */}
        <Text style={[styles.sectionTitle, { marginTop: 28, marginBottom: 12 }]}>
          Sensor Metrics
        </Text>

        {metrics.map((metric) => {
          const accent = METRIC_ACCENT[metric.key];
          return (
            <View key={metric.key} style={styles.metricCard}>
              {/* Header row: label + avg/min/max */}
              <View style={styles.metricHeader}>
                <View style={styles.metricLabelRow}>
                  <View style={[styles.metricAccentBar, { backgroundColor: accent }]} />
                  <Text style={styles.metricName}>{metric.label}</Text>
                  <Text style={styles.metricUnitBadge}>{metric.unit}</Text>
                </View>
              </View>

              {/* Avg / Min / Max row */}
              <View style={styles.metricStatsRow}>
                <View style={styles.metricStat}>
                  <Text style={[styles.metricStatValue, { color: accent }]}>
                    {metric.avg.toFixed(metric.unit === "PF" ? 2 : metric.unit === "A" ? 2 : 1)}
                  </Text>
                  <Text style={styles.metricStatLabel}>Avg</Text>
                </View>
                <View style={styles.metricStatDivider} />
                <View style={styles.metricStat}>
                  <Text style={styles.metricStatValue}>
                    {metric.min.toFixed(metric.unit === "PF" ? 2 : metric.unit === "A" ? 2 : 1)}
                  </Text>
                  <Text style={styles.metricStatLabel}>Min</Text>
                </View>
                <View style={styles.metricStatDivider} />
                <View style={styles.metricStat}>
                  <Text style={styles.metricStatValue}>
                    {metric.max.toFixed(metric.unit === "PF" ? 2 : metric.unit === "A" ? 2 : 1)}
                  </Text>
                  <Text style={styles.metricStatLabel}>Max</Text>
                </View>
              </View>

              {/* "Show more info" collapsible — default collapsed */}
              <Collapsible title="Show more info" defaultOpen={false}>
                <Text style={styles.metricInfo}>{metric.info}</Text>
              </Collapsible>
            </View>
          );
        })}

      </ScrollView>

      {/* Update Tariff Modal */}
      <Modal
        visible={tariffModalVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => {
          if (!updatingTariff) setTariffModalVisible(false);
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => {
              if (!updatingTariff) {
                Keyboard.dismiss();
                setTariffModalVisible(false);
              }
            }}
          >
            <Pressable style={styles.modalCard} onPress={Keyboard.dismiss}>
              <View style={styles.modalIconWrap}>
                <Ionicons name="calculator-outline" size={28} color={C.accent} />
              </View>

              <Text style={styles.modalTitle}>Update Tariff Rate</Text>
              <Text style={styles.modalMessage}>
                Set the utility rate charged by your electricity provider per kWh.
              </Text>

              <View style={styles.inputContainer}>
                <Text style={styles.currencyPrefix}>{bill.currency}</Text>
                <TextInput
                  style={styles.tariffTextInput}
                  keyboardType="decimal-pad"
                  value={tariffInput}
                  onChangeText={(text) => {
                    setTariffInput(text);
                    if (tariffError) setTariffError(null);
                  }}
                  placeholder="10.50"
                  placeholderTextColor={C.sub}
                  selectTextOnFocus
                  autoFocus
                  editable={!updatingTariff}
                />
                <Text style={styles.unitSuffix}>/kWh</Text>
              </View>

              {tariffError && (
                <Text style={styles.errorText}>{tariffError}</Text>
              )}

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.modalBtn, styles.modalCancelBtn]}
                  onPress={() => {
                    Keyboard.dismiss();
                    setTariffModalVisible(false);
                  }}
                  activeOpacity={0.8}
                  disabled={updatingTariff}
                >
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modalBtn, styles.modalSaveBtn]}
                  onPress={handleSaveTariff}
                  activeOpacity={0.8}
                  disabled={updatingTariff}
                >
                  {updatingTariff ? (
                    <ActivityIndicator size="small" color="#1a1f2e" />
                  ) : (
                    <Text style={styles.modalSaveText}>Save</Text>
                  )}
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
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
  consumerRight: {
    alignItems: "flex-end",
    width: 68,
  },
  consumerPct: {
    color: C.sub,
    fontSize: 12,
    textAlign: "right",
  },
  consumerCost: {
    color: C.text,
    fontSize: 11,
    fontWeight: "600",
    marginTop: 2,
    textAlign: "right",
  },
  // ---- Sensor Metrics ----
  metricCard: {
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  metricHeader: {
    marginBottom: 12,
  },
  metricLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  metricAccentBar: {
    width: 3,
    height: 18,
    borderRadius: 2,
  },
  metricName: {
    color: C.text,
    fontSize: 15,
    fontWeight: "700",
    flex: 1,
  },
  metricUnitBadge: {
    color: C.sub,
    fontSize: 12,
    fontWeight: "600",
    backgroundColor: C.bg,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: "hidden",
  },
  metricStatsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  metricStat: {
    flex: 1,
    alignItems: "center",
  },
  metricStatValue: {
    color: C.text,
    fontSize: 18,
    fontWeight: "700",
    lineHeight: 22,
  },
  metricStatLabel: {
    color: C.sub,
    fontSize: 11,
    marginTop: 2,
  },
  metricStatDivider: {
    width: 1,
    height: 32,
    backgroundColor: C.border,
  },
  metricInfo: {
    color: C.sub,
    fontSize: 13,
    lineHeight: 20,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  modalCard: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: C.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    padding: 24,
    alignItems: "center",
  },
  modalIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(0,212,170,0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  modalTitle: {
    color: C.text,
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 6,
  },
  modalMessage: {
    color: C.sub,
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
    marginBottom: 20,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 54,
    width: "100%",
    marginBottom: 12,
  },
  currencyPrefix: {
    color: C.accent,
    fontSize: 18,
    fontWeight: "700",
    marginRight: 8,
  },
  tariffTextInput: {
    flex: 1,
    color: C.text,
    fontSize: 18,
    fontWeight: "600",
    paddingVertical: 8,
  },
  unitSuffix: {
    color: C.sub,
    fontSize: 14,
    fontWeight: "500",
    marginLeft: 8,
  },
  errorText: {
    color: C.red,
    fontSize: 13,
    fontWeight: "500",
    marginBottom: 12,
    textAlign: "center",
  },
  modalActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
    alignSelf: "stretch",
  },
  modalBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  modalCancelBtn: {
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: "transparent",
  },
  modalCancelText: {
    color: C.sub,
    fontSize: 15,
    fontWeight: "700",
  },
  modalSaveBtn: {
    backgroundColor: C.accent,
  },
  modalSaveText: {
    color: "#1a1f2e",
    fontSize: 15,
    fontWeight: "700",
  },
  tariffValueContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 24,
    gap: 4,
  },
  emptyText: {
    color: C.sub,
    fontSize: 13,
    textAlign: "center",
    lineHeight: 18,
  },
});

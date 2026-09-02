import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
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
import { PullToRefresh } from "../../components/pull-to-refresh";
import { usePullToRefresh } from "../../hooks/usePullToRefresh";
import { useTheme } from "../../context/ThemeContext";
import { useUnits } from "../../context/UnitsContext";
import { useDemoData } from "../../context/DemoDataContext";
import { demoAnalytics } from "../../lib/demo-data";
import RangeNavigator from "../../components/RangeNavigator";
import { getStoredBillingCycle, saveBillingCycle } from "../../lib/billing-storage";
import {
  defaultRangeState,
  rangeLabel,
  rangeQuery,
  type BillingCycle,
  type RangeState,
} from "../../lib/range-prefs";
import {
  energyIn,
  parseRate,
  powerIn,
  resolvePowerUnit,
  MAX_RATE_PER_KWH,
  MIN_RATE_PER_KWH,
} from "../../lib/unit-prefs";
import { useThemedStyles } from "../../components/themed";
import type { ThemeColors } from "../../constants/theme";

// Decorative multi-series chart/legend colors with no equivalent semantic
// theme token — kept as fixed accents rather than theme-derived.
const CHART_BLUE = "#3b82f6";
const CHART_PURPLE = "#8b5cf6";
const CHART_PINK = "#ec4899";
const CHART_GRAY = "#4b5563";

const CIRCUMFERENCE = 502.655;
const RADIUS = 80;
const CX = 110;
const CY = 110;
const STROKE_WIDTH = 24;

// kWh figures split the same 87.4 kWh the bill predictor fallback below uses,
// so the offline demo numbers stay consistent. The cost fields are vestigial —
// every cost shown is derived from kwh at the user's own tariff — but they are
// kept so these literals still satisfy the ConsumerSlice shape.
function getDonutSegments(colors: ThemeColors) {
  return [
    { label: "Aircon", pct: 42, color: colors.accent, kwh: 36.71, cost: 385.46 },
    { label: "Fridge", pct: 21, color: CHART_BLUE,     kwh: 18.35, cost: 192.68 },
    { label: "Lights", pct: 14, color: colors.yellow,  kwh: 12.24, cost: 128.52 },
    { label: "Others", pct: 23, color: CHART_GRAY,     kwh: 20.10, cost: 211.05 },
  ];
}

function getTopConsumers(colors: ThemeColors) {
  return [
    { id: "1", name: "Aircon",          pct: 42, color: colors.accent, kwh: 36.71, cost: 385.46 },
    { id: "2", name: "Fridge",          pct: 21, color: CHART_BLUE,    kwh: 18.35, cost: 192.68 },
    { id: "3", name: "Lights",          pct: 14, color: colors.yellow, kwh: 12.24, cost: 128.52 },
    { id: "4", name: "Washing Machine", pct: 9,  color: CHART_PURPLE,  kwh: 7.87,  cost: 82.64  },
    { id: "5", name: "Others",          pct: 5,  color: CHART_PINK,    kwh: 4.37,  cost: 45.89  },
  ];
}

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

// Accent colour per metric key for the label pill.
function getMetricAccent(colors: ThemeColors): Record<MetricStat["key"], string> {
  return {
    voltage:     colors.accent,
    current:     CHART_BLUE,
    activePower: colors.yellow,
    energy:      CHART_PURPLE,
    frequency:   CHART_PINK,
    powerFactor: colors.green,
  };
}

export default function AnalyticsScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { prefs, currency, setRatePerKwh, costOf, formatCostOf, energyParts } = useUnits();
  const { demoData } = useDemoData();
  const DONUT_SEGMENTS = getDonutSegments(colors);
  const TOP_CONSUMERS = getTopConsumers(colors);
  const METRIC_ACCENT = getMetricAccent(colors);

  // Which slice of time every figure below the bill card describes. Always
  // opens on today; the saved billing window is folded in once it loads.
  const [range, setRange]       = useState<RangeState>(() => defaultRangeState("Day"));
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // States for updating tariff rate
  const [tariffModalVisible, setTariffModalVisible] = useState(false);
  const [tariffInput, setTariffInput] = useState("");
  const [updatingTariff, setUpdatingTariff] = useState(false);
  const [tariffError, setTariffError] = useState<string | null>(null);

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

  // Fetch analytics — shared by the range/refresh-trigger effect below and
  // pull-to-refresh.
  const fetchAnalytics = useCallback(async () => {
    const data = await api.get<AnalyticsData>(`/analytics?${rangeKey}`);
    setAnalytics(data);
  }, [rangeKey]);

  // Refetch whenever the selected range or refresh trigger changes.
  useEffect(() => {
    fetchAnalytics().catch(() => {
      // Offline-first: fall back to local mock values.
    });
  }, [fetchAnalytics, refreshTrigger]);

  const { refreshing, onRefresh } = usePullToRefresh(fetchAnalytics);

  // Sample-data mode overlays the whole payload at render time; the fetched
  // one stays in state underneath, so turning it off needs no re-fetch.
  // Memoised on the period so the donut isn't handed new arrays every render.
  const demoView = useMemo(
    () => (demoData ? demoAnalytics(range) : null),
    [demoData, range]
  );
  const view = demoView ?? analytics;

  const breakdown    = view?.breakdown   ?? DONUT_SEGMENTS;
  const topConsumers = view !== null ? view.topConsumers : TOP_CONSUMERS;
  const totalKwh     = view?.totalKwh     ?? 87.4;
  const metrics      = view?.metrics      ?? FALLBACK_METRICS;
  // The rate and currency are no longer read off this payload — they come from
  // the shared unit preferences, which are the same values the backend computed
  // with (see context/UnitsContext.tsx) and stay right even offline.
  const bill = view?.billPredictor ?? {
    accumulatedKwh: 87.4,
    // Derived rather than hard-coded: a fixed date here would show a stale
    // month to anyone who opened the screen offline.
    cycleStart: new Date(
      new Date().getFullYear(),
      new Date().getMonth(),
      1
    ).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    cycleEnd: null as string | null,
  };

  const handleSaveTariff = async () => {
    const rate = parseRate(tariffInput);
    if (rate === null) {
      setTariffError(`Enter a rate between ${MIN_RATE_PER_KWH} and ${MAX_RATE_PER_KWH}.`);
      return;
    }

    setUpdatingTariff(true);
    setTariffError(null);

    // Saving through the shared context keeps this editor and the Units &
    // Tariff settings screen on one code path; it applies the rate locally
    // whether or not the push reaches the server, so the figures below update
    // either way.
    await setRatePerKwh(rate);

    setUpdatingTariff(false);
    setTariffModalVisible(false);
    // Refetch so the server-side breakdown reflects the new rate as well.
    setRefreshTrigger((prev) => prev + 1);
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
      <PullToRefresh
        refreshing={refreshing}
        onRefresh={onRefresh}
        contentContainerStyle={styles.scroll}
        indicatorColor={colors.accent}
      >
        <Text style={styles.heading}>Analytics</Text>

        {/* Bill Predictor */}
        <View style={styles.card}>
          <View style={styles.billTopRow}>
            <Text style={styles.billLabel}>BILL PREDICTOR</Text>
            <Ionicons
              name="information-circle-outline"
              size={18}
              color={colors.sub}
            />
          </View>

          <View style={styles.divider} />

          <TouchableOpacity
            style={styles.billRow}
            onPress={() => {
              setTariffInput(prefs.ratePerKwh.toFixed(2));
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
                {currency.symbol} {prefs.ratePerKwh.toFixed(2)} /kWh
              </Text>
              <Ionicons
                name="create-outline"
                size={14}
                color={colors.accent}
                style={{ marginLeft: 6 }}
              />
            </View>
          </TouchableOpacity>

          <View style={[styles.billRow, { marginTop: 10 }]}>
            <Text style={styles.billRowLabel}>Rate Accumulated</Text>
            <Text style={styles.billRowValue}>
              {energyParts(bill.accumulatedKwh, 1).value}{" "}
              {energyParts(bill.accumulatedKwh, 1).unit}
            </Text>
          </View>

          <View style={[styles.billEstRow, { marginTop: 16 }]}>
            <Text style={styles.billEstLabel}>{"Est.\nBill"}</Text>
            <View style={styles.billAmountRow}>
              <Text style={styles.billCurrency}>{currency.symbol}</Text>
              {/* Priced from the accumulated kWh at the user's own rate, so the
                  estimate moves the moment the tariff is edited. */}
              <Text style={styles.billAmount}>
                {costOf(bill.accumulatedKwh).toFixed(2)}
              </Text>
            </View>
          </View>

          <Text style={styles.billFooter}>
            {bill.cycleEnd
              ? `Based on the kWh recorded in this billing cycle.\nCycle: ${bill.cycleStart} – ${bill.cycleEnd}`
              : `Based on accumulated kWh since billing period.\nBilling cycle started: ${bill.cycleStart}`}
          </Text>
        </View>

        {/* Timeline. Governs everything below: the breakdown, the top
            consumers and the metric stats all follow this range. Shared with
            the Dashboard so the two screens describe time identically. */}
        <View style={styles.navigatorWrap}>
          <RangeNavigator
            state={range}
            onChange={setRange}
            onCycleSave={handleCycleSave}
          />
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
                stroke={colors.border}
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
              <Text style={styles.donutValue}>{energyParts(totalKwh, 1).value}</Text>
              <Text style={styles.donutUnit}>{energyParts(totalKwh, 1).unit}</Text>
              <Text style={styles.donutTotal}>Total</Text>
            </View>
          </View>

          <View style={styles.legendGrid}>
            {breakdown.map((seg) => (
              <View key={seg.label} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: seg.color }]} />
                <Text style={styles.legendText}>
                  {seg.label} {seg.pct}% · {formatCostOf(seg.kwh)}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Top Consumers */}
        <View style={[styles.consumersHeader, { marginTop: 24, marginBottom: 12 }]}>
          <Text style={styles.sectionTitle}>Top Consumers</Text>
          <Text style={styles.sectionRangeHint} numberOfLines={1}>
            {rangeLabel(range)}
          </Text>
        </View>

        <View style={[styles.card, styles.consumersCard]}>
          {topConsumers.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="alert-circle-outline" size={24} color={colors.sub} style={{ marginBottom: 6 }} />
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
                  <Text style={styles.consumerCost}>{formatCostOf(item.kwh)}</Text>
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
          // Active power and energy follow the unit preferences; the other four
          // (V, A, Hz, PF) keep the unit the backend labelled them with. The
          // unit is resolved once from the average so the avg/min/max trio is
          // rendered in the same unit as the badge above it.
          const powerUnit = resolvePowerUnit(metric.avg, prefs);
          const unitBadge =
            metric.key === "activePower"
              ? powerUnit
              : metric.key === "energy"
                ? prefs.energyUnit
                : metric.unit;
          const stat = (value: number) => {
            if (metric.key === "activePower") return powerIn(value, powerUnit);
            if (metric.key === "energy") return energyIn(value, prefs.energyUnit, 2);
            return value.toFixed(metric.unit === "PF" || metric.unit === "A" ? 2 : 1);
          };
          return (
            <View key={metric.key} style={styles.metricCard}>
              {/* Header row: label + avg/min/max */}
              <View style={styles.metricHeader}>
                <View style={styles.metricLabelRow}>
                  <View style={[styles.metricAccentBar, { backgroundColor: accent }]} />
                  <Text style={styles.metricName}>{metric.label}</Text>
                  <Text style={styles.metricUnitBadge}>{unitBadge}</Text>
                </View>
              </View>

              {/* Avg / Min / Max row */}
              <View style={styles.metricStatsRow}>
                <View style={styles.metricStat}>
                  <Text style={[styles.metricStatValue, { color: accent }]}>
                    {stat(metric.avg)}
                  </Text>
                  <Text style={styles.metricStatLabel}>Avg</Text>
                </View>
                <View style={styles.metricStatDivider} />
                <View style={styles.metricStat}>
                  <Text style={styles.metricStatValue}>
                    {stat(metric.min)}
                  </Text>
                  <Text style={styles.metricStatLabel}>Min</Text>
                </View>
                <View style={styles.metricStatDivider} />
                <View style={styles.metricStat}>
                  <Text style={styles.metricStatValue}>
                    {stat(metric.max)}
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

      </PullToRefresh>

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
                <Ionicons name="calculator-outline" size={28} color={colors.accent} />
              </View>

              <Text style={styles.modalTitle}>Update Tariff Rate</Text>
              <Text style={styles.modalMessage}>
                Set the utility rate charged by your electricity provider per kWh.
              </Text>

              <View style={styles.inputContainer}>
                <Text style={styles.currencyPrefix}>{currency.symbol}</Text>
                <TextInput
                  style={styles.tariffTextInput}
                  keyboardType="decimal-pad"
                  value={tariffInput}
                  onChangeText={(text) => {
                    setTariffInput(text);
                    if (tariffError) setTariffError(null);
                  }}
                  placeholder="10.50"
                  placeholderTextColor={colors.sub}
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
                    <ActivityIndicator size="small" color={colors.bg} />
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

function createStyles(colors: ThemeColors, fontScale: number) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.bg,
    },
    scroll: {
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 24,
    },
    heading: {
      color: colors.text,
      fontSize: 28 * fontScale,
      fontWeight: "700",
      marginBottom: 20,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 16,
    },
    billTopRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    billLabel: {
      color: colors.sub,
      fontSize: 11 * fontScale,
      fontWeight: "600",
      letterSpacing: 1,
    },
    divider: {
      height: 1,
      backgroundColor: colors.border,
      marginVertical: 12,
    },
    billRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    billRowLabel: {
      color: colors.sub,
      fontSize: 13 * fontScale,
    },
    billRowValue: {
      color: colors.text,
      fontSize: 13 * fontScale,
      fontWeight: "600",
    },
    dashedValue: {
      borderBottomWidth: 1,
      borderBottomColor: colors.sub,
      borderStyle: "dashed",
      paddingBottom: 1,
    },
    billEstRow: {
      flexDirection: "row",
      alignItems: "flex-end",
      justifyContent: "space-between",
    },
    billEstLabel: {
      color: colors.text,
      fontSize: 15 * fontScale,
      fontWeight: "700",
      lineHeight: 22 * fontScale,
    },
    billAmountRow: {
      flexDirection: "row",
      alignItems: "flex-end",
    },
    billCurrency: {
      color: colors.accent,
      fontSize: 20 * fontScale,
      marginBottom: 4,
      marginRight: 2,
    },
    billAmount: {
      color: colors.accent,
      fontSize: 36 * fontScale,
      fontWeight: "800",
      lineHeight: 40 * fontScale,
    },
    billFooter: {
      color: colors.sub,
      fontSize: 11 * fontScale,
      marginTop: 8,
      lineHeight: 16 * fontScale,
    },
    navigatorWrap: {
      marginTop: 20,
    },
    sectionRangeHint: {
      color: colors.sub,
      fontSize: 12 * fontScale,
      fontWeight: "600",
      flexShrink: 1,
      marginLeft: 8,
    },
    sectionTitle: {
      color: colors.text,
      fontSize: 18 * fontScale,
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
      color: colors.text,
      fontSize: 28 * fontScale,
      fontWeight: "700",
      lineHeight: 32 * fontScale,
    },
    donutUnit: {
      color: colors.sub,
      fontSize: 12 * fontScale,
      lineHeight: 16 * fontScale,
    },
    donutTotal: {
      color: colors.sub,
      fontSize: 12 * fontScale,
      lineHeight: 16 * fontScale,
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
      color: colors.text,
      fontSize: 13 * fontScale,
    },
    consumersHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
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
      color: colors.text,
      fontSize: 13 * fontScale,
      width: 110,
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
      width: 68,
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
    // ---- Sensor Metrics ----
    metricCard: {
      backgroundColor: colors.card,
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
      color: colors.text,
      fontSize: 15 * fontScale,
      fontWeight: "700",
      flex: 1,
    },
    metricUnitBadge: {
      color: colors.sub,
      fontSize: 12 * fontScale,
      fontWeight: "600",
      backgroundColor: colors.bg,
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
      borderBottomColor: colors.border,
    },
    metricStat: {
      flex: 1,
      alignItems: "center",
    },
    metricStatValue: {
      color: colors.text,
      fontSize: 18 * fontScale,
      fontWeight: "700",
      lineHeight: 22 * fontScale,
    },
    metricStatLabel: {
      color: colors.sub,
      fontSize: 11 * fontScale,
      marginTop: 2,
    },
    metricStatDivider: {
      width: 1,
      height: 32,
      backgroundColor: colors.border,
    },
    metricInfo: {
      color: colors.sub,
      fontSize: 13 * fontScale,
      lineHeight: 20 * fontScale,
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: colors.overlay,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 24,
    },
    modalCard: {
      width: "100%",
      maxWidth: 340,
      backgroundColor: colors.card,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 24,
      alignItems: "center",
    },
    modalIconWrap: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.accentSoft,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 16,
    },
    modalTitle: {
      color: colors.text,
      fontSize: 18 * fontScale,
      fontWeight: "700",
      textAlign: "center",
      marginBottom: 6,
    },
    modalMessage: {
      color: colors.sub,
      fontSize: 13 * fontScale,
      lineHeight: 18 * fontScale,
      textAlign: "center",
      marginBottom: 20,
    },
    inputContainer: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.bg,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 16,
      height: 54,
      width: "100%",
      marginBottom: 12,
    },
    currencyPrefix: {
      color: colors.accent,
      fontSize: 18 * fontScale,
      fontWeight: "700",
      marginRight: 8,
    },
    tariffTextInput: {
      flex: 1,
      color: colors.text,
      fontSize: 18 * fontScale,
      fontWeight: "600",
      paddingVertical: 8,
    },
    unitSuffix: {
      color: colors.sub,
      fontSize: 14 * fontScale,
      fontWeight: "500",
      marginLeft: 8,
    },
    errorText: {
      color: colors.red,
      fontSize: 13 * fontScale,
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
      borderColor: colors.border,
      backgroundColor: "transparent",
    },
    modalCancelText: {
      color: colors.sub,
      fontSize: 15 * fontScale,
      fontWeight: "700",
    },
    modalSaveBtn: {
      backgroundColor: colors.accent,
    },
    modalSaveText: {
      color: colors.bg,
      fontSize: 15 * fontScale,
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
      color: colors.sub,
      fontSize: 13 * fontScale,
      textAlign: "center",
      lineHeight: 18 * fontScale,
    },
  });
}

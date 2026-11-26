import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Animated,
  View,
  Text,
  Pressable,
  StyleSheet,
  TextInput,
  Modal,
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Circle } from "react-native-svg";
import {
  Activity,
  AlertCircle,
  Calculator,
  Pencil,
} from "../../components/LucideIcons";
import { api, AnalyticsData, MetricStat } from "../../lib/api";
import Collapsible from "../../components/Collapsible";
import { PullToRefresh } from "../../components/pull-to-refresh";
import { usePullToRefresh } from "../../hooks/usePullToRefresh";
import { useTheme } from "../../context/ThemeContext";
import { useUnits } from "../../context/UnitsContext";
import { useDemoData } from "../../context/DemoDataContext";
import { demoAnalytics } from "../../lib/demo-data";
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

// Multi-series chart & breakdown palette — strictly zero violet/lavender:
// teal (brand), cobalt blue, warm amber, sky cyan, crimson rose, neutral slate.
const CHART_BLUE = "#2563eb";
const CHART_SKY = "#0284c7";
const CHART_ROSE = "#e11d48";
const CHART_SLATE = "#64748b";

/** Maps any server-supplied purple/violet hex (#8b5cf6 etc.) onto sky cyan so the UI stays violet-free. */
function sanitizeSeriesColor(hex: string): string {
  const lower = (hex || "").toLowerCase();
  if (lower === "#8b5cf6" || lower === "#a78bfa" || lower === "#7c3aed") {
    return CHART_SKY;
  }
  return hex;
}

const CIRCUMFERENCE = 452.389; // 2 * pi * 72
const RADIUS = 72;
const CX = 96;
const CY = 96;
const STROKE_WIDTH = 20;

function getDonutSegments(colors: ThemeColors) {
  return [
    { label: "Aircon", pct: 42, color: colors.accent, kwh: 36.71, cost: 385.46 },
    { label: "Fridge", pct: 21, color: CHART_BLUE, kwh: 18.35, cost: 192.68 },
    { label: "Lights", pct: 14, color: colors.yellow, kwh: 12.24, cost: 128.52 },
    { label: "Others", pct: 23, color: CHART_SLATE, kwh: 20.1, cost: 211.05 },
  ];
}

function getTopConsumers(colors: ThemeColors) {
  return [
    { id: "1", name: "Aircon", pct: 42, color: colors.accent, kwh: 36.71, cost: 385.46 },
    { id: "2", name: "Fridge", pct: 21, color: CHART_BLUE, kwh: 18.35, cost: 192.68 },
    { id: "3", name: "Lights", pct: 14, color: colors.yellow, kwh: 12.24, cost: 128.52 },
    { id: "4", name: "Washing Machine", pct: 9, color: CHART_SKY, kwh: 7.87, cost: 82.64 },
    { id: "5", name: "Others", pct: 5, color: CHART_ROSE, kwh: 4.37, cost: 45.89 },
  ];
}

// ---- Offline-first fallback for PZEM-004T metrics ----
const FALLBACK_METRICS: MetricStat[] = [
  {
    key: "voltage",
    label: "Voltage",
    unit: "V",
    avg: 220.1,
    min: 217.4,
    max: 223.8,
    info:
      "Mains RMS voltage at the load. Nominal Philippine supply is 220 V ±10%; sustained readings below 198 V or above 242 V risk motor and compressor damage.",
  },
  {
    key: "current",
    label: "Current",
    unit: "A",
    avg: 1.44,
    min: 0.32,
    max: 3.12,
    info:
      "Total RMS current drawn across the monitored circuit. Sustained high current indicates heavy simultaneous loads or an overloaded branch.",
  },
  {
    key: "activePower",
    label: "Active Power",
    unit: "W",
    avg: 316.5,
    min: 70.2,
    max: 685.0,
    info:
      "Real power converted into work or heat. Short spikes usually come from AC compressor or refrigerator motor inrush.",
  },
  {
    key: "energy",
    label: "Energy",
    unit: "kWh",
    avg: 18.7,
    min: 12.3,
    max: 26.1,
    info:
      "Cumulative kilowatt-hours metered over the window. Multiplied directly by your tariff rate to compute electricity cost.",
  },
  {
    key: "frequency",
    label: "Frequency",
    unit: "Hz",
    avg: 60.01,
    min: 59.94,
    max: 60.08,
    info:
      "AC grid frequency (60 Hz nominal in the Philippines). Drift outside 59.8–60.2 Hz signals grid or backup-generator instability.",
  },
  {
    key: "powerFactor",
    label: "Power Factor",
    unit: "PF",
    avg: 0.92,
    min: 0.78,
    max: 0.99,
    info:
      "Ratio of active power (W) to apparent power (VA). Values near 1.00 mean inductive motors and switching supplies are drawing cleanly.",
  },
];

function getMetricAccent(colors: ThemeColors): Record<MetricStat["key"], string> {
  return {
    voltage: colors.accent,
    current: CHART_BLUE,
    activePower: colors.yellow,
    energy: CHART_SKY,
    frequency: CHART_ROSE,
    powerFactor: colors.green,
  };
}

export default function AnalyticsScreen() {
  const { colors, fontScale } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { prefs, currency, setRatePerKwh, costOf, formatEnergy, formatCostOf, energyParts } =
    useUnits();
  const { demoData } = useDemoData();

  const DONUT_SEGMENTS = getDonutSegments(colors);
  const TOP_CONSUMERS = getTopConsumers(colors);
  const METRIC_ACCENT = getMetricAccent(colors);

  const [range, setRange] = useState<RangeState>(() => defaultRangeState("Day"));
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Tariff modal state
  const [tariffModalVisible, setTariffModalVisible] = useState(false);
  const [tariffInput, setTariffInput] = useState("");
  const [tariffFocused, setTariffFocused] = useState(false);
  const [updatingTariff, setUpdatingTariff] = useState(false);
  const [tariffError, setTariffError] = useState<string | null>(null);

  const [enterOpacity] = useState(() => new Animated.Value(0));
  const [enterTranslate] = useState(() => new Animated.Value(8));

  useEffect(() => {
    Animated.parallel([
      Animated.timing(enterOpacity, {
        toValue: 1,
        duration: 380,
        useNativeDriver: true,
      }),
      Animated.timing(enterTranslate, {
        toValue: 0,
        duration: 380,
        useNativeDriver: true,
      }),
    ]).start();
  }, [enterOpacity, enterTranslate]);

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

  const fetchAnalytics = useCallback(async () => {
    const data = await api.get<AnalyticsData>(`/analytics?${rangeKey}`);
    setAnalytics(data);
  }, [rangeKey]);

  useEffect(() => {
    let cancelled = false;
    api
      .get<AnalyticsData>(`/analytics?${rangeKey}`)
      .then((data) => {
        if (!cancelled) setAnalytics(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [rangeKey, refreshTrigger]);

  const { refreshing, onRefresh } = usePullToRefresh(fetchAnalytics);

  const demoView = useMemo(
    () => (demoData ? demoAnalytics(range) : null),
    [demoData, range]
  );
  const view = demoView ?? analytics;

  const rawBreakdown = view?.breakdown ?? DONUT_SEGMENTS;
  const breakdown = useMemo(
    () => rawBreakdown.map((seg) => ({ ...seg, color: sanitizeSeriesColor(seg.color) })),
    [rawBreakdown]
  );

  const rawConsumers = view !== null ? view.topConsumers : TOP_CONSUMERS;
  const topConsumers = useMemo(
    () => rawConsumers.map((item) => ({ ...item, color: sanitizeSeriesColor(item.color) })),
    [rawConsumers]
  );

  const totalKwh = view?.totalKwh ?? 87.4;
  const metrics = view?.metrics ?? FALLBACK_METRICS;
  const visibleLabels = view?.deviceHistory?.labels ?? [];
  const deviceSeries = useMemo(
    () =>
      (view?.deviceHistory?.series ?? []).map((s) => ({
        ...s,
        color: sanitizeSeriesColor(s.color),
      })),
    [view?.deviceHistory?.series]
  );

  const bill = view?.billPredictor ?? {
    accumulatedKwh: 87.4,
    cycleStart: new Date(
      new Date().getFullYear(),
      new Date().getMonth(),
      1
    ).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    cycleEnd: null as string | null,
  };

  const openTariffEditor = () => {
    setTariffInput(prefs.ratePerKwh > 0 ? prefs.ratePerKwh.toFixed(2) : "");
    setTariffError(null);
    setTariffModalVisible(true);
  };

  const handleSaveTariff = async () => {
    const rate = parseRate(tariffInput);
    if (rate === null) {
      setTariffError(`Write a rate between ${MIN_RATE_PER_KWH} and ${MAX_RATE_PER_KWH} per kWh.`);
      return;
    }

    setUpdatingTariff(true);
    setTariffError(null);
    await setRatePerKwh(rate);
    setUpdatingTariff(false);
    setTariffModalVisible(false);
    setRefreshTrigger((prev) => prev + 1);
  };

  const segments = useMemo(() => {
    return breakdown.reduce<
      {
        label: string;
        pct: number;
        color: string;
        kwh: number;
        cost: number;
        dash: number;
        offset: number;
      }[]
    >((acc, seg) => {
      const prevSum = acc.reduce((sum, item) => sum + item.dash, 0);
      const dash = (seg.pct / 100) * CIRCUMFERENCE;
      return [...acc, { ...seg, dash, offset: -prevSum }];
    }, []);
  }, [breakdown]);

  const cycleWindowLabel = bill.cycleEnd
    ? `${bill.cycleStart} – ${bill.cycleEnd}`
    : `Since ${bill.cycleStart}`;

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <PullToRefresh
        refreshing={refreshing}
        onRefresh={onRefresh}
        contentContainerStyle={styles.scroll}
        indicatorColor={colors.accent}
      >
        <Animated.View
          style={{
            opacity: enterOpacity,
            transform: [{ translateY: enterTranslate }],
          }}
        >
          {/* Editorial Header */}
          <View style={styles.headerBlock}>
            <Text style={styles.eyebrow}>
              {demoData ? "Sample household telemetry" : "Cost & PZEM-004T history"}
            </Text>
            <Text style={styles.heading}>Analytics</Text>
            <Text style={styles.headingSub}>
              Billing cycle estimate, per-appliance kWh curves, and six-parameter electrical bounds.
            </Text>
          </View>

          {/* Bill Predictor Panel */}
          <View style={styles.card}>
            <View style={styles.billTopRow}>
              <View>
                <Text style={styles.cardEyebrow}>Cycle bill estimate</Text>
                <Text style={styles.cycleRangeText}>{cycleWindowLabel}</Text>
              </View>

              <Pressable
                style={({ pressed }) => [styles.ratePillBtn, pressed && styles.btnPressed]}
                onPress={openTariffEditor}
                accessibilityRole="button"
                accessibilityLabel="Edit electricity rate"
              >
                <Text
                  style={[
                    styles.ratePillText,
                    prefs.ratePerKwh <= 0 && { color: colors.yellow },
                  ]}
                >
                  {prefs.ratePerKwh > 0
                    ? `${currency.symbol}${prefs.ratePerKwh.toFixed(2)}/kWh`
                    : "Set rate"}
                </Text>
                <Pencil
                  size={12 * fontScale}
                  color={prefs.ratePerKwh <= 0 ? colors.yellow : colors.accent}
                  strokeWidth={2.1}
                />
              </Pressable>
            </View>

            {/* Main figure */}
            <View style={styles.billHeroRow}>
              <View style={styles.billAmountRow}>
                <Text style={styles.billCurrency}>{currency.symbol}</Text>
                <Text style={styles.billAmount}>
                  {costOf(bill.accumulatedKwh).toFixed(2)}
                </Text>
              </View>
            </View>

            {/* 2-column ledger strip */}
            <View style={styles.billLedgerRow}>
              <View style={styles.ledgerCell}>
                <Text style={styles.ledgerLabel}>Metered in cycle</Text>
                <Text style={styles.ledgerValue}>
                  {energyParts(bill.accumulatedKwh, 1).value}{" "}
                  {energyParts(bill.accumulatedKwh, 1).unit}
                </Text>
              </View>
              <View style={styles.ledgerDivider} />
              <View style={styles.ledgerCell}>
                <Text style={styles.ledgerLabel}>Active tariff</Text>
                <Text style={styles.ledgerValue}>
                  {prefs.ratePerKwh > 0
                    ? `${currency.symbol}${prefs.ratePerKwh.toFixed(2)} per kWh`
                    : "Unset"}
                </Text>
              </View>
            </View>

            {prefs.ratePerKwh <= 0 && (
              <Pressable
                style={({ pressed }) => [
                  styles.tariffWarningBox,
                  pressed && styles.btnPressed,
                ]}
                onPress={openTariffEditor}
                accessibilityRole="button"
                accessibilityLabel="Set electricity tariff rate"
              >
                <AlertCircle size={15 * fontScale} color={colors.yellow} strokeWidth={2} />
                <Text style={styles.tariffWarningText}>
                  Electricity rate is 0.00. Enter your utility kWh rate to price your usage.
                </Text>
              </Pressable>
            )}
          </View>

          {/* Range Navigator */}
          <View style={styles.navigatorWrap}>
            <RangeNavigator
              state={range}
              onChange={setRange}
              onCycleSave={handleCycleSave}
            />
          </View>

          {/* Section 1: Appliance kWh curves */}
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Appliance kWh trends</Text>
            <Text style={styles.sectionMeta} numberOfLines={1}>
              {rangeLabel(range)}
            </Text>
          </View>
          <DeviceUsageChart
            labels={visibleLabels}
            series={deviceSeries}
            period={range.period}
            rangeLabelText={rangeLabel(range)}
          />

          {/* Section 2: Share of consumption */}
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Share of consumption</Text>
            <Text style={styles.sectionMeta}>{formatCostOf(totalKwh)}</Text>
          </View>

          <View style={styles.card}>
            <View style={styles.donutWrapper}>
              <Svg
                width={192}
                height={192}
                viewBox="0 0 192 192"
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
                <Text style={styles.donutUnit}>{energyParts(totalKwh, 1).unit} total</Text>
              </View>
            </View>

            {/* Structured breakdown rows */}
            <View style={styles.breakdownList}>
              {breakdown.map((seg, idx) => (
                <View
                  key={seg.label}
                  style={[styles.breakdownRow, idx > 0 && styles.rowDivider]}
                >
                  <View style={styles.breakdownLeft}>
                    <View style={[styles.legendDot, { backgroundColor: seg.color }]} />
                    <Text style={styles.breakdownName} numberOfLines={1}>
                      {seg.label}
                    </Text>
                  </View>
                  <Text style={styles.breakdownKwh}>{formatEnergy(seg.kwh, 2)}</Text>
                  <Text style={styles.breakdownCost}>
                    {seg.pct}% · {formatCostOf(seg.kwh)}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          {/* Section 3: Highest-draw loads */}
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Highest-draw loads</Text>
            <Text style={styles.sectionMeta} numberOfLines={1}>
              {rangeLabel(range)}
            </Text>
          </View>

          <View style={styles.card}>
            {topConsumers.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Activity size={22 * fontScale} color={colors.sub} strokeWidth={1.8} />
                <Text style={styles.emptyText}>
                  No appliance usage recorded during this window.
                </Text>
              </View>
            ) : (
              topConsumers.map((item, idx) => (
                <View
                  key={item.id}
                  style={[styles.consumerItem, idx > 0 && styles.consumerItemDivider]}
                >
                  <View style={styles.consumerTopLine}>
                    <Text style={styles.consumerName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={styles.consumerFigures}>
                      {item.pct}% · {formatCostOf(item.kwh)}
                    </Text>
                  </View>
                  <View style={styles.consumerBarBg}>
                    <View
                      style={[
                        styles.consumerBar,
                        { width: `${Math.max(item.pct, 2)}%`, backgroundColor: item.color },
                      ]}
                    />
                  </View>
                </View>
              ))
            )}
          </View>

          {/* Section 4: PZEM-004T Electrical Parameters */}
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Electrical parameters</Text>
            <Text style={styles.sectionMeta}>Avg · Min · Max</Text>
          </View>

          <View style={styles.metricsStack}>
            {metrics.map((metric) => {
              const accent = METRIC_ACCENT[metric.key];
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
                  <View style={styles.metricHeader}>
                    <View style={styles.metricLabelRow}>
                      <View style={[styles.metricAccentDot, { backgroundColor: accent }]} />
                      <Text style={styles.metricName}>{metric.label}</Text>
                    </View>
                    <View style={styles.metricUnitBadge}>
                      <Text style={styles.metricUnitBadgeText}>{unitBadge}</Text>
                    </View>
                  </View>

                  <View style={styles.metricStatsRow}>
                    <View style={styles.metricStat}>
                      <Text style={styles.metricStatLabel}>Average</Text>
                      <Text style={[styles.metricStatValue, { color: accent }]}>
                        {stat(metric.avg)}
                      </Text>
                    </View>
                    <View style={styles.metricStatDivider} />
                    <View style={styles.metricStat}>
                      <Text style={styles.metricStatLabel}>Minimum</Text>
                      <Text style={styles.metricStatValue}>{stat(metric.min)}</Text>
                    </View>
                    <View style={styles.metricStatDivider} />
                    <View style={styles.metricStat}>
                      <Text style={styles.metricStatLabel}>Maximum</Text>
                      <Text style={styles.metricStatValue}>{stat(metric.max)}</Text>
                    </View>
                  </View>

                  <Collapsible title="Parameter notes" defaultOpen={false}>
                    <Text style={styles.metricInfo}>{metric.info}</Text>
                  </Collapsible>
                </View>
              );
            })}
          </View>
        </Animated.View>
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
              <View style={styles.modalHeaderRow}>
                <View style={styles.modalIconTile}>
                  <Calculator size={20 * fontScale} color={colors.accent} strokeWidth={2} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalTitle}>Electricity tariff rate</Text>
                  <Text style={styles.modalMessage}>
                    Enter your utility rate per kWh. Updates every cost estimate across VoltWise.
                  </Text>
                </View>
              </View>

              <Text style={styles.modalFieldLabel}>Rate per kilowatt-hour</Text>
              <View
                style={[
                  styles.inputContainer,
                  tariffFocused && styles.inputContainerFocused,
                  tariffError ? styles.inputContainerError : null,
                ]}
              >
                <Text style={styles.currencyPrefix}>{currency.symbol}</Text>
                <TextInput
                  style={styles.tariffTextInput}
                  keyboardType="decimal-pad"
                  value={tariffInput}
                  onFocus={() => setTariffFocused(true)}
                  onBlur={() => setTariffFocused(false)}
                  onChangeText={(text) => {
                    setTariffInput(text);
                    if (tariffError) setTariffError(null);
                  }}
                  placeholder="11.50"
                  placeholderTextColor={colors.inactive}
                  selectTextOnFocus
                  autoFocus
                  editable={!updatingTariff}
                  accessibilityLabel="Electricity rate per kilowatt-hour"
                />
                <Text style={styles.unitSuffix}>per kWh</Text>
              </View>

              {tariffError && <Text style={styles.errorText}>{tariffError}</Text>}

              <View style={styles.modalActions}>
                <Pressable
                  style={({ pressed }) => [
                    styles.modalBtn,
                    styles.modalCancelBtn,
                    pressed && styles.btnPressed,
                  ]}
                  onPress={() => {
                    Keyboard.dismiss();
                    setTariffModalVisible(false);
                  }}
                  disabled={updatingTariff}
                  accessibilityRole="button"
                >
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </Pressable>

                <Pressable
                  style={({ pressed }) => [
                    styles.modalBtn,
                    styles.modalSaveBtn,
                    pressed && !updatingTariff && styles.btnPressed,
                  ]}
                  onPress={handleSaveTariff}
                  disabled={updatingTariff}
                  accessibilityRole="button"
                >
                  {updatingTariff ? (
                    <ActivityIndicator size="small" color={colors.bg} />
                  ) : (
                    <Text style={styles.modalSaveText}>Save rate</Text>
                  )}
                </Pressable>
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
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 32,
    },

    // Editorial Header
    headerBlock: {
      marginBottom: 18,
    },
    eyebrow: {
      color: colors.accent,
      fontSize: 12.5 * fontScale,
      fontWeight: "500",
      marginBottom: 2,
    },
    heading: {
      color: colors.text,
      fontSize: 26 * fontScale,
      fontWeight: "600",
      letterSpacing: -0.4,
      lineHeight: 32 * fontScale,
    },
    headingSub: {
      color: colors.sub,
      fontSize: 13.5 * fontScale,
      lineHeight: 19 * fontScale,
      marginTop: 3,
    },

    // Shared Card
    card: {
      backgroundColor: colors.card,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 18,
    },

    // Bill Predictor
    billTopRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 12,
    },
    cardEyebrow: {
      color: colors.text,
      fontSize: 14 * fontScale,
      fontWeight: "600",
    },
    cycleRangeText: {
      color: colors.sub,
      fontSize: 12.5 * fontScale,
      marginTop: 2,
    },
    ratePillBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    ratePillText: {
      color: colors.accent,
      fontSize: 12.5 * fontScale,
      fontWeight: "600",
    },
    billHeroRow: {
      marginTop: 16,
      marginBottom: 16,
    },
    billAmountRow: {
      flexDirection: "row",
      alignItems: "baseline",
    },
    billCurrency: {
      color: colors.accent,
      fontSize: 22 * fontScale,
      fontWeight: "600",
      marginRight: 4,
    },
    billAmount: {
      color: colors.text,
      fontSize: 36 * fontScale,
      fontWeight: "600",
      letterSpacing: -0.8,
      lineHeight: 42 * fontScale,
    },
    billLedgerRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingTop: 14,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    ledgerCell: {
      flex: 1,
    },
    ledgerDivider: {
      width: 1,
      height: 28,
      backgroundColor: colors.border,
      marginHorizontal: 14,
    },
    ledgerLabel: {
      color: colors.sub,
      fontSize: 12 * fontScale,
      marginBottom: 2,
    },
    ledgerValue: {
      color: colors.text,
      fontSize: 14 * fontScale,
      fontWeight: "600",
    },
    tariffWarningBox: {
      flexDirection: "row",
      alignItems: "flex-start",
      backgroundColor: colors.yellow + "14",
      borderColor: colors.yellow + "40",
      borderWidth: 1,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginTop: 14,
      gap: 8,
    },
    tariffWarningText: {
      flex: 1,
      fontSize: 12.5 * fontScale,
      color: colors.yellow,
      fontWeight: "500",
      lineHeight: 17 * fontScale,
    },

    // Navigator
    navigatorWrap: {
      marginTop: 18,
    },

    // Section headers
    sectionHeaderRow: {
      flexDirection: "row",
      alignItems: "baseline",
      justifyContent: "space-between",
      marginTop: 24,
      marginBottom: 10,
      gap: 12,
    },
    sectionTitle: {
      color: colors.text,
      fontSize: 17 * fontScale,
      fontWeight: "600",
      letterSpacing: -0.2,
    },
    sectionMeta: {
      color: colors.sub,
      fontSize: 12.5 * fontScale,
      fontWeight: "500",
      flexShrink: 1,
    },

    // Donut & Breakdown
    donutWrapper: {
      width: 192,
      height: 192,
      alignSelf: "center",
      alignItems: "center",
      justifyContent: "center",
      marginVertical: 4,
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
      fontSize: 26 * fontScale,
      fontWeight: "600",
      letterSpacing: -0.5,
      lineHeight: 30 * fontScale,
    },
    donutUnit: {
      color: colors.sub,
      fontSize: 12 * fontScale,
      marginTop: 2,
    },
    breakdownList: {
      marginTop: 16,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    breakdownRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 10,
      gap: 10,
    },
    rowDivider: {
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    breakdownLeft: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    legendDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    breakdownName: {
      color: colors.text,
      fontSize: 14 * fontScale,
      fontWeight: "500",
      flexShrink: 1,
    },
    breakdownKwh: {
      color: colors.sub,
      fontSize: 13 * fontScale,
    },
    breakdownCost: {
      color: colors.text,
      fontSize: 13.5 * fontScale,
      fontWeight: "600",
      minWidth: 88,
      textAlign: "right",
    },

    // Top Consumers
    consumerItem: {
      gap: 7,
      paddingVertical: 10,
    },
    consumerItemDivider: {
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    consumerTopLine: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
    },
    consumerName: {
      color: colors.text,
      fontSize: 14 * fontScale,
      fontWeight: "500",
      flex: 1,
    },
    consumerFigures: {
      color: colors.text,
      fontSize: 13 * fontScale,
      fontWeight: "600",
    },
    consumerBarBg: {
      height: 6,
      backgroundColor: colors.surface,
      borderRadius: 3,
      overflow: "hidden",
    },
    consumerBar: {
      height: 6,
      borderRadius: 3,
    },

    // Electrical Parameters (Sensor Metrics)
    metricsStack: {
      gap: 10,
    },
    metricCard: {
      backgroundColor: colors.card,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 16,
      paddingTop: 15,
      paddingBottom: 8,
    },
    metricHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 12,
    },
    metricLabelRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    metricAccentDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    metricName: {
      color: colors.text,
      fontSize: 15.5 * fontScale,
      fontWeight: "600",
    },
    metricUnitBadge: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 6,
    },
    metricUnitBadgeText: {
      color: colors.sub,
      fontSize: 12 * fontScale,
      fontWeight: "600",
    },
    metricStatsRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 10,
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: colors.border,
    },
    metricStat: {
      flex: 1,
    },
    metricStatLabel: {
      color: colors.sub,
      fontSize: 11.5 * fontScale,
      marginBottom: 2,
    },
    metricStatValue: {
      color: colors.text,
      fontSize: 17 * fontScale,
      fontWeight: "600",
      lineHeight: 22 * fontScale,
    },
    metricStatDivider: {
      width: 1,
      height: 28,
      backgroundColor: colors.border,
      marginHorizontal: 12,
    },
    metricInfo: {
      color: colors.sub,
      fontSize: 13.5 * fontScale,
      lineHeight: 19.5 * fontScale,
      paddingBottom: 8,
    },

    // Empty container
    emptyContainer: {
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 22,
      gap: 6,
    },
    emptyText: {
      color: colors.sub,
      fontSize: 13.5 * fontScale,
      textAlign: "center",
      lineHeight: 19 * fontScale,
    },

    // Tariff Modal
    modalBackdrop: {
      flex: 1,
      backgroundColor: colors.overlay,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 24,
    },
    modalCard: {
      width: "100%",
      maxWidth: 380,
      backgroundColor: colors.card,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 20,
    },
    modalHeaderRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 12,
      marginBottom: 16,
    },
    modalIconTile: {
      width: 40,
      height: 40,
      borderRadius: 8,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 2,
    },
    modalTitle: {
      color: colors.text,
      fontSize: 17 * fontScale,
      fontWeight: "600",
      letterSpacing: -0.2,
      marginBottom: 3,
    },
    modalMessage: {
      color: colors.sub,
      fontSize: 13.5 * fontScale,
      lineHeight: 19 * fontScale,
    },
    modalFieldLabel: {
      color: colors.text,
      fontSize: 13.5 * fontScale,
      fontWeight: "500",
      marginBottom: 6,
    },
    inputContainer: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.bg,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      paddingHorizontal: 14,
      height: 48,
      width: "100%",
      marginBottom: 8,
    },
    inputContainerFocused: {
      borderColor: colors.accent,
    },
    inputContainerError: {
      borderColor: colors.red,
    },
    currencyPrefix: {
      color: colors.accent,
      fontSize: 16 * fontScale,
      fontWeight: "600",
      marginRight: 8,
    },
    tariffTextInput: {
      flex: 1,
      color: colors.text,
      fontSize: 16 * fontScale,
      fontWeight: "500",
      height: 48,
    },
    unitSuffix: {
      color: colors.sub,
      fontSize: 13.5 * fontScale,
      marginLeft: 8,
    },
    errorText: {
      color: colors.red,
      fontSize: 12.5 * fontScale,
      marginBottom: 8,
    },
    modalActions: {
      flexDirection: "row",
      gap: 10,
      marginTop: 12,
    },
    modalBtn: {
      flex: 1,
      height: 46,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
    },
    modalCancelBtn: {
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bg,
    },
    modalCancelText: {
      color: colors.text,
      fontSize: 14.5 * fontScale,
      fontWeight: "500",
    },
    modalSaveBtn: {
      backgroundColor: colors.accent,
    },
    modalSaveText: {
      color: colors.bg,
      fontSize: 14.5 * fontScale,
      fontWeight: "600",
    },
    btnPressed: {
      opacity: 0.85,
      transform: [{ scale: 0.99 }],
    },
  });
}

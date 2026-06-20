// Documentation only: Service layer for the analytics module.
// Computes bill prediction, total kWh consumed, category breakdown percentages,
// and top consumers for the given period. No HTTP-specific code lives here.

import { prisma } from "../../lib/prisma.ts";
import type {
  AnalyticsResponseDto,
  AnalyticsPeriod,
  BillPredictorDto,
  BreakdownEntryDto,
  TopConsumerDto,
  MetricStatDto,
} from "./analytics.dto.ts";

// The demo user ID for MVP scope.
const DEMO_USER_ID = 1;

// A fixed color palette applied in order to breakdown and topConsumer segments.
const SEGMENT_COLORS = [
  "#00d4aa",
  "#3b82f6",
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
  "#4b5563",
];

// Documentation only: Formats a Date into the "Mon D, YYYY" style expected by the mobile app.
// For example: new Date("2026-06-01") → "Jun 1, 2026".
// Accepts a Date.
// Returns a formatted string.
const formatCycleStartDate = (date: Date): string => {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

// Documentation only: Determines the start and end Date boundaries for the given period.
// Day = today midnight to now; Week = 7 days ago to now; Month = current month start to now.
// Accepts the AnalyticsPeriod string.
// Returns { start: Date, end: Date }.
const getDateRangeForPeriod = (
  period: AnalyticsPeriod
): { start: Date; end: Date } => {
  const now = new Date();

  if (period === "Day") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return { start, end: now };
  }

  if (period === "Week") {
    const start = new Date(now);
    start.setDate(now.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    return { start, end: now };
  }

  // Month: start from the first day of the current month.
  const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  return { start, end: now };
};

// Documentation only: Retrieves the most recently effective tariff for the demo user.
// If no tariff exists, returns a default rate of 10.5 ₱/kWh.
// Returns a Promise resolving to { ratePerKwh: number, currency: string }.
const getLatestTariff = async (): Promise<{
  ratePerKwh: number;
  currency: string;
}> => {
  const latestTariff = await prisma.tariff.findFirst({
    where: { userId: DEMO_USER_ID },
    orderBy: { effectiveFrom: "desc" },
  });

  return {
    ratePerKwh: latestTariff?.ratePerKwh ?? 10.5,
    currency: latestTariff?.currency ?? "₱",
  };
};

// Documentation only: Retrieves the most recent open BillingPeriod for the demo user
// (a period where endDate is null, meaning the cycle is still active).
// If none exists, returns sensible defaults.
// Returns a Promise resolving to the BillingPeriod object or a default object.
const getCurrentBillingPeriod = async () => {
  const openBillingPeriod = await prisma.billingPeriod.findFirst({
    where: { userId: DEMO_USER_ID, endDate: null },
    orderBy: { startDate: "desc" },
  });

  if (openBillingPeriod) {
    return openBillingPeriod;
  }

  // Fallback: return a synthetic billing period anchored to the current month start.
  return {
    startDate: new Date(
      new Date().getFullYear(),
      new Date().getMonth(),
      1
    ),
    accumulatedKwh: 0,
    tariffRate: 10.5,
  };
};

// Documentation only: Computes per-device kWh totals over the period window,
// then groups them into top devices + an "Others" bucket for the breakdown chart.
// Uses the SEGMENT_COLORS palette and caps individual entries at 5 before collapsing.
// Accepts { start, end } and the total kWh for the period (used to compute "Others").
// Returns a Promise resolving to { breakdown: BreakdownEntryDto[], topConsumers: TopConsumerDto[] }.
const buildBreakdownAndTopConsumers = async (
  start: Date,
  end: Date
): Promise<{
  breakdown: BreakdownEntryDto[];
  topConsumers: TopConsumerDto[];
}> => {
  // Aggregate kWh per device over the period window.
  const deviceKwhGroups = await prisma.energyReading.groupBy({
    by: ["deviceId"],
    where: {
      userId: DEMO_USER_ID,
      deviceId: { not: null },
      timestamp: { gte: start, lte: end },
    },
    _sum: { kwh: true },
  });

  if (deviceKwhGroups.length === 0) {
    return { breakdown: [], topConsumers: [] };
  }

  const deviceIds = deviceKwhGroups
    .map((g) => g.deviceId)
    .filter((id): id is number => id !== null);

  const devices = await prisma.device.findMany({
    where: { id: { in: deviceIds } },
    select: { id: true, name: true },
  });

  const deviceNameMap = new Map(devices.map((d) => [d.id, d.name]));

  const totalKwh = deviceKwhGroups.reduce(
    (sum, g) => sum + (g._sum.kwh ?? 0),
    0
  );

  if (totalKwh === 0) {
    return { breakdown: [], topConsumers: [] };
  }

  // Sort descending by kWh consumption.
  const sortedGroups = [...deviceKwhGroups].sort(
    (a, b) => (b._sum.kwh ?? 0) - (a._sum.kwh ?? 0)
  );

  // Top 5 devices for topConsumers.
  const topConsumers: TopConsumerDto[] = sortedGroups
    .slice(0, 5)
    .map((group, index) => ({
      id: String(group.deviceId),
      name: deviceNameMap.get(group.deviceId as number) ?? "Unknown",
      pct: Math.round(((group._sum.kwh ?? 0) / totalKwh) * 100),
      color: SEGMENT_COLORS[index % SEGMENT_COLORS.length],
    }));

  // Breakdown: top 3 devices + "Others" bucket for everything beyond 3.
  const TOP_BREAKDOWN_COUNT = 3;

  const topThree = sortedGroups.slice(0, TOP_BREAKDOWN_COUNT);
  const othersGroups = sortedGroups.slice(TOP_BREAKDOWN_COUNT);

  const breakdown: BreakdownEntryDto[] = topThree.map((group, index) => ({
    label: deviceNameMap.get(group.deviceId as number) ?? "Unknown",
    pct: Math.round(((group._sum.kwh ?? 0) / totalKwh) * 100),
    color: SEGMENT_COLORS[index % SEGMENT_COLORS.length],
  }));

  if (othersGroups.length > 0) {
    const othersKwh = othersGroups.reduce(
      (sum, g) => sum + (g._sum.kwh ?? 0),
      0
    );
    const othersPct = Math.round((othersKwh / totalKwh) * 100);
    if (othersPct > 0) {
      breakdown.push({
        label: "Others",
        pct: othersPct,
        color: SEGMENT_COLORS[TOP_BREAKDOWN_COUNT % SEGMENT_COLORS.length],
      });
    }
  }

  return { breakdown, topConsumers };
};

// Nominal coalesce values for PZEM-004T columns that may be NULL in older DB rows.
// Mirrors the same defaults used by the dashboard service for consistency.
const NOMINAL_VOLTAGE = 220;
const NOMINAL_FREQUENCY = 60;
const NOMINAL_POWER_FACTOR = 0.9;

// Single source-of-truth descriptor for each of the six PZEM-004T metrics.
// The info text is authored for the facility-manager audience of the VoltWise app.
const METRIC_INFO: Record<
  MetricStatDto["key"],
  { label: string; unit: string; info: string }
> = {
  voltage: {
    label: "Voltage",
    unit: "V",
    info: "Confirms the line is receiving stable power and helps detect under/over-voltage conditions that could indicate electrical faults or utility supply issues.",
  },
  current: {
    label: "Current",
    unit: "A",
    info: "Shows how much electrical current a load is drawing, which is the primary signal your Isolation Forest model uses to detect and distinguish appliance behavior.",
  },
  activePower: {
    label: "Active Power",
    unit: "W",
    info: "Tells the facility manager the actual real-time electricity consumption, which is the core number used for cost calculation and load monitoring.",
  },
  energy: {
    label: "Energy",
    unit: "kWh",
    info: "Tracks cumulative consumption over time, letting facility managers see daily/weekly/monthly usage trends and estimate electricity costs in pesos.",
  },
  frequency: {
    label: "Frequency",
    unit: "Hz",
    info: "Verifies the AC supply is operating at a stable 60Hz (Philippine standard), with deviations potentially signaling generator instability or grid issues.",
  },
  powerFactor: {
    label: "Power Factor",
    unit: "PF",
    info: "Indicates how efficiently a load uses electricity, helping identify inefficient appliances or equipment that may be costing more than their rated power suggests.",
  },
};

// Documentation only: Fetches all whole-home EnergyReading rows for the given date
// window (deviceId = null, scoped to DEMO_USER_ID) and computes avg / min / max for
// each of the six PZEM-004T metrics using an in-memory reduce over the result set.
// NULL values in current, frequency, and powerFactor columns (from pre-migration rows)
// are coalesced to their nominal defaults before aggregation.
// activePower is sourced from the watts column; energy from the kwh column.
// All results are rounded to 2 decimal places.
// Accepts { start, end } — the period window already computed by getDateRangeForPeriod.
// Returns a Promise resolving to an array of six MetricStatDto objects.
const buildMetricStats = async (
  start: Date,
  end: Date
): Promise<MetricStatDto[]> => {
  const wholeHomeReadings = await prisma.energyReading.findMany({
    where: {
      userId: DEMO_USER_ID,
      deviceId: null,
      timestamp: { gte: start, lte: end },
    },
    select: {
      watts: true,
      kwh: true,
      voltage: true,
      current: true,
      frequency: true,
      powerFactor: true,
    },
  });

  // When there are no readings for the period, return zero-valued stats
  // so the mobile app still receives a well-formed 6-element array.
  if (wholeHomeReadings.length === 0) {
    return (Object.keys(METRIC_INFO) as MetricStatDto["key"][]).map((key) => ({
      key,
      ...METRIC_INFO[key],
      avg: 0,
      min: 0,
      max: 0,
    }));
  }

  // Resolve nullable columns to nominal defaults before aggregating.
  // This keeps the math clean regardless of how old the rows are.
  const normalizedReadings = wholeHomeReadings.map((row) => ({
    voltage: row.voltage ?? NOMINAL_VOLTAGE,
    current: row.current ?? parseFloat(((row.watts) / (row.voltage ?? NOMINAL_VOLTAGE)).toFixed(3)),
    activePower: row.watts,
    energy: row.kwh,
    frequency: row.frequency ?? NOMINAL_FREQUENCY,
    powerFactor: row.powerFactor ?? NOMINAL_POWER_FACTOR,
  }));

  // Compute avg/min/max for every metric in a single reduce pass per metric key.
  const metricKeys = Object.keys(METRIC_INFO) as MetricStatDto["key"][];

  return metricKeys.map((key) => {
    const values = normalizedReadings.map((r) => r[key]);

    const sum = values.reduce((acc, v) => acc + v, 0);
    const avg = parseFloat((sum / values.length).toFixed(2));
    const min = parseFloat(Math.min(...values).toFixed(2));
    const max = parseFloat(Math.max(...values).toFixed(2));

    return {
      key,
      label: METRIC_INFO[key].label,
      unit: METRIC_INFO[key].unit,
      avg,
      min,
      max,
      info: METRIC_INFO[key].info,
    };
  });
};

// Documentation only: Computes the complete analytics payload for the given period.
// Retrieves the current tariff, billing period, per-period kWh total,
// and device breakdown + top consumer data.
// Accepts the AnalyticsPeriod ("Day" | "Week" | "Month").
// Returns a Promise resolving to an AnalyticsResponseDto.
export const getAnalyticsData = async (
  period: AnalyticsPeriod
): Promise<AnalyticsResponseDto> => {
  const { start, end } = getDateRangeForPeriod(period);

  const [tariff, billingPeriod] = await Promise.all([
    getLatestTariff(),
    getCurrentBillingPeriod(),
  ]);

  // Sum whole-home kWh over the selected period window.
  const periodKwhAggregate = await prisma.energyReading.aggregate({
    where: {
      userId: DEMO_USER_ID,
      deviceId: null,
      timestamp: { gte: start, lte: end },
    },
    _sum: { kwh: true },
  });

  const totalKwh = parseFloat(
    (periodKwhAggregate._sum.kwh ?? 0).toFixed(2)
  );

  // Build the bill predictor using the open billing period's accumulated data.
  const accumulatedKwh = parseFloat(
    billingPeriod.accumulatedKwh.toFixed(2)
  );
  const estimatedBill = parseFloat(
    (tariff.ratePerKwh * accumulatedKwh).toFixed(2)
  );

  const billPredictor: BillPredictorDto = {
    tariff: tariff.ratePerKwh,
    currency: tariff.currency,
    accumulatedKwh,
    estimatedBill,
    cycleStart: formatCycleStartDate(billingPeriod.startDate),
  };

  const [{ breakdown, topConsumers }, metrics] = await Promise.all([
    buildBreakdownAndTopConsumers(start, end),
    buildMetricStats(start, end),
  ]);

  return {
    billPredictor,
    totalKwh,
    breakdown,
    topConsumers,
    metrics,
  };
};

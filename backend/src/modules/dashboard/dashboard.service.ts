// Documentation only: Service layer for the dashboard module.
// Computes the live dashboard summary: current power draw, daily total kWh,
// device list, historical kWh buckets, and top consumers by kWh share.
// All functions accept a userId parameter so they operate on the authenticated
// user's data rather than a hardcoded demo user. No HTTP-specific code lives here.

import { prisma } from "../../lib/prisma.ts";
import { getLatestTariff } from "../../lib/tariff.ts";
import {
  bucketIndexFinder,
  endOfDay,
  startOfDay,
  type ResolvedRange,
} from "../../lib/range.ts";
import { DeviceStatus } from "../../generated/prisma/index.js";
import type {
  DashboardResponseDto,
  DashboardHistoryDto,
  DashboardDeviceHistoryDto,
  TopConsumerDto,
  ReadingDto,
} from "./dashboard";

// A reading is considered "live" if it arrived within this window.
const IOT_LIVENESS_WINDOW_MS = 5 * 60 * 1000;

// A fixed palette for the per-device Usage History lines. Eight entries so a
// typical home's device count each gets a distinct hue before wrapping.
const DEVICE_SERIES_COLORS = [
  "#00d4aa",
  "#3b82f6",
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
  "#ef4444",
  "#14b8a6",
  "#a3a3a3",
];

// A fixed color palette for top consumer chart segments.
const CONSUMER_COLORS = [
  "#00d4aa",
  "#3b82f6",
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
  "#4b5563",
];

// Documentation only: Builds one kWh series per device for the multi-line Usage
// History chart, bucketed onto the range's axis so it lines up with the
// whole-home history exactly.
//
// One range query, bucketed in memory rather than an aggregate per bucket —
// with a series per device the per-bucket approach would be devices x buckets
// round trips, and a month range now has 31 buckets.
//
// Devices with no consumption in the range are dropped rather than drawn as a
// flat zero line, and the rest are ordered by total kWh so the legend reads
// biggest-first and colours stay stable within a range.
//
// Accepts userId (number) and the resolved range.
// Returns a Promise resolving to a DashboardDeviceHistoryDto.
const buildDeviceHistory = async (
  userId: number,
  range: ResolvedRange
): Promise<DashboardDeviceHistoryDto> => {
  const { buckets } = range;
  const labels = buckets.map((bucket) => bucket.label);

  if (buckets.length === 0) return { labels, series: [] };

  const [readings, devices] = await Promise.all([
    prisma.energyReading.findMany({
      where: {
        userId,
        deviceId: { not: null },
        timestamp: { gte: buckets[0].start, lte: buckets[buckets.length - 1].end },
      },
      select: { deviceId: true, timestamp: true, kwh: true },
    }),
    prisma.device.findMany({
      where: { userId },
      select: { id: true, name: true },
    }),
  ]);

  if (readings.length === 0) return { labels, series: [] };

  const bucketIndexOf = bucketIndexFinder(buckets);

  // deviceId -> per-bucket kWh totals.
  const totalsByDevice = new Map<number, number[]>();

  for (const reading of readings) {
    if (reading.deviceId === null) continue;

    const bucketIndex = bucketIndexOf(reading.timestamp);
    if (bucketIndex === -1) continue;

    let totals = totalsByDevice.get(reading.deviceId);
    if (!totals) {
      totals = new Array(buckets.length).fill(0);
      totalsByDevice.set(reading.deviceId, totals);
    }
    totals[bucketIndex] += reading.kwh;
  }

  const deviceNameMap = new Map(devices.map((device) => [device.id, device.name]));

  return {
    labels,
    series: [...totalsByDevice.entries()]
      .map(([deviceId, totals]) => ({
        deviceId: String(deviceId),
        name: deviceNameMap.get(deviceId) ?? "Unknown Device",
        total: totals.reduce((sum, value) => sum + value, 0),
        data: totals.map((value) => parseFloat(value.toFixed(3))),
      }))
      .filter((entry) => entry.total > 0)
      .sort((a, b) => b.total - a.total)
      .map(({ total: _total, ...entry }, index) => ({
        ...entry,
        color: DEVICE_SERIES_COLORS[index % DEVICE_SERIES_COLORS.length],
      })),
  };
};

// Documentation only: Builds the whole-home kWh series on the same axis.
//
// This used to run one aggregate query per bucket, which was tolerable at 8
// buckets and is not at 31; it is now the same single-query-and-bucket shape as
// the per-device builder above.
//
// Accepts userId (number) and the resolved range.
// Returns a Promise resolving to a DashboardHistoryDto.
const buildHistory = async (
  userId: number,
  range: ResolvedRange
): Promise<DashboardHistoryDto> => {
  const { buckets } = range;
  const labels = buckets.map((bucket) => bucket.label);

  if (buckets.length === 0) return { labels, data: [] };

  const readings = await prisma.energyReading.findMany({
    where: {
      userId,
      deviceId: null, // whole-home aggregate readings
      timestamp: { gte: buckets[0].start, lte: buckets[buckets.length - 1].end },
    },
    select: { timestamp: true, kwh: true },
  });

  const bucketIndexOf = bucketIndexFinder(buckets);
  const totals = new Array(buckets.length).fill(0);

  for (const reading of readings) {
    const bucketIndex = bucketIndexOf(reading.timestamp);
    if (bucketIndex === -1) continue;
    totals[bucketIndex] += reading.kwh;
  }

  return { labels, data: totals.map((value) => parseFloat(value.toFixed(2))) };
};

// Documentation only: Computes top consumers over the selected range by summing
// each device's per-device EnergyReading kWh, expressing each as an integer
// percentage of the total. Each entry's cost is its kWh multiplied by the user's
// current tariff rate (₱/kWh).
//
// This follows the range rather than always reporting today, so the list under
// the chart describes the same window the chart is drawing. Looking at last
// January's bill and being shown this morning's biggest appliance would be a
// straightforward lie.
//
// Accepts userId (number) and the resolved range.
// Returns a Promise resolving to an array of up to 5 TopConsumerDto items.
const buildTopConsumers = async (
  userId: number,
  range: ResolvedRange
): Promise<TopConsumerDto[]> => {
  // Fetch all per-device readings in the range (deviceId IS NOT NULL).
  const [deviceReadings, tariff] = await Promise.all([
    prisma.energyReading.groupBy({
      by: ["deviceId"],
      where: {
        userId,
        deviceId: { not: null },
        timestamp: { gte: range.start, lte: range.end },
      },
      _sum: { kwh: true },
    }),
    getLatestTariff(userId),
  ]);

  if (deviceReadings.length === 0) {
    return [];
  }

  // Look up device names for the IDs we found.
  const deviceIds = deviceReadings
    .map((r) => r.deviceId)
    .filter((id): id is number => id !== null);

  const devices = await prisma.device.findMany({
    where: { id: { in: deviceIds } },
    select: { id: true, name: true },
  });

  const deviceNameMap = new Map(devices.map((d) => [d.id, d.name]));

  const totalKwh = deviceReadings.reduce(
    (sum, r) => sum + (r._sum.kwh ?? 0),
    0
  );

  if (totalKwh === 0) {
    return [];
  }

  // Sort descending by kWh so the top consumers appear first.
  const sortedReadings = [...deviceReadings].sort(
    (a, b) => (b._sum.kwh ?? 0) - (a._sum.kwh ?? 0)
  );

  return sortedReadings.slice(0, 5).map((reading, index) => {
    const kwh = parseFloat((reading._sum.kwh ?? 0).toFixed(3));
    return {
      id: String(reading.deviceId),
      name: deviceNameMap.get(reading.deviceId as number) ?? "Unknown Device",
      pct: Math.round((kwh / totalKwh) * 100),
      color: CONSUMER_COLORS[index % CONSUMER_COLORS.length],
      kwh,
      cost: parseFloat((kwh * tariff.ratePerKwh).toFixed(2)),
    };
  });
};

// Nominal sensor defaults used when a reading row has NULL for a PZEM-004T column.
// These are the safe midpoints for a healthy 220V/60Hz Philippine grid circuit.
const NOMINAL_VOLTAGE = 220;
const NOMINAL_FREQUENCY = 60;
const NOMINAL_POWER_FACTOR = 0.9;

// Documentation only: Fetches the single most-recent whole-home EnergyReading
// (deviceId = null) for the given user and maps it into a ReadingDto.
// If any nullable PZEM-004T column (current, frequency, powerFactor) is NULL
// — which may happen with pre-migration rows — it falls back to the nominal defaults
// defined above. activePower is sourced from watts; energy is sourced from kwh.
// Accepts userId (number).
// Returns a Promise resolving to a ReadingDto.
const fetchLatestWholeHomeReading = async (userId: number): Promise<ReadingDto> => {
  const latestReading = await prisma.energyReading.findFirst({
    where: { userId, deviceId: null },
    orderBy: { timestamp: "desc" },
    take: 1,
  });

  if (!latestReading) {
    // No readings exist yet — return a fully nominal placeholder.
    return {
      voltage: NOMINAL_VOLTAGE,
      current: 0,
      activePower: 0,
      energy: 0,
      frequency: NOMINAL_FREQUENCY,
      powerFactor: NOMINAL_POWER_FACTOR,
      timestamp: new Date().toISOString(),
    };
  }

  const activePower = latestReading.watts;
  const voltage = latestReading.voltage ?? NOMINAL_VOLTAGE;
  // Derive current from power ÷ voltage when the column is NULL.
  const current =
    latestReading.current ?? parseFloat((activePower / voltage).toFixed(3));

  return {
    voltage,
    current,
    activePower,
    energy: latestReading.kwh,
    frequency: latestReading.frequency ?? NOMINAL_FREQUENCY,
    powerFactor: latestReading.powerFactor ?? NOMINAL_POWER_FACTOR,
    timestamp: latestReading.timestamp.toISOString(),
  };
};

// Documentation only: Computes the complete dashboard payload for the given range.
// Fetches active devices for current power (currentKw), sums today's whole-home kWh,
// builds the history buckets, and computes top consumers by share.
//
// Note the deliberate split: the hero card (currentKw, totalTodayKwh, reading,
// iotOnline) is always *live* — it describes the meter right now — while the
// chart and top consumers follow whichever range the user navigated to. Someone
// reading January's bill still needs to see that their aircon is running today.
//
// Accepts userId (number) and the resolved range.
// Returns a Promise resolving to a DashboardResponseDto.
export const getDashboardData = async (
  userId: number,
  range: ResolvedRange
): Promise<DashboardResponseDto> => {
  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);

  // Fetch all devices for the live device list panel.
  const allDevices = await prisma.device.findMany({
    where: { userId },
  });

  // Current total watts = sum of ratedWatts for ACTIVE devices only.
  const totalActiveWatts = allDevices
    .filter((d) => d.status === DeviceStatus.ACTIVE)
    .reduce((sum, d) => sum + d.ratedWatts, 0);

  const currentKw = parseFloat((totalActiveWatts / 1000).toFixed(2));

  // Total kWh consumed today from whole-home aggregate readings.
  const todayKwhAggregate = await prisma.energyReading.aggregate({
    where: {
      userId,
      deviceId: null,
      timestamp: { gte: todayStart, lte: todayEnd },
    },
    _sum: { kwh: true },
  });

  const totalTodayKwh = parseFloat(
    (todayKwhAggregate._sum.kwh ?? 0).toFixed(2)
  );

  // Build the device list for the dashboard card.
  const deviceSummaries = allDevices.map((device) => ({
    id: String(device.id),
    name: device.name,
    watts: device.ratedWatts,
    active: device.status === DeviceStatus.ACTIVE,
  }));

  const [history, deviceHistory, topConsumers, reading, recentCount] = await Promise.all([
    buildHistory(userId, range),
    buildDeviceHistory(userId, range),
    buildTopConsumers(userId, range),
    fetchLatestWholeHomeReading(userId),
    prisma.energyReading.count({
      where: {
        userId,
        deviceId: null,
        timestamp: { gte: new Date(Date.now() - IOT_LIVENESS_WINDOW_MS) },
      },
    }),
  ]);

  const iotOnline = recentCount > 0;

  return {
    currentKw,
    totalTodayKwh,
    devices: deviceSummaries,
    history,
    deviceHistory,
    topConsumers,
    reading,
    iotOnline,
    range: {
      period: range.period,
      from: range.start.toISOString(),
      to: range.end.toISOString(),
      label: range.label,
    },
  };
};

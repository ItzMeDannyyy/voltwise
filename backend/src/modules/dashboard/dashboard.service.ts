// Documentation only: Service layer for the dashboard module.
// Computes the live dashboard summary: current power draw, daily total kWh,
// device list, historical kWh buckets, and top consumers by kWh share.
// All functions accept a userId parameter so they operate on the authenticated
// user's data rather than a hardcoded demo user. No HTTP-specific code lives here.

import { prisma } from "../../lib/prisma.ts";
import { getLatestTariff } from "../../lib/tariff.ts";
import { DeviceStatus } from "../../generated/prisma/index.js";
import type {
  DashboardResponseDto,
  DashboardPeriod,
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

// Documentation only: Returns a new Date set to midnight (00:00:00.000) of the same local day.
// Used to define the start boundary for "today" queries.
// Accepts a Date.
// Returns a Date at midnight.
const startOfDay = (date: Date): Date => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

// Documentation only: Returns a new Date set to 23:59:59.999 of the same local day.
// Used to define the end boundary for "today" queries.
// Accepts a Date.
// Returns a Date at end-of-day.
const endOfDay = (date: Date): Date => {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
};

// Documentation only: Returns the ISO string label for a bucket depending on period.
// Day → "Ha" format (e.g. "6a", "9a", "12p").
// Week → 3-letter day abbreviation (e.g. "Mon").
// Month → 3-letter month abbreviation (e.g. "Jan").
// Accepts a Date and the period string.
// Returns a string label.
const formatBucketLabel = (date: Date, period: DashboardPeriod): string => {
  if (period === "Day") {
    const hour = date.getHours();
    if (hour === 0) return "12a";
    if (hour < 12) return `${hour}a`;
    if (hour === 12) return "12p";
    return `${hour - 12}p`;
  }
  if (period === "Week") {
    return date.toLocaleDateString("en-US", { weekday: "short" });
  }
  // Month period — show month abbreviation
  return date.toLocaleDateString("en-US", { month: "short" });
};

// Documentation only: Builds the history chart data (labels + kWh values) for the given period.
// Day = ~9 hourly buckets across the current day.
// Week = 7 day buckets (past 7 days).
// Month = 12 monthly buckets (past 12 months, or current year months).
// Fetches EnergyReading rows for the given user in the relevant window and sums kWh per bucket.
// Accepts userId (number) and the period string.
// Returns a Promise resolving to a DashboardHistoryDto.
// Documentation only: Computes the x-axis buckets for a period — the single
// definition of the chart's time axis, shared by the whole-home history and the
// per-device series so their labels always line up.
// Accepts the period and the current time.
// Returns an ordered array of { label, start, end }, excluding future buckets.
interface HistoryBucket {
  label: string;
  start: Date;
  end: Date;
}

const buildBuckets = (period: DashboardPeriod, now: Date): HistoryBucket[] => {
  const buckets: HistoryBucket[] = [];

  if (period === "Day") {
    // Every 3 hours from midnight to the current hour, giving up to 8 points.
    const todayStart = startOfDay(now);
    for (const bucketHour of [0, 3, 6, 9, 12, 15, 18, 21]) {
      const start = new Date(todayStart);
      start.setHours(bucketHour);
      if (start > now) break;

      const end = new Date(start);
      end.setHours(bucketHour + 2, 59, 59, 999);
      buckets.push({ label: formatBucketLabel(start, "Day"), start, end });
    }
    return buckets;
  }

  if (period === "Week") {
    // One bucket per day for the past 7 days.
    for (let daysAgo = 6; daysAgo >= 0; daysAgo--) {
      const day = new Date(now);
      day.setDate(now.getDate() - daysAgo);
      const start = startOfDay(day);
      buckets.push({
        label: formatBucketLabel(start, "Week"),
        start,
        end: endOfDay(day),
      });
    }
    return buckets;
  }

  // Month: one bucket per calendar month of the current year.
  const currentYear = now.getFullYear();
  for (let month = 0; month < 12; month++) {
    const start = new Date(currentYear, month, 1, 0, 0, 0, 0);
    if (start > now) break;
    buckets.push({
      label: formatBucketLabel(start, "Month"),
      start,
      end: new Date(currentYear, month + 1, 0, 23, 59, 59, 999),
    });
  }
  return buckets;
};

// Documentation only: Builds one kWh series per device for the multi-line Usage
// History chart, bucketed onto the same axis as the whole-home history.
//
// Unlike buildHistoryForPeriod, this issues a single range query and buckets in
// memory rather than one aggregate per bucket — with a series per device the
// per-bucket approach would be devices x buckets round trips.
//
// Devices with no consumption in the period are dropped rather than drawn as a
// flat zero line, and the rest are ordered by total kWh so the legend reads
// biggest-first and colours stay stable within a period.
//
// Accepts userId (number) and the period.
// Returns a Promise resolving to a DashboardDeviceHistoryDto.
const buildDeviceHistoryForPeriod = async (
  userId: number,
  period: DashboardPeriod
): Promise<DashboardDeviceHistoryDto> => {
  const buckets = buildBuckets(period, new Date());
  const labels = buckets.map((bucket) => bucket.label);

  if (buckets.length === 0) return { labels, series: [] };

  const rangeStart = buckets[0].start;
  const rangeEnd = buckets[buckets.length - 1].end;

  const [readings, devices] = await Promise.all([
    prisma.energyReading.findMany({
      where: {
        userId,
        deviceId: { not: null },
        timestamp: { gte: rangeStart, lte: rangeEnd },
      },
      select: { deviceId: true, timestamp: true, kwh: true },
    }),
    prisma.device.findMany({
      where: { userId },
      select: { id: true, name: true },
    }),
  ]);

  if (readings.length === 0) return { labels, series: [] };

  // deviceId -> per-bucket kWh totals.
  const totalsByDevice = new Map<number, number[]>();

  for (const reading of readings) {
    if (reading.deviceId === null) continue;

    // Buckets are ordered and non-overlapping, so the first match wins.
    const bucketIndex = buckets.findIndex(
      (bucket) =>
        reading.timestamp >= bucket.start && reading.timestamp <= bucket.end
    );
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

const buildHistoryForPeriod = async (
  userId: number,
  period: DashboardPeriod
): Promise<DashboardHistoryDto> => {
  const now = new Date();
  const labels: string[] = [];
  const data: number[] = [];

  if (period === "Day") {
    // Buckets: every 3 hours from midnight to current hour, giving ~9 points.
    const bucketHours = [0, 3, 6, 9, 12, 15, 18, 21];
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);

    const readings = await prisma.energyReading.findMany({
      where: {
        userId,
        deviceId: null, // whole-home aggregate readings
        timestamp: { gte: todayStart, lte: todayEnd },
      },
    });

    for (const bucketHour of bucketHours) {
      const bucketDate = new Date(todayStart);
      bucketDate.setHours(bucketHour);

      if (bucketDate > now) break; // Do not include future buckets

      const bucketEnd = new Date(bucketDate);
      bucketEnd.setHours(bucketHour + 2, 59, 59, 999);

      const bucketKwh = readings
        .filter(
          (r) =>
            r.timestamp >= bucketDate && r.timestamp <= bucketEnd
        )
        .reduce((sum, r) => sum + r.kwh, 0);

      labels.push(formatBucketLabel(bucketDate, "Day"));
      data.push(parseFloat(bucketKwh.toFixed(2)));
    }

    return { labels, data };
  }

  if (period === "Week") {
    // One bucket per day for the past 7 days.
    for (let daysAgo = 6; daysAgo >= 0; daysAgo--) {
      const bucketDate = new Date(now);
      bucketDate.setDate(now.getDate() - daysAgo);
      const dayStart = startOfDay(bucketDate);
      const dayEnd = endOfDay(bucketDate);

      const aggregateResult = await prisma.energyReading.aggregate({
        where: {
          userId,
          deviceId: null,
          timestamp: { gte: dayStart, lte: dayEnd },
        },
        _sum: { kwh: true },
      });

      labels.push(formatBucketLabel(bucketDate, "Week"));
      data.push(
        parseFloat((aggregateResult._sum.kwh ?? 0).toFixed(2))
      );
    }

    return { labels, data };
  }

  // Month period: one bucket per calendar month for the current year.
  const currentYear = now.getFullYear();
  for (let month = 0; month < 12; month++) {
    const monthStart = new Date(currentYear, month, 1, 0, 0, 0, 0);
    const monthEnd = new Date(currentYear, month + 1, 0, 23, 59, 59, 999);

    if (monthStart > now) break; // Do not include future months

    const aggregateResult = await prisma.energyReading.aggregate({
      where: {
        userId,
        deviceId: null,
        timestamp: { gte: monthStart, lte: monthEnd },
      },
      _sum: { kwh: true },
    });

    labels.push(formatBucketLabel(monthStart, "Month"));
    data.push(
      parseFloat((aggregateResult._sum.kwh ?? 0).toFixed(2))
    );
  }

  return { labels, data };
};

// Documentation only: Computes top consumers for the current day (regardless of period)
// by summing each ACTIVE device's per-device EnergyReading kWh for today,
// expressing each as an integer percentage of the total. Each entry's cost is
// its kWh multiplied by the user's current tariff rate (₱/kWh).
// Accepts userId (number) — scopes all queries to the authenticated user.
// Returns a Promise resolving to an array of up to 5 TopConsumerDto items.
const buildTopConsumers = async (userId: number): Promise<TopConsumerDto[]> => {
  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);

  // Fetch all per-device readings for today (deviceId IS NOT NULL).
  const [deviceReadings, tariff] = await Promise.all([
    prisma.energyReading.groupBy({
      by: ["deviceId"],
      where: {
        userId,
        deviceId: { not: null },
        timestamp: { gte: todayStart, lte: todayEnd },
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

// Documentation only: Computes the complete dashboard payload for the given period.
// Fetches active devices for current power (currentKw), sums today's whole-home kWh,
// builds the history buckets, and computes top consumers by share.
// Accepts userId (number) and the DashboardPeriod ("Day" | "Week" | "Month").
// Returns a Promise resolving to a DashboardResponseDto.
export const getDashboardData = async (
  userId: number,
  period: DashboardPeriod
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
    buildHistoryForPeriod(userId, period),
    buildDeviceHistoryForPeriod(userId, period),
    buildTopConsumers(userId),
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
  };
};

// Documentation only: Service layer for the dashboard module.
// Computes the live dashboard summary: current power draw, daily total kWh,
// device list, historical kWh buckets, and top consumers by kWh share.
// No HTTP-specific code lives here.

import { prisma } from "../../lib/prisma.ts";
import { DeviceStatus } from "../../generated/prisma/index.js";
import type {
  DashboardResponseDto,
  DashboardPeriod,
  DashboardHistoryDto,
  TopConsumerDto,
} from "./dashboard.dto.ts";

// The demo user ID for MVP scope.
const DEMO_USER_ID = 1;

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
// Fetches EnergyReading rows for the demo user in the relevant window and sums kWh per bucket.
// Accepts the period string.
// Returns a Promise resolving to a DashboardHistoryDto.
const buildHistoryForPeriod = async (
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
        userId: DEMO_USER_ID,
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
          userId: DEMO_USER_ID,
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
        userId: DEMO_USER_ID,
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
// expressing each as an integer percentage of the total.
// Accepts no parameters beyond the implicit DEMO_USER_ID scope.
// Returns a Promise resolving to an array of up to 5 TopConsumerDto items.
const buildTopConsumers = async (): Promise<TopConsumerDto[]> => {
  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);

  // Fetch all per-device readings for today (deviceId IS NOT NULL).
  const deviceReadings = await prisma.energyReading.groupBy({
    by: ["deviceId"],
    where: {
      userId: DEMO_USER_ID,
      deviceId: { not: null },
      timestamp: { gte: todayStart, lte: todayEnd },
    },
    _sum: { kwh: true },
  });

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

  return sortedReadings.slice(0, 5).map((reading, index) => ({
    id: String(reading.deviceId),
    name: deviceNameMap.get(reading.deviceId as number) ?? "Unknown Device",
    pct: Math.round(((reading._sum.kwh ?? 0) / totalKwh) * 100),
    color: CONSUMER_COLORS[index % CONSUMER_COLORS.length],
  }));
};

// Documentation only: Computes the complete dashboard payload for the given period.
// Fetches active devices for current power (currentKw), sums today's whole-home kWh,
// builds the history buckets, and computes top consumers by share.
// Accepts the DashboardPeriod ("Day" | "Week" | "Month").
// Returns a Promise resolving to a DashboardResponseDto.
export const getDashboardData = async (
  period: DashboardPeriod
): Promise<DashboardResponseDto> => {
  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);

  // Fetch all devices for the live device list panel.
  const allDevices = await prisma.device.findMany({
    where: { userId: DEMO_USER_ID },
  });

  // Current total watts = sum of ratedWatts for ACTIVE devices only.
  const totalActiveWatts = allDevices
    .filter((d) => d.status === DeviceStatus.ACTIVE)
    .reduce((sum, d) => sum + d.ratedWatts, 0);

  const currentKw = parseFloat((totalActiveWatts / 1000).toFixed(2));

  // Total kWh consumed today from whole-home aggregate readings.
  const todayKwhAggregate = await prisma.energyReading.aggregate({
    where: {
      userId: DEMO_USER_ID,
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

  const [history, topConsumers] = await Promise.all([
    buildHistoryForPeriod(period),
    buildTopConsumers(),
  ]);

  return {
    currentKw,
    totalTodayKwh,
    devices: deviceSummaries,
    history,
    topConsumers,
  };
};

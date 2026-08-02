// Documentation only: Service layer for the export module.
// Assembles a user's readings, devices, or alerts into flat rows that render
// identically as CSV or JSON. Every query is scoped to the userId the caller
// passes, which the controller reads from req.user — an export is the one
// feature where a missing scope would hand someone else's whole history over in
// a single file, so nothing here has a default user.
// No HTTP-specific code lives here.

import { prisma } from "../../lib/prisma.ts";
import type { CsvRow } from "../../lib/csv.ts";
import type {
  ExportDataset,
  ExportFormat,
  ExportRange,
  ExportSummaryDto,
  ExportTable,
} from "./export";

// Upper bound on rows in a single download. A board publishing every 2 seconds
// writes ~43k whole-home rows a day, so an uncapped "all" export would buffer
// tens of megabytes of strings in the server's heap and then ask a phone to hold
// the same again. When the cap bites we keep the most recent rows — recent data
// is what someone exporting is almost always after — and say so in the summary
// rather than silently handing back a partial file.
export const MAX_EXPORT_ROWS = 20_000;

// Documentation only: Resolves a range to the timestamp its window opens at.
// Returns null for "all", which callers translate to "no time filter" rather
// than to an epoch-zero lower bound.
// Accepts the ExportRange and the reference "now" Date.
// Returns a Date or null.
const rangeStart = (range: ExportRange, now: Date): Date | null => {
  if (range === "all") return null;

  const start = new Date(now);

  if (range !== "today") {
    // Inclusive of today, so "7d" is today plus the six days before it — the
    // same convention getDateRangeForPeriod uses for its Week window.
    start.setDate(start.getDate() - (range === "7d" ? 6 : 29));
  }

  start.setHours(0, 0, 0, 0);
  return start;
};

// Documentation only: Builds the Prisma filter for a time-bounded dataset.
// The column differs per dataset (readings are stamped with the moment they were
// measured, alerts with the moment they fired), so the field name is a parameter.
// Accepts userId (number), the ExportRange, and the timestamp field name.
// Returns a where-clause object ready to spread into a Prisma query.
const scopedWhere = (
  userId: number,
  range: ExportRange,
  field: "timestamp" | "createdAt"
): Record<string, unknown> => {
  const start = rangeStart(range, new Date());
  return start === null ? { userId } : { userId, [field]: { gte: start } };
};

// Documentation only: Reports how much data each dataset holds for the given
// range, so the app can show the row count and warn about clipping before the
// user commits to a download.
// Accepts userId (number) and the ExportRange.
// Returns a Promise resolving to an ExportSummaryDto.
export const getExportSummary = async (
  userId: number,
  range: ExportRange
): Promise<ExportSummaryDto> => {
  const readingsWhere = scopedWhere(userId, range, "timestamp");
  const alertsWhere = scopedWhere(userId, range, "createdAt");

  const [readingCount, deviceCount, alertCount, bounds] = await Promise.all([
    prisma.energyReading.count({ where: readingsWhere }),
    // Unfiltered on purpose: the device list is an inventory, not a log.
    prisma.device.count({ where: { userId } }),
    prisma.alert.count({ where: alertsWhere }),
    prisma.energyReading.aggregate({
      where: readingsWhere,
      _min: { timestamp: true },
      _max: { timestamp: true },
    }),
  ]);

  return {
    range,
    maxRows: MAX_EXPORT_ROWS,
    readings: { count: readingCount, truncated: readingCount > MAX_EXPORT_ROWS },
    devices: { count: deviceCount, truncated: deviceCount > MAX_EXPORT_ROWS },
    alerts: { count: alertCount, truncated: alertCount > MAX_EXPORT_ROWS },
    firstReadingAt: bounds._min.timestamp?.toISOString() ?? null,
    lastReadingAt: bounds._max.timestamp?.toISOString() ?? null,
  };
};

// EnergyReading serves two purposes depending on whether deviceId is set, and a
// flat file loses that distinction the moment it leaves the app — someone would
// sum the kwh column and double-count every watt-hour, once as whole-home and
// again per device. The scope column makes the split explicit in the export.
const READING_COLUMNS = [
  "timestamp",
  "scope",
  "deviceId",
  "deviceName",
  "watts",
  "kwh",
  "voltage",
  "current",
  "frequency",
  "powerFactor",
];

// Documentation only: Assembles the readings dataset, newest rows first from the
// database (so the cap keeps the most recent) but emitted oldest-first, since a
// time series that reads backwards is wrong for every chart tool it will land in.
// Accepts userId (number) and the ExportRange.
// Returns a Promise resolving to { columns, rows, truncated }.
const buildReadingsTable = async (
  userId: number,
  range: ExportRange
): Promise<{ columns: string[]; rows: CsvRow[]; truncated: boolean }> => {
  const readings = await prisma.energyReading.findMany({
    where: scopedWhere(userId, range, "timestamp"),
    orderBy: { timestamp: "desc" },
    take: MAX_EXPORT_ROWS,
    include: { device: { select: { name: true } } },
  });

  const rows: CsvRow[] = readings.reverse().map((reading) => ({
    timestamp: reading.timestamp.toISOString(),
    scope: reading.deviceId === null ? "home" : "device",
    deviceId: reading.deviceId,
    deviceName: reading.device?.name ?? null,
    watts: reading.watts,
    kwh: reading.kwh,
    voltage: reading.voltage,
    current: reading.current,
    frequency: reading.frequency,
    powerFactor: reading.powerFactor,
  }));

  return {
    columns: READING_COLUMNS,
    rows,
    truncated: rows.length === MAX_EXPORT_ROWS,
  };
};

const DEVICE_COLUMNS = [
  "id",
  "name",
  "room",
  "category",
  "ratedWatts",
  "status",
  "enabled",
  "createdAt",
  "updatedAt",
];

// Documentation only: Assembles the device inventory. Deliberately ignores the
// range: a device installed last year is what the deviceId column in a readings
// export from this morning refers to, so filtering the inventory by age would
// produce a readings file whose device references cannot be resolved.
// Accepts userId (number).
// Returns a Promise resolving to { columns, rows, truncated }.
const buildDevicesTable = async (
  userId: number
): Promise<{ columns: string[]; rows: CsvRow[]; truncated: boolean }> => {
  const devices = await prisma.device.findMany({
    where: { userId },
    orderBy: { id: "asc" },
    take: MAX_EXPORT_ROWS,
    include: { room: { select: { name: true } } },
  });

  const rows: CsvRow[] = devices.map((device) => ({
    id: device.id,
    name: device.name,
    room: device.room?.name ?? null,
    category: device.category,
    ratedWatts: device.ratedWatts,
    status: device.status,
    enabled: device.enabled,
    createdAt: device.createdAt.toISOString(),
    updatedAt: device.updatedAt.toISOString(),
  }));

  return {
    columns: DEVICE_COLUMNS,
    rows,
    truncated: rows.length === MAX_EXPORT_ROWS,
  };
};

const ALERT_COLUMNS = [
  "id",
  "createdAt",
  "type",
  "title",
  "description",
  "recommendation",
  "deviceId",
  "deviceName",
  "threshold",
  "value",
  "read",
];

// Documentation only: Assembles the alert history, oldest-first for the same
// charting reason as readings.
// Accepts userId (number) and the ExportRange.
// Returns a Promise resolving to { columns, rows, truncated }.
const buildAlertsTable = async (
  userId: number,
  range: ExportRange
): Promise<{ columns: string[]; rows: CsvRow[]; truncated: boolean }> => {
  const alerts = await prisma.alert.findMany({
    where: scopedWhere(userId, range, "createdAt"),
    orderBy: { createdAt: "desc" },
    take: MAX_EXPORT_ROWS,
    include: { device: { select: { name: true } } },
  });

  const rows: CsvRow[] = alerts.reverse().map((alert) => ({
    id: alert.id,
    createdAt: alert.createdAt.toISOString(),
    type: alert.type,
    title: alert.title,
    description: alert.description,
    recommendation: alert.recommendation,
    deviceId: alert.deviceId,
    deviceName: alert.device?.name ?? null,
    threshold: alert.threshold,
    value: alert.value,
    read: alert.read,
  }));

  return {
    columns: ALERT_COLUMNS,
    rows,
    truncated: rows.length === MAX_EXPORT_ROWS,
  };
};

// Documentation only: Builds the requested dataset for the requested range.
// Accepts userId (number), the ExportDataset, and the ExportRange.
// Returns a Promise resolving to an ExportTable.
export const buildExportTable = async (
  userId: number,
  dataset: ExportDataset,
  range: ExportRange
): Promise<ExportTable> => {
  const built =
    dataset === "readings"
      ? await buildReadingsTable(userId, range)
      : dataset === "devices"
        ? await buildDevicesTable(userId)
        : await buildAlertsTable(userId, range);

  return {
    dataset,
    range,
    ...built,
    generatedAt: new Date().toISOString(),
  };
};

// Documentation only: Names the downloaded file.
// The mobile app names its own copy (see lib/export-format.ts) because it never
// sees this header — Content-Disposition is not exposed to cross-origin fetch —
// but curl and a browser hitting the endpoint directly both honour it.
// Accepts the ExportDataset, the ExportRange, the ExportFormat, and an optional
// reference Date (defaults to now).
// Returns a filename such as "voltwise-readings-30d-20260802-1432.csv".
export const exportFilename = (
  dataset: ExportDataset,
  range: ExportRange,
  format: ExportFormat,
  now: Date = new Date()
): string => {
  const pad = (n: number): string => String(n).padStart(2, "0");
  const stamp =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}`;

  return `voltwise-${dataset}-${range}-${stamp}.${format}`;
};

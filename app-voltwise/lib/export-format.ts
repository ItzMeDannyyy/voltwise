/**
 * The vocabulary of a data export — datasets, ranges, formats, and the way each
 * is described to the user.
 *
 * Pure, for the same reason lib/unit-prefs.ts and lib/notification-rules.ts are:
 * the choices here decide what a file is called and what a user believes is
 * inside it, and both are far easier to trust when they can be read in one place
 * without a React tree or a filesystem attached.
 *
 * The three unions mirror the backend's export module exactly. They are the
 * query string, so a value invented here would 400 rather than fail quietly.
 */

export type ExportDataset = "readings" | "devices" | "alerts";
export type ExportRange = "today" | "7d" | "30d" | "all";
export type ExportFormat = "csv" | "json";

export const EXPORT_DATASETS: ExportDataset[] = ["readings", "devices", "alerts"];
export const EXPORT_RANGES: ExportRange[] = ["today", "7d", "30d", "all"];
export const EXPORT_FORMATS: ExportFormat[] = ["csv", "json"];

export const DATASET_LABELS: Record<ExportDataset, string> = {
  readings: "Energy readings",
  devices: "Devices",
  alerts: "Alerts",
};

export const DATASET_HINTS: Record<ExportDataset, string> = {
  readings:
    "Every measurement, whole-home and per device, with voltage, current, frequency and power factor.",
  devices: "Your device list with rooms, categories and rated power.",
  alerts: "Alert history with thresholds, the value that tripped them, and what was recommended.",
};

export const RANGE_LABELS: Record<ExportRange, string> = {
  today: "Today",
  "7d": "7 days",
  "30d": "30 days",
  all: "Everything",
};

export const FORMAT_LABELS: Record<ExportFormat, string> = {
  csv: "CSV",
  json: "JSON",
};

export const FORMAT_HINTS: Record<ExportFormat, string> = {
  csv: "Opens in Excel, Numbers or Google Sheets.",
  json: "Keeps nulls and types intact — better for scripts.",
};

export const MIME_TYPES: Record<ExportFormat, string> = {
  csv: "text/csv",
  json: "application/json",
};

/**
 * The device inventory is a list rather than a log, so the backend hands back
 * all of it regardless of the range. Screens use this to stop showing a range
 * selector that would have no effect.
 */
export function isRangeApplicable(dataset: ExportDataset): boolean {
  return dataset !== "devices";
}

/**
 * The path the app fetches. Devices still send a range so the query string is
 * uniform and the server's default can never surprise us — it is ignored there.
 */
export function exportPath(
  dataset: ExportDataset,
  range: ExportRange,
  format: ExportFormat
): string {
  return `/export/${dataset}?range=${range}&format=${format}`;
}

/**
 * Names the file the user ends up with.
 *
 * Built here rather than read from the server's Content-Disposition header
 * because that header is not exposed to a cross-origin fetch — the app and the
 * API are different origins on every real device.
 *
 * The minute is part of the stamp so exporting the same dataset twice in a day
 * keeps both files instead of silently replacing the first.
 */
export function exportFilename(
  dataset: ExportDataset,
  range: ExportRange,
  format: ExportFormat,
  now: Date = new Date()
): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}`;

  return `voltwise-${dataset}-${range}-${stamp}.${format}`;
}

// ---- Display helpers ----

/** Thousands separators, because a raw "43200" in a row count reads as noise. */
export function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}

/** Byte sizes for the cached-exports card. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024) return "1 KB";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * "Jun 1 – Aug 2" for the window the readings actually span, which is often
 * narrower than the range asked for. Returns null when there is nothing to span.
 */
export function formatRangeSpan(
  firstIso: string | null,
  lastIso: string | null
): string | null {
  if (!firstIso || !lastIso) return null;

  const first = new Date(firstIso);
  const last = new Date(lastIso);
  if (Number.isNaN(first.getTime()) || Number.isNaN(last.getTime())) return null;

  const day = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  const from = day(first);
  const to = day(last);
  return from === to ? from : `${from} – ${to}`;
}

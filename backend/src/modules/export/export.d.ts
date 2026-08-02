// Documentation only: Type definitions for the export module's request and
// response payloads. The mobile app mirrors these in app-voltwise/lib/api.ts
// and app-voltwise/lib/export-format.ts.

import type { CsvRow } from "../../lib/csv.ts";

// The three things a user's account actually contains that are worth taking
// elsewhere. Readings are the reason the feature exists; devices and alerts are
// what make a readings file interpretable once it leaves the app.
export type ExportDataset = "readings" | "devices" | "alerts";

// "today" is midnight-to-now; "7d" and "30d" are inclusive of today, matching
// how the analytics module reads its Week window.
export type ExportRange = "today" | "7d" | "30d" | "all";

export type ExportFormat = "csv" | "json";

export interface ExportDatasetSummaryDto {
  // Rows the range currently matches, before the row cap is applied.
  count: number;
  // True when count exceeds MAX_EXPORT_ROWS, so the download would be clipped
  // to the most recent rows. Reported up front rather than as a response header
  // on the download itself, so the app can warn before the user commits.
  truncated: boolean;
}

export interface ExportSummaryDto {
  range: ExportRange;
  // The row cap the truncated flags were computed against.
  maxRows: number;
  readings: ExportDatasetSummaryDto;
  // Devices ignore the range entirely — see buildDevicesTable.
  devices: ExportDatasetSummaryDto;
  alerts: ExportDatasetSummaryDto;
  // Bounds of the readings the range matches; null when it matches none.
  firstReadingAt: string | null;
  lastReadingAt: string | null;
}

// The in-memory shape a dataset is assembled into before it is rendered as
// either CSV or JSON. Both renderings read the same rows, so the two formats of
// one export can never disagree about a value.
export interface ExportTable {
  dataset: ExportDataset;
  range: ExportRange;
  // Column headers, in order. They double as the keys into each row.
  columns: string[];
  rows: CsvRow[];
  // True when the row cap clipped the result to the most recent rows.
  truncated: boolean;
  generatedAt: string;
}

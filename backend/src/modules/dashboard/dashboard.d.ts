// Documentation only: Defines TypeScript types for the dashboard module response shapes.
// These match the exact JSON fields expected by the VoltWise mobile app's dashboard screen.

// Re-exported from the shared resolver so there is one definition of a period
// in the codebase. "Cycle" is a user-defined billing window (from/to).
export type { RangePeriod as DashboardPeriod } from "../../lib/range.ts";

// The window the payload actually describes, echoed back so the client can
// confirm the server read its request the way it meant it.
export interface RangeSummaryDto {
  period: "Day" | "Week" | "Month" | "Cycle";
  /** ISO instant of the first reading included. */
  from: string;
  /** ISO instant of the last, never in the future. */
  to: string;
  /** Human label, e.g. "Jan 14 - Feb 15, 2026". */
  label: string;
}

// A compact device summary shown on the dashboard live-view card.
export interface DashboardDeviceSummaryDto {
  id: string;
  name: string;
  watts: number;
  active: boolean;
}

// Bucketed historical kWh data for the dashboard trend chart.
export interface DashboardHistoryDto {
  labels: string[];
  data: number[];
}

// One device's kWh per bucket, aligned to DashboardDeviceHistoryDto.labels.
export interface DeviceHistorySeriesDto {
  deviceId: string;
  name: string;
  // Stable per-series colour so the chart line and its legend entry match.
  color: string;
  // Same length and order as labels; 0 for a bucket with no readings.
  data: number[];
}

// Per-device trend data for the multi-line Usage History chart. Labels are the
// same buckets the whole-home history uses, so both charts line up.
export interface DashboardDeviceHistoryDto {
  labels: string[];
  series: DeviceHistorySeriesDto[];
}

// A top-consuming device entry with an integer percentage and a chart color.
export interface TopConsumerDto {
  id: string;
  name: string;
  pct: number;
  color: string;
  kwh: number;
  cost: number;
}

// The six PZEM-004T sensor metrics for the latest whole-home reading.
export interface ReadingDto {
  voltage: number;
  current: number;
  activePower: number;
  energy: number;
  frequency: number;
  powerFactor: number;
  timestamp: string;
}

// The full dashboard response shape as consumed by the mobile app.
export interface DashboardResponseDto {
  currentKw: number;
  totalTodayKwh: number;
  devices: DashboardDeviceSummaryDto[];
  history: DashboardHistoryDto;
  deviceHistory: DashboardDeviceHistoryDto;
  topConsumers: TopConsumerDto[];
  reading: ReadingDto;
  iotOnline: boolean;
  range: RangeSummaryDto;
}

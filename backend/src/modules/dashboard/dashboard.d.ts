// Documentation only: Defines TypeScript types for the dashboard module response shapes.
// These match the exact JSON fields expected by the VoltWise mobile app's dashboard screen.

export type DashboardPeriod = "Day" | "Week" | "Month";

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
}

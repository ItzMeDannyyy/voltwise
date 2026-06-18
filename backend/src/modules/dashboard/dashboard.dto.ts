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

// A top-consuming device entry with an integer percentage and a chart color.
export interface TopConsumerDto {
  id: string;
  name: string;
  pct: number;
  color: string;
}

// The full dashboard response shape as consumed by the mobile app.
export interface DashboardResponseDto {
  currentKw: number;
  totalTodayKwh: number;
  devices: DashboardDeviceSummaryDto[];
  history: DashboardHistoryDto;
  topConsumers: TopConsumerDto[];
}

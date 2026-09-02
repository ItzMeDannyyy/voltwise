// Documentation only: Defines TypeScript types for the analytics module response shapes.
// These match the exact JSON structure the VoltWise mobile app's Analytics screen consumes.

// One definition of a period for the whole codebase — see src/lib/range.ts.
// "Cycle" is a user-defined billing window (from/to).
export type { RangePeriod as AnalyticsPeriod } from "../../lib/range.ts";
export type { RangeSummaryDto } from "../dashboard/dashboard";

// The bill predictor card at the top of the analytics screen.
export interface BillPredictorDto {
  tariff: number;
  currency: string;
  accumulatedKwh: number;
  estimatedBill: number;
  cycleStart: string;   // Formatted like "Jun 1, 2026"
  // The cycle's last day, when the user is looking at a bounded billing cycle.
  // Null for the open-ended current period, which has no end date yet.
  cycleEnd: string | null;
}

// A single breakdown segment for the category donut chart.
export interface BreakdownEntryDto {
  label: string;
  pct: number;
  color: string;
  kwh: number;
  cost: number;
}

// A top consumer entry for the horizontal bar chart.
export interface TopConsumerDto {
  id: string;
  name: string;
  pct: number;
  color: string;
  kwh: number;
  cost: number;
}

// Statistical summary for a single PZEM-004T metric over the selected period.
export interface MetricStatDto {
  key: "voltage" | "current" | "activePower" | "energy" | "frequency" | "powerFactor";
  label: string;
  unit: string;
  avg: number;
  min: number;
  max: number;
  info: string;
}

// The full analytics response shape.
export interface AnalyticsResponseDto {
  billPredictor: BillPredictorDto;
  totalKwh: number;
  breakdown: BreakdownEntryDto[];
  topConsumers: TopConsumerDto[];
  metrics: MetricStatDto[];
  range: RangeSummaryDto;
}

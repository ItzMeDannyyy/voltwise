import { type RangePeriod } from "./range-prefs";

/**
 * Parses an hour (0-23) from a label like "12:00mn", "1:00am", "2:00am", "12:00nn", "9:00pm",
 * or falls back to index if not matched.
 */
export function parseHourFromLabel(label: string, index: number): number {
  if (!label) return index % 24;
  const cleaned = label.trim().toLowerCase();
  if (cleaned.includes("mn") || cleaned === "12mn" || cleaned.startsWith("12:00mn")) {
    return 0;
  }
  if (cleaned.includes("nn") || cleaned === "12nn" || cleaned.startsWith("12:00nn")) {
    return 12;
  }
  const match = cleaned.match(/(\d+)(?::(\d+))?\s*(am|pm)?/);
  if (!match) return index % 24;
  let h = parseInt(match[1], 10);
  const meridiem = match[3];
  if (meridiem === "pm" && h < 12) h += 12;
  if (meridiem === "am" && h === 12) h = 0;
  return Math.min(23, Math.max(0, h));
}

/**
 * Formats an hour and minute into Philippine/local convention:
 * 0:00 -> "12:00mn", 0:10 -> "12:10am", 12:00 -> "12:00nn", 2:10 -> "2:10am", 14:10 -> "2:10pm".
 */
export function formatSubHourLabel(hour: number, minute: number): string {
  const minStr = String(minute).padStart(2, "0");
  if (hour === 0) {
    return minute === 0 ? "12:00mn" : `12:${minStr}am`;
  }
  if (hour === 12) {
    return minute === 0 ? "12:00nn" : `12:${minStr}pm`;
  }
  if (hour < 12) {
    return `${hour}:${minStr}am`;
  }
  return `${hour - 12}:${minStr}pm`;
}

export interface ZoomIntervalInfo {
  subdivisions: number;
  description: string;
}

/**
 * Determines sub-interval granularity based on zoom multiplier (1.0x to 6.0x).
 */
export function getZoomIntervalInfo(zoom: number, period: RangePeriod): ZoomIntervalInfo {
  if (period === "Day") {
    if (zoom < 1.4) {
      return { subdivisions: 1, description: "1 hr intervals" };
    }
    if (zoom < 2.4) {
      return { subdivisions: 2, description: "30 min intervals" };
    }
    if (zoom < 3.8) {
      return { subdivisions: 4, description: "15 min intervals" };
    }
    return { subdivisions: 6, description: "10 min intervals" };
  }

  if (period === "Week") {
    if (zoom < 1.8) {
      return { subdivisions: 1, description: "1 day intervals" };
    }
    return { subdivisions: 2, description: "12 hr intervals" };
  }

  // Month or Cycle
  if (zoom < 1.8) {
    return { subdivisions: 1, description: "Standard intervals" };
  }
  return { subdivisions: 2, description: "Detailed intervals" };
}

/**
 * Smooth Catmull-Rom cubic spline interpolation between sequential data points.
 * Guarantees zero negative dips and preserves peak fidelity.
 */
export function interpolateCatmullRom(data: number[], subdivisions: number): number[] {
  if (subdivisions <= 1 || data.length <= 1) return data;
  const result: number[] = [];
  const n = data.length;
  for (let i = 0; i < n; i++) {
    const p0 = data[Math.max(0, i - 1)];
    const p1 = data[i];
    const p2 = data[Math.min(n - 1, i + 1)];
    const p3 = data[Math.min(n - 1, i + 2)];

    // For the final point, only emit the point itself
    const steps = i === n - 1 ? 1 : subdivisions;
    for (let k = 0; k < steps; k++) {
      const t = k / subdivisions;
      // Catmull-Rom spline formula
      const val =
        0.5 *
        (2 * p1 +
          (-p0 + p2) * t +
          (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t +
          (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
      result.push(Math.max(0, Number(val.toFixed(2))));
    }
  }
  return result;
}

export interface ZoomedChartData<TSeries extends { data: number[] }> {
  zoomedLabels: string[];
  axisLabels: string[];
  zoomedSeries: TSeries[];
  subdivisions: number;
  intervalDescription: string;
}

/**
 * Expands hourly/daily labels and series into finer sub-intervals when zoomed.
 */
export function buildZoomedChartData<TSeries extends { data: number[] }>(
  labels: string[],
  series: TSeries[],
  period: RangePeriod,
  zoom: number
): ZoomedChartData<TSeries> {
  const { subdivisions, description } = getZoomIntervalInfo(zoom, period);

  if (subdivisions <= 1 || labels.length <= 1) {
    return {
      zoomedLabels: labels,
      axisLabels: labels,
      zoomedSeries: series,
      subdivisions: 1,
      intervalDescription: description,
    };
  }

  const zoomedLabels: string[] = [];

  if (period === "Day") {
    const n = labels.length;
    for (let i = 0; i < n; i++) {
      const baseHour = parseHourFromLabel(labels[i], i);
      const steps = i === n - 1 ? 1 : subdivisions;
      const minStep = Math.round(60 / subdivisions);
      for (let k = 0; k < steps; k++) {
        const minute = k * minStep;
        zoomedLabels.push(formatSubHourLabel(baseHour, minute));
      }
    }
  } else if (period === "Week") {
    const n = labels.length;
    for (let i = 0; i < n; i++) {
      const baseLabel = labels[i];
      const steps = i === n - 1 ? 1 : subdivisions;
      for (let k = 0; k < steps; k++) {
        zoomedLabels.push(k === 0 ? baseLabel : `${baseLabel} 12pm`);
      }
    }
  } else {
    // Month or Cycle
    const n = labels.length;
    for (let i = 0; i < n; i++) {
      const baseLabel = labels[i];
      const steps = i === n - 1 ? 1 : subdivisions;
      for (let k = 0; k < steps; k++) {
        zoomedLabels.push(k === 0 ? baseLabel : `${baseLabel}+`);
      }
    }
  }

  // Interpolate data for each visible series
  const zoomedSeries = series.map((s) => ({
    ...s,
    data: interpolateCatmullRom(s.data, subdivisions),
  }));

  // Calculate readable visible labels for the X-axis to prevent text crowding
  const maxAxisLabels = Math.max(8, Math.round(7 * zoom));
  const step = Math.max(1, Math.ceil(zoomedLabels.length / maxAxisLabels));
  const axisLabels = zoomedLabels.map((lbl, idx) => (idx % step === 0 ? lbl : ""));

  return {
    zoomedLabels,
    axisLabels,
    zoomedSeries,
    subdivisions,
    intervalDescription: description,
  };
}

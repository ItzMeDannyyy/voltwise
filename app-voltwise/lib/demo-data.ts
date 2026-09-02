/**
 * Static showcase dataset for the Demo FAB's "Sample data" mode.
 *
 * Why this exists: a fresh account (and a lab bench with only the whole-home
 * PZEM wired up) has no per-device history, so the Dashboard, Devices and
 * Analytics screens honestly render empty states. That is correct behaviour and
 * terrible for showing what VoltWise looks like once a household has been
 * monitored for a while. Flipping sample data on swaps those three screens onto
 * the household below so the charts, breakdowns and per-device panels can be
 * seen fully populated.
 *
 * Three rules keep this from becoming a lie:
 *
 *  1. **Nothing here is ever written anywhere.** It is a render-time override
 *     only — no API call, no MQTT publish, no storage key. Turn it off and the
 *     screens are back on real data, untouched.
 *  2. **Everything is deterministic.** The variation between hours and days
 *     comes from a hash of the device and the timestamp, never from
 *     Math.random. The same day always looks the same, so a chart does not
 *     twitch between renders and two people demoing see identical figures.
 *  3. **It answers whatever range it is asked for.** The timeline navigator
 *     can walk back months; the generator produces a consistent past rather
 *     than a canned week that repeats.
 *
 * The shapes below are exactly the backend contracts in lib/api.ts, so the
 * screens cannot tell the difference between this and a real payload.
 */

import type {
  AnalyticsData,
  ApiDevice,
  ApiDeviceReading,
  ConsumerSlice,
  DashboardData,
  MetricStat,
  Reading,
} from "./api";
import {
  defaultRangeState,
  isoDate,
  rangeLabel,
  resolveBuckets,
  type RangeBucket,
  type RangeState,
} from "./range-prefs";

// Mirrors DEVICE_SERIES_COLORS in backend/src/modules/dashboard/dashboard.service.ts
// so a demo chart is coloured exactly like the real one.
const SERIES_COLORS = [
  "#00d4aa",
  "#3b82f6",
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
  "#ef4444",
  "#14b8a6",
  "#a3a3a3",
];

// Mirrors CONSUMER_COLORS / SEGMENT_COLORS on the backend — the last entry is
// the grey reserved for the collapsed "Others" slice.
const SEGMENT_COLORS = [
  "#00d4aa",
  "#3b82f6",
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
  "#4b5563",
];

/**
 * Rate used only for the vestigial `cost` fields in these payloads. Every peso
 * figure the user actually sees is re-derived from kWh at their own tariff by
 * UnitsContext, exactly as it is for real data.
 */
const DEMO_RATE = 10.5;

// ─── Determinism ─────────────────────────────────────────────────────────────

/**
 * FNV-1a over the seed string, mapped to 0..1.
 *
 * The whole demo hangs on this being a hash and not a random number: an
 * appliance's draw at 3pm last Tuesday has to be the same figure every time
 * that Tuesday is drawn, whether the user navigates back to it now or in ten
 * minutes.
 */
function hash01(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index++) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 100000) / 100000;
}

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

// ─── The household ───────────────────────────────────────────────────────────

interface DemoDeviceProfile {
  device: ApiDevice;
  /** Typical consumption on an ordinary day, before shaping and variation. */
  baseDailyKwh: number;
  /** Relative draw across the 24 hours of a day. Normalised on load. */
  hourWeights: number[];
  /** Multiplier per weekday, Sunday first — weekends look different. */
  weekdayFactor: number[];
  /** How much day-to-day variation to allow, as a fraction (0.2 = ±20%). */
  variance: number;
  /** Some appliances simply do not run every day. 0 = always on. */
  idleChance: number;
  /** Instantaneous electrical detail for the device's expanded card. */
  live: { voltage: number; current: number; frequency: number; powerFactor: number };
}

// Hour-weight shapes, written as readable curves rather than magic arrays.
// Index = hour of day.
const FLAT = Array.from({ length: 24 }, () => 1);
const NIGHT_AND_AFTERNOON = [
  9, 9, 8, 7, 5, 2, 1, 1, 1, 1, 2, 3, 4, 5, 6, 7, 6, 5, 6, 8, 9, 10, 10, 9,
];
const MEALTIMES = [
  0, 0, 0, 0, 0, 1, 4, 7, 4, 2, 2, 6, 9, 4, 2, 2, 3, 7, 10, 8, 3, 1, 0, 0,
];
const SHOWER_HOURS = [
  0, 0, 0, 0, 1, 5, 10, 8, 3, 1, 1, 1, 1, 1, 1, 1, 2, 5, 8, 6, 3, 1, 0, 0,
];
const EVENING = [
  1, 0, 0, 0, 0, 0, 1, 2, 2, 1, 1, 2, 3, 3, 3, 4, 5, 7, 10, 10, 9, 7, 4, 2,
];
const LIGHTING = [
  1, 1, 1, 1, 1, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 2, 6, 10, 10, 9, 7, 4, 2,
];
const DAYTIME_CHORE = [
  0, 0, 0, 0, 0, 0, 1, 3, 8, 10, 8, 4, 2, 2, 2, 1, 1, 1, 0, 0, 0, 0, 0, 0,
];

// A seven-appliance Filipino home. The aircon dominates, the fridge is a
// constant floor, and the washing machine only runs on some days.
const PROFILES: DemoDeviceProfile[] = [
  {
    device: {
      id: "demo-1",
      name: "Air Conditioner",
      room: "Bedroom",
      category: "Climate",
      imageUri: null,
      status: "ACTIVE",
      watts: 1180,
      enabled: true,
    },
    baseDailyKwh: 10.2,
    hourWeights: NIGHT_AND_AFTERNOON,
    weekdayFactor: [1.15, 0.95, 0.95, 1, 1, 1.05, 1.2],
    variance: 0.18,
    idleChance: 0,
    live: { voltage: 228.4, current: 5.32, frequency: 59.98, powerFactor: 0.97 },
  },
  {
    device: {
      id: "demo-2",
      name: "Refrigerator",
      room: "Kitchen",
      category: "Kitchen",
      imageUri: null,
      status: "ACTIVE",
      watts: 165,
      enabled: true,
    },
    baseDailyKwh: 4.05,
    hourWeights: FLAT,
    weekdayFactor: [1, 1, 1, 1, 1, 1, 1],
    variance: 0.05,
    idleChance: 0,
    live: { voltage: 228.6, current: 0.78, frequency: 59.98, powerFactor: 0.93 },
  },
  {
    device: {
      id: "demo-3",
      name: "Kitchen Appliances",
      room: "Kitchen",
      category: "Kitchen",
      imageUri: null,
      status: "IDLE",
      watts: 0,
      enabled: true,
    },
    baseDailyKwh: 3.9,
    hourWeights: MEALTIMES,
    weekdayFactor: [1.25, 0.9, 0.9, 0.95, 0.95, 1.05, 1.3],
    variance: 0.22,
    idleChance: 0,
    live: { voltage: 228.9, current: 0, frequency: 59.99, powerFactor: 0 },
  },
  {
    device: {
      id: "demo-4",
      name: "Water Heater",
      room: "Bathroom",
      category: "Bathroom",
      imageUri: null,
      status: "IDLE",
      watts: 0,
      enabled: true,
    },
    baseDailyKwh: 3.5,
    hourWeights: SHOWER_HOURS,
    weekdayFactor: [1.1, 1, 1, 1, 1, 1, 1.1],
    variance: 0.15,
    idleChance: 0,
    live: { voltage: 228.7, current: 0, frequency: 59.98, powerFactor: 0 },
  },
  {
    device: {
      id: "demo-5",
      name: "Smart TV",
      room: "Living Room",
      category: "Entertainment",
      imageUri: null,
      status: "ACTIVE",
      watts: 95,
      enabled: true,
    },
    baseDailyKwh: 2.1,
    hourWeights: EVENING,
    weekdayFactor: [1.35, 0.85, 0.85, 0.9, 0.9, 1.1, 1.4],
    variance: 0.2,
    idleChance: 0,
    live: { voltage: 228.5, current: 0.44, frequency: 59.97, powerFactor: 0.95 },
  },
  {
    device: {
      id: "demo-6",
      name: "Living Room Lights",
      room: "Living Room",
      category: "Lighting",
      imageUri: null,
      status: "ACTIVE",
      watts: 288,
      enabled: true,
    },
    baseDailyKwh: 1.5,
    hourWeights: LIGHTING,
    weekdayFactor: [1.05, 1, 1, 1, 1, 1.05, 1.05],
    variance: 0.12,
    idleChance: 0,
    live: { voltage: 228.8, current: 1.32, frequency: 59.98, powerFactor: 0.96 },
  },
  {
    device: {
      id: "demo-7",
      name: "Washing Machine",
      room: "Laundry",
      category: "Laundry",
      imageUri: null,
      status: "OFF",
      watts: 0,
      enabled: false,
    },
    baseDailyKwh: 2.4,
    hourWeights: DAYTIME_CHORE,
    weekdayFactor: [1.4, 0.8, 0.9, 0.8, 0.9, 1, 1.5],
    variance: 0.25,
    // Laundry happens on some days and not others, which is what makes this
    // line look like a household rather than a sine wave.
    idleChance: 0.45,
    live: { voltage: 228.6, current: 0, frequency: 59.99, powerFactor: 0 },
  },
];

// Normalised once so an hour's share of the day is a fraction that sums to 1.
const HOUR_SHARES = new Map<string, number[]>(
  PROFILES.map((profile) => {
    const total = profile.hourWeights.reduce((sum, weight) => sum + weight, 0);
    return [profile.device.id, profile.hourWeights.map((weight) => weight / total)];
  })
);

/** The demo device inventory, in the order the Devices tab should list it. */
export const DEMO_DEVICES: ApiDevice[] = PROFILES.map((profile) => profile.device);

/** Whole-home draw right now: the sum of everything currently running. */
export const DEMO_CURRENT_WATTS = PROFILES.reduce(
  (sum, profile) => sum + profile.device.watts,
  0
);

// ─── Synthesis ───────────────────────────────────────────────────────────────

/**
 * What one device consumed on one calendar day. Everything else is derived from
 * this: an hour is a share of it, a month is a sum of it.
 */
function dailyKwh(profile: DemoDeviceProfile, day: Date): number {
  const seed = `${profile.device.id}:${isoDate(day)}`;

  if (profile.idleChance > 0 && hash01(`idle:${seed}`) < profile.idleChance) {
    return 0;
  }

  // hash01 gives 0..1; centre it on 1 and scale by the profile's variance.
  const jitter = 1 + (hash01(seed) - 0.5) * 2 * profile.variance;
  return profile.baseDailyKwh * profile.weekdayFactor[day.getDay()] * jitter;
}

/** One device's consumption inside one bucket of the axis. */
function bucketKwh(profile: DemoDeviceProfile, bucket: RangeBucket, now: Date): number {
  let total: number;

  if (bucket.unit === "hour") {
    const shares = HOUR_SHARES.get(profile.device.id)!;
    total = dailyKwh(profile, bucket.start) * shares[bucket.start.getHours()];
  } else if (bucket.unit === "day") {
    total = dailyKwh(profile, bucket.start);
  } else {
    total = 0;
    const cursor = new Date(bucket.start);
    while (cursor <= bucket.end) {
      total += dailyKwh(profile, cursor);
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  // A bucket containing "now" is still filling. Tapering it keeps the last
  // point from standing up as a spike next to completed ones.
  if (now >= bucket.start && now <= bucket.end) {
    const span = bucket.end.getTime() - bucket.start.getTime();
    total *= Math.min(1, (now.getTime() - bucket.start.getTime()) / span);
  }

  return total;
}

interface DemoSeries {
  deviceId: string;
  name: string;
  color: string;
  data: number[];
  total: number;
}

/**
 * Every device's line across the range, computed once. The dashboard and the
 * analytics payload are both derived from this, so the chart, the top consumers
 * and the donut can never disagree with each other.
 */
function buildSeries(buckets: RangeBucket[], now: Date): DemoSeries[] {
  return PROFILES.map((profile) => {
    const data = buckets.map((bucket) => round(bucketKwh(profile, bucket, now), 3));
    return {
      deviceId: profile.device.id,
      name: profile.device.name,
      color: "",
      data,
      total: round(
        data.reduce((sum, value) => sum + value, 0),
        2
      ),
    };
  })
    .filter((series) => series.total > 0)
    // Biggest first, matching the backend, so the legend order and the colour
    // assignment stay stable.
    .sort((a, b) => b.total - a.total)
    .map((series, index) => ({
      ...series,
      color: SERIES_COLORS[index % SERIES_COLORS.length],
    }));
}

/**
 * Top consumers: the five biggest, with the tail collapsed into "Others" — the
 * same shape the backend produces.
 */
function topConsumersFrom(series: DemoSeries[]): ConsumerSlice[] {
  const grandTotal = series.reduce((sum, entry) => sum + entry.total, 0);
  if (grandTotal === 0) return [];

  const head = series.slice(0, 5);
  const tail = series.slice(5);
  const slices: ConsumerSlice[] = head.map((entry, index) => ({
    id: entry.deviceId,
    name: entry.name,
    pct: Math.round((entry.total / grandTotal) * 100),
    color: SEGMENT_COLORS[index % SEGMENT_COLORS.length],
    kwh: entry.total,
    cost: round(entry.total * DEMO_RATE, 2),
  }));

  if (tail.length > 0) {
    const rest = round(
      tail.reduce((sum, entry) => sum + entry.total, 0),
      2
    );
    slices.push({
      id: "others",
      name: "Others",
      pct: Math.round((rest / grandTotal) * 100),
      color: SEGMENT_COLORS[SEGMENT_COLORS.length - 1],
      kwh: rest,
      cost: round(rest * DEMO_RATE, 2),
    });
  }

  return slices;
}

/**
 * Energy accumulated across the household so far today. Shared by the hero
 * card's "Total today" and the live Energy metric so two figures on the same
 * card can never contradict each other.
 */
function dayTotal(now: Date): number {
  const { buckets } = resolveBuckets(defaultRangeState("Day", undefined, now), now);
  return round(
    PROFILES.reduce(
      (sum, profile) =>
        sum + buckets.reduce((acc, bucket) => acc + bucketKwh(profile, bucket, now), 0),
      0
    ),
    2
  );
}

// ─── Live sensor reading ─────────────────────────────────────────────────────

/**
 * The six PZEM metrics for the dashboard's Current Usage grid. Internally
 * consistent: V x A x PF lands on the same active power the device watts add up
 * to, so nobody doing the arithmetic on stage finds a contradiction.
 */
export function demoLiveReading(now: Date = new Date()): Reading {
  const watts = DEMO_CURRENT_WATTS;
  const voltage = 228.4;
  const powerFactor = 0.97;
  return {
    voltage,
    current: round(watts / (voltage * powerFactor), 2),
    activePower: watts,
    energy: dayTotal(now),
    frequency: 59.98,
    powerFactor,
    timestamp: now.toISOString(),
  };
}

// ─── Screen payloads ─────────────────────────────────────────────────────────

/** Everything GET /dashboard would return for a well-monitored home. */
export function demoDashboard(state: RangeState, now: Date = new Date()): DashboardData {
  const { buckets, from, to } = resolveBuckets(state, now);
  const series = buildSeries(buckets, now);
  const labels = buckets.map((bucket) => bucket.label);

  // Whole-home history is the sum of the device lines, bucket by bucket —
  // derived rather than authored so the two can never drift apart.
  const totals = labels.map((_, index) =>
    round(
      series.reduce((sum, entry) => sum + (entry.data[index] ?? 0), 0),
      2
    )
  );

  return {
    currentKw: round(DEMO_CURRENT_WATTS / 1000, 2),
    totalTodayKwh: dayTotal(now),
    devices: PROFILES.map((profile) => ({
      id: profile.device.id,
      name: profile.device.name,
      watts: profile.device.watts,
      active: profile.device.status === "ACTIVE",
    })),
    history: { labels, data: totals },
    deviceHistory: {
      labels,
      series: series.map(({ total: _total, ...rest }) => rest),
    },
    topConsumers: topConsumersFrom(series),
    reading: demoLiveReading(now),
    iotOnline: true,
    range: {
      period: state.period,
      from: from.toISOString(),
      to: to.toISOString(),
      label: rangeLabel(state, now),
    },
  };
}

/** Avg/min/max for the six metrics, phrased like the backend's own copy. */
const DEMO_METRICS: MetricStat[] = [
  {
    key: "voltage",
    label: "Voltage",
    unit: "V",
    avg: 228.4,
    min: 219.7,
    max: 234.1,
    info: "Confirms the line is receiving stable power and helps detect under/over-voltage conditions that could indicate electrical faults or utility supply issues.",
  },
  {
    key: "current",
    label: "Current",
    unit: "A",
    avg: 5.18,
    min: 0.94,
    max: 14.62,
    info: "Shows how much electrical current a load is drawing, which is the primary signal used to detect and distinguish appliance behavior.",
  },
  {
    key: "activePower",
    label: "Active Power",
    unit: "W",
    avg: 1148.3,
    min: 208,
    max: 3241,
    info: "Tells the facility manager the actual real-time electricity consumption, which is the core number used for cost calculation and load monitoring.",
  },
  {
    key: "energy",
    label: "Energy",
    unit: "kWh",
    avg: 26.19,
    min: 21.4,
    max: 33.8,
    info: "Tracks cumulative consumption over time, letting facility managers see daily/weekly/monthly usage trends and estimate electricity costs in pesos.",
  },
  {
    key: "frequency",
    label: "Frequency",
    unit: "Hz",
    avg: 59.98,
    min: 59.91,
    max: 60.06,
    info: "Verifies the AC supply is operating at a stable 60Hz (Philippine standard), with deviations potentially signaling generator instability or grid issues.",
  },
  {
    key: "powerFactor",
    label: "Power Factor",
    unit: "PF",
    avg: 0.96,
    min: 0.81,
    max: 0.99,
    info: "Indicates how efficiently a load uses electricity, helping identify inefficient appliances or equipment that may be costing more than their rated power suggests.",
  },
];

function formatCycleDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Everything GET /analytics would return for the same home. */
export function demoAnalytics(state: RangeState, now: Date = new Date()): AnalyticsData {
  const { buckets, from, to } = resolveBuckets(state, now);
  const series = buildSeries(buckets, now);
  const consumers = topConsumersFrom(series);
  const totalKwh = round(
    series.reduce((sum, entry) => sum + entry.total, 0),
    2
  );

  // Mirrors the backend rule: an explicit billing cycle is the window being
  // priced, and anything else falls back to the current calendar month.
  const isCycle = state.period === "Cycle";
  const cycleStart = isCycle ? from : new Date(now.getFullYear(), now.getMonth(), 1);
  const accumulatedKwh = isCycle
    ? totalKwh
    : round(
        PROFILES.reduce((sum, profile) => {
          let deviceTotal = 0;
          const cursor = new Date(cycleStart);
          while (cursor <= now) {
            deviceTotal += dailyKwh(profile, cursor);
            cursor.setDate(cursor.getDate() + 1);
          }
          return sum + deviceTotal;
        }, 0),
        2
      );

  return {
    billPredictor: {
      tariff: DEMO_RATE,
      currency: "₱",
      accumulatedKwh,
      estimatedBill: round(accumulatedKwh * DEMO_RATE, 2),
      cycleStart: formatCycleDate(cycleStart),
      cycleEnd: isCycle ? formatCycleDate(to) : null,
    },
    totalKwh,
    breakdown: consumers.map((slice) => ({
      label: slice.name,
      pct: slice.pct,
      color: slice.color,
      kwh: slice.kwh,
      cost: slice.cost,
    })),
    topConsumers: consumers,
    metrics: DEMO_METRICS,
    range: {
      period: state.period,
      from: from.toISOString(),
      to: to.toISOString(),
      label: rangeLabel(state, now),
    },
  };
}

/** The expanded-card reading for one demo device, or null if it isn't one. */
export function demoDeviceReading(
  deviceId: string,
  now: Date = new Date()
): ApiDeviceReading | null {
  const profile = PROFILES.find((entry) => entry.device.id === deviceId);
  if (!profile) return null;

  const { buckets } = resolveBuckets(defaultRangeState("Day", undefined, now), now);
  const todayKwh = round(
    buckets.reduce((sum, bucket) => sum + bucketKwh(profile, bucket, now), 0),
    3
  );

  // Cumulative energy on the meter: this year up to and including today.
  let lifetimeKwh = 0;
  const cursor = new Date(now.getFullYear(), 0, 1);
  while (cursor <= now) {
    lifetimeKwh += dailyKwh(profile, cursor);
    cursor.setDate(cursor.getDate() + 1);
  }

  return {
    watts: profile.device.watts,
    kwh: round(lifetimeKwh, 2),
    todayKwh,
    costToday: round(todayKwh * DEMO_RATE, 2),
    voltage: profile.live.voltage,
    current: profile.live.current,
    frequency: profile.live.frequency,
    powerFactor: profile.live.powerFactor,
    timestamp: now.toISOString(),
  };
}

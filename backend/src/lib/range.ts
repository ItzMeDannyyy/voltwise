// Documentation only: The single definition of "which slice of time is being
// looked at" for the whole API.
//
// Both the dashboard chart and the analytics figures used to derive their own
// windows, anchored implicitly to `new Date()`. That made "show me last
// Tuesday" or "show me my Jan 14 - Feb 15 bill" impossible to express, and it
// let the two modules disagree about what a period meant. Everything now goes
// through resolveRange(), so a period has exactly one meaning and both modules
// bucket onto the same axis.
//
// This module is pure: it takes a request and a clock, and returns dates. It
// touches no database and no HTTP, which is why test/range.test.ts can drive
// every boundary case directly.

import { AppError } from "./AppError.ts";

// Day/Week/Month are anchored to a date the caller picks (default: today).
// Cycle is an explicit from/to window — the user's utility billing period.
export type RangePeriod = "Day" | "Week" | "Month" | "Cycle";

// One point on the chart's x-axis: its label and the window it sums.
export interface RangeBucket {
  label: string;
  start: Date;
  end: Date;
}

export interface ResolvedRange {
  period: RangePeriod;
  /** First instant included in the range. */
  start: Date;
  /** Last instant included, never beyond "now". */
  end: Date;
  /** The x-axis: ordered, non-overlapping, future buckets already dropped. */
  buckets: RangeBucket[];
  /** Human label for the whole range, e.g. "Jan 14 - Feb 15, 2026". */
  label: string;
}

export interface RangeRequest {
  period: RangePeriod;
  /** The day whose day/week/month is being viewed. Ignored for Cycle. */
  anchor?: Date;
  /** Cycle only — both required, inclusive. */
  from?: Date;
  to?: Date;
}

// A billing cycle is normally ~30 days, but nothing stops someone entering a
// year. Past this we refuse rather than build a chart with 500 points on it.
export const MAX_RANGE_DAYS = 366;

// Beyond roughly two months, one point per day stops being readable, so a long
// custom range buckets by month instead.
const MAX_DAILY_BUCKET_DAYS = 62;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const startOfDay = (date: Date): Date => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

export const endOfDay = (date: Date): Date => {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
};

const startOfMonth = (date: Date): Date =>
  new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);

const endOfMonth = (date: Date): Date =>
  new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);

const addDays = (date: Date, days: number): Date => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

// Documentation only: Formats one hour of the day the way the app's Day axis
// reads it: "12:00mn", "3:00am", "12:00nn", "9:00pm". Midnight and noon get the
// Philippine mn/nn convention rather than a confusing "12:00am".
// Accepts an hour in 0-23. Returns the label string.
export const formatHourLabel = (hour: number): string => {
  if (hour === 0) return "12:00mn";
  if (hour === 12) return "12:00nn";
  if (hour < 12) return `${hour}:00am`;
  return `${hour - 12}:00pm`;
};

const formatWeekdayLabel = (date: Date): string =>
  date.toLocaleDateString("en-US", { weekday: "short" });

const formatMonthLabel = (date: Date): string =>
  date.toLocaleDateString("en-US", { month: "short" });

const formatDayOfMonthLabel = (date: Date): string => String(date.getDate());

const formatShortDateLabel = (date: Date): string =>
  date.toLocaleDateString("en-US", { month: "short", day: "numeric" });

const formatFullDate = (date: Date): string =>
  date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

// Documentation only: Builds the label describing a whole range, which is what
// the navigator above the chart shows.
const buildRangeLabel = (period: RangePeriod, start: Date, end: Date): string => {
  if (period === "Day") return formatFullDate(start);
  if (period === "Month") {
    return start.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }
  // Week and Cycle both read as a span. Drop the repeated year when both ends
  // share one.
  const sameYear = start.getFullYear() === end.getFullYear();
  const left = sameYear ? formatShortDateLabel(start) : formatFullDate(start);
  return `${left} - ${formatFullDate(end)}`;
};

// Documentation only: Drops buckets that have not happened yet. A chart must
// never draw a flat zero line into the future and pass it off as data.
const dropFutureBuckets = (buckets: RangeBucket[], now: Date): RangeBucket[] =>
  buckets.filter((bucket) => bucket.start <= now);

// Documentation only: One bucket per hour across a single day.
const buildHourlyBuckets = (day: Date): RangeBucket[] => {
  const dayStart = startOfDay(day);
  return Array.from({ length: 24 }, (_, hour) => {
    const start = new Date(dayStart);
    start.setHours(hour, 0, 0, 0);
    const end = new Date(dayStart);
    end.setHours(hour, 59, 59, 999);
    return { label: formatHourLabel(hour), start, end };
  });
};

// Documentation only: One bucket per day from `from` to `to` inclusive, labelled
// by whichever scheme the caller's axis needs.
const buildDailyBuckets = (
  from: Date,
  to: Date,
  label: (date: Date) => string
): RangeBucket[] => {
  const buckets: RangeBucket[] = [];
  let cursor = startOfDay(from);
  const last = startOfDay(to);

  while (cursor <= last) {
    buckets.push({ label: label(cursor), start: startOfDay(cursor), end: endOfDay(cursor) });
    cursor = addDays(cursor, 1);
  }

  return buckets;
};

// Documentation only: One bucket per calendar month spanned by from..to.
const buildMonthlyBuckets = (from: Date, to: Date): RangeBucket[] => {
  const buckets: RangeBucket[] = [];
  let cursor = startOfMonth(from);
  const last = startOfMonth(to);

  while (cursor <= last) {
    buckets.push({
      label: formatMonthLabel(cursor),
      start: startOfMonth(cursor),
      end: endOfMonth(cursor),
    });
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }

  return buckets;
};

// Documentation only: Resolves a period request into concrete dates and chart
// buckets.
//
//   Day    - 24 hourly buckets on the anchor day.
//   Week   - the 7 days ending on the anchor day.
//   Month  - every day of the anchor's calendar month.
//   Cycle  - the explicit from..to window; daily buckets up to two months,
//            monthly beyond that so the axis stays readable.
//
// In every case buckets after `now` are dropped, so a range that includes today
// stops at the current hour/day rather than trailing off into zeros.
//
// Accepts the request and the current time (injected so tests can pin it).
// Returns a ResolvedRange. Throws AppError(400) on an unusable Cycle window.
export const resolveRange = (
  request: RangeRequest,
  now: Date = new Date()
): ResolvedRange => {
  const { period } = request;

  if (period === "Cycle") {
    const { from, to } = request;

    if (!from || !to || Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new AppError(
        400,
        "A billing cycle needs both a from and a to date (YYYY-MM-DD)."
      );
    }

    const start = startOfDay(from);
    const end = endOfDay(to);

    if (end < start) {
      throw new AppError(400, "The billing cycle's end date is before its start date.");
    }

    const spanDays = Math.round((startOfDay(to).getTime() - start.getTime()) / MS_PER_DAY) + 1;
    if (spanDays > MAX_RANGE_DAYS) {
      throw new AppError(
        400,
        `A billing cycle can span at most ${MAX_RANGE_DAYS} days; this one spans ${spanDays}.`
      );
    }

    const buckets =
      spanDays <= MAX_DAILY_BUCKET_DAYS
        ? buildDailyBuckets(start, end, formatShortDateLabel)
        : buildMonthlyBuckets(start, end);

    return {
      period,
      start,
      end: end < now ? end : now,
      buckets: dropFutureBuckets(buckets, now),
      label: buildRangeLabel(period, start, end),
    };
  }

  const anchor = request.anchor ?? now;
  if (Number.isNaN(anchor.getTime())) {
    throw new AppError(400, "Invalid anchor date. Expected YYYY-MM-DD.");
  }

  if (period === "Day") {
    const start = startOfDay(anchor);
    const end = endOfDay(anchor);
    return {
      period,
      start,
      end: end < now ? end : now,
      buckets: dropFutureBuckets(buildHourlyBuckets(anchor), now),
      label: buildRangeLabel(period, start, end),
    };
  }

  if (period === "Week") {
    const end = endOfDay(anchor);
    const start = startOfDay(addDays(anchor, -6));
    return {
      period,
      start,
      end: end < now ? end : now,
      buckets: dropFutureBuckets(buildDailyBuckets(start, end, formatWeekdayLabel), now),
      label: buildRangeLabel(period, start, end),
    };
  }

  // Month: every day of the anchor's calendar month.
  const start = startOfMonth(anchor);
  const end = endOfMonth(anchor);
  return {
    period,
    start,
    end: end < now ? end : now,
    buckets: dropFutureBuckets(buildDailyBuckets(start, end, formatDayOfMonthLabel), now),
    label: buildRangeLabel(period, start, end),
  };
};

// Documentation only: Builds a fast timestamp -> bucket index lookup for a
// resolved range.
//
// The obvious findIndex() per reading is O(readings x buckets), which a month of
// per-device rows across 31 buckets makes needlessly expensive. Buckets are
// ordered and non-overlapping, so a binary search answers in O(log n).
//
// Accepts the range's buckets.
// Returns a function mapping a Date to its bucket index, or -1 when the
// timestamp falls outside every bucket.
export const bucketIndexFinder = (
  buckets: RangeBucket[]
): ((timestamp: Date) => number) => {
  const starts = buckets.map((bucket) => bucket.start.getTime());
  const ends = buckets.map((bucket) => bucket.end.getTime());

  return (timestamp: Date): number => {
    const time = timestamp.getTime();
    let low = 0;
    let high = buckets.length - 1;

    while (low <= high) {
      const mid = (low + high) >> 1;
      if (time < starts[mid]) high = mid - 1;
      else if (time > ends[mid]) low = mid + 1;
      else return mid;
    }

    return -1;
  };
};

// Documentation only: Parses a YYYY-MM-DD query parameter into a local Date at
// midnight. Deliberately not `new Date(string)` — that parses a bare date as
// UTC, which in UTC+8 lands the range on the wrong day.
// Accepts the raw query value. Returns a Date, or undefined when absent.
// Throws AppError(400) when present but unparseable.
export const parseDateParam = (
  value: unknown,
  fieldName: string
): Date | undefined => {
  if (value === undefined || value === null || value === "") return undefined;

  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new AppError(400, `Invalid ${fieldName}. Expected a YYYY-MM-DD date.`);
  }

  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(year, month - 1, day, 0, 0, 0, 0);

  // Rejects impossible dates that would otherwise roll over (2026-02-30).
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    throw new AppError(400, `Invalid ${fieldName}. "${value}" is not a real date.`);
  }

  return parsed;
};

// The periods a client is allowed to ask for.
const VALID_PERIODS: RangePeriod[] = ["Day", "Week", "Month", "Cycle"];

// Documentation only: Turns an Express query object into a ResolvedRange.
//
// Both /dashboard and /analytics take the identical four parameters, so the
// parsing, the validation and the error messages live here once rather than
// being written twice and drifting.
//
// Accepts the raw req.query and the period to assume when none is given.
// Returns a ResolvedRange. Throws AppError(400) for any unusable input.
export const parseRangeQuery = (
  query: Record<string, unknown>,
  defaultPeriod: RangePeriod
): ResolvedRange => {
  const rawPeriod = (query.period as string) || defaultPeriod;

  if (!VALID_PERIODS.includes(rawPeriod as RangePeriod)) {
    throw new AppError(
      400,
      `Invalid period value "${rawPeriod}". Must be one of: ${VALID_PERIODS.join(", ")}.`
    );
  }

  return resolveRange({
    period: rawPeriod as RangePeriod,
    anchor: parseDateParam(query.anchor, "anchor"),
    from: parseDateParam(query.from, "from"),
    to: parseDateParam(query.to, "to"),
  });
};

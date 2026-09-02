/**
 * Which slice of time the charts are looking at, and how to move through it.
 *
 * The dashboard and analytics screens both let the user walk backwards through
 * their history — yesterday, last week, last month, or the exact window their
 * utility bills them on (Jan 14 – Feb 15). All of the arithmetic for that lives
 * here as pure functions over plain data, separate from the screens that render
 * it, so stepping and labelling can be reasoned about without a component tree.
 *
 * These rules mirror `backend/src/lib/range.ts` exactly. The app needs them
 * locally because the navigator has to label itself the instant a button is
 * tapped — before, and regardless of, whatever the server answers.
 *
 * Dates are handled as local `YYYY-MM-DD` strings on purpose. `toISOString()`
 * is UTC, and in UTC+8 that reports the wrong day for anything before 8am,
 * which would silently shift every range by one day.
 */

export type RangePeriod = "Day" | "Week" | "Month" | "Cycle";

/** A utility billing window, inclusive on both ends. */
export interface BillingCycle {
  /** YYYY-MM-DD */
  from: string;
  /** YYYY-MM-DD */
  to: string;
}

export interface RangeState {
  period: RangePeriod;
  /** The day whose day/week/month is on screen. Unused when period is Cycle. */
  anchor: string;
  /** The billing window. Kept even while another period is selected, so
   *  switching to Cycle and back doesn't lose what the user set up. */
  cycle: BillingCycle;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** The longest window the backend will accept (see MAX_RANGE_DAYS there). */
export const MAX_CYCLE_DAYS = 366;

// ─── Date <-> string ─────────────────────────────────────────────────────────

/** Local calendar date as YYYY-MM-DD. Never use toISOString() for this. */
export function isoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Parses YYYY-MM-DD as local midnight — again, not `new Date(string)`. */
export function fromIso(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1, 0, 0, 0, 0);
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/** Whole days from `from` to `to`, inclusive of both ends. */
export function daysBetween(from: Date, to: Date): number {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime();
  return Math.round((b - a) / MS_PER_DAY) + 1;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// ─── Defaults ────────────────────────────────────────────────────────────────

/**
 * The billing window to start from before the user has told us theirs: the
 * current calendar month. It is a guess at a bill, and the point of the editor
 * is to replace it with the real dates.
 */
export function defaultCycle(now: Date = new Date()): BillingCycle {
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { from: isoDate(first), to: isoDate(last) };
}

/**
 * Where every screen starts: today, this week, this month. Navigation is a
 * thing the user opts into; the app must never open on some stale date they
 * looked at last time.
 */
export function defaultRangeState(
  period: RangePeriod = "Day",
  cycle?: BillingCycle,
  now: Date = new Date()
): RangeState {
  return {
    period,
    anchor: isoDate(now),
    cycle: cycle ?? defaultCycle(now),
  };
}

/** Resets the anchor to today without disturbing the saved cycle. */
export function resetToNow(state: RangeState, now: Date = new Date()): RangeState {
  return { ...state, anchor: isoDate(now) };
}

// ─── Labels ──────────────────────────────────────────────────────────────────

function shortDate(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fullDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** "Jan 14 – Feb 15, 2026", collapsing the year when both ends share one. */
export function formatSpan(from: Date, to: Date): string {
  const left = from.getFullYear() === to.getFullYear() ? shortDate(from) : fullDate(from);
  return `${left} – ${fullDate(to)}`;
}

/**
 * What the navigator shows between its arrows. "Today" and "Yesterday" earn
 * their place over a date — they are what someone actually wants to read when
 * they have not navigated anywhere.
 */
export function rangeLabel(state: RangeState, now: Date = new Date()): string {
  if (state.period === "Cycle") {
    return formatSpan(fromIso(state.cycle.from), fromIso(state.cycle.to));
  }

  const anchor = fromIso(state.anchor);

  if (state.period === "Day") {
    if (sameDay(anchor, now)) return "Today";
    if (sameDay(anchor, addDays(now, -1))) return "Yesterday";
    return fullDate(anchor);
  }

  if (state.period === "Week") {
    return formatSpan(addDays(anchor, -6), anchor);
  }

  return anchor.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

/** A second line under the label: the exact span, when the label hides it. */
export function rangeSubLabel(state: RangeState, now: Date = new Date()): string | null {
  if (state.period !== "Day") return null;
  const anchor = fromIso(state.anchor);
  return sameDay(anchor, now) || sameDay(anchor, addDays(now, -1)) ? fullDate(anchor) : null;
}

// ─── Navigation ──────────────────────────────────────────────────────────────

/**
 * Steps one period backwards (-1) or forwards (+1).
 *
 * Cycles shift by their own length so consecutive windows tile exactly — the
 * previous cycle ends the day before this one starts, with no gap and no
 * overlap. That is how a run of utility bills actually works.
 */
export function stepRange(state: RangeState, direction: -1 | 1): RangeState {
  if (state.period === "Cycle") {
    const from = fromIso(state.cycle.from);
    const to = fromIso(state.cycle.to);
    const length = daysBetween(from, to);
    return {
      ...state,
      cycle: {
        from: isoDate(addDays(from, direction * length)),
        to: isoDate(addDays(to, direction * length)),
      },
    };
  }

  const anchor = fromIso(state.anchor);

  if (state.period === "Day") {
    return { ...state, anchor: isoDate(addDays(anchor, direction)) };
  }

  if (state.period === "Week") {
    return { ...state, anchor: isoDate(addDays(anchor, direction * 7)) };
  }

  // Month: land on the 1st of the neighbouring month. Stepping from the 31st
  // via setMonth would skip a short month entirely.
  const next = new Date(anchor.getFullYear(), anchor.getMonth() + direction, 1);
  return { ...state, anchor: isoDate(next) };
}

/**
 * Whether there is anything ahead worth showing. The future holds no readings,
 * so the forward arrow is disabled rather than stepping onto an empty chart.
 */
export function canStepForward(state: RangeState, now: Date = new Date()): boolean {
  if (state.period === "Cycle") {
    const from = fromIso(state.cycle.from);
    const to = fromIso(state.cycle.to);
    return addDays(from, daysBetween(from, to)) <= now;
  }

  const anchor = fromIso(state.anchor);

  if (state.period === "Month") {
    return (
      anchor.getFullYear() < now.getFullYear() ||
      (anchor.getFullYear() === now.getFullYear() && anchor.getMonth() < now.getMonth())
    );
  }

  // Day and Week both advance by their anchor day.
  return anchor < new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** True when the range is the live one — today, this week, this month. */
export function isCurrentRange(state: RangeState, now: Date = new Date()): boolean {
  return !canStepForward(state, now);
}

// ─── Server query ────────────────────────────────────────────────────────────

/** The query string for /dashboard and /analytics. Both take the same shape. */
export function rangeQuery(state: RangeState): string {
  if (state.period === "Cycle") {
    return `period=Cycle&from=${state.cycle.from}&to=${state.cycle.to}`;
  }
  return `period=${state.period}&anchor=${state.anchor}`;
}

// ─── Validation ──────────────────────────────────────────────────────────────

/**
 * Checks a cycle the user has typed in before it is saved or sent. Returns the
 * problem as a sentence to show them, or null when the window is usable.
 */
export function validateCycle(cycle: BillingCycle): string | null {
  const from = fromIso(cycle.from);
  const to = fromIso(cycle.to);

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return "Pick both a start and an end date.";
  }
  if (to < from) {
    return "The end date is before the start date.";
  }
  if (daysBetween(from, to) > MAX_CYCLE_DAYS) {
    return `A billing cycle can span at most ${MAX_CYCLE_DAYS} days.`;
  }
  return null;
}

// ─── Buckets ─────────────────────────────────────────────────────────────────

/** One point on the axis: its label and the window it covers. */
export interface RangeBucket {
  label: string;
  start: Date;
  end: Date;
  /** "hour" | "day" | "month" — what one point represents. */
  unit: "hour" | "day" | "month";
}

export interface ResolvedRange {
  from: Date;
  to: Date;
  buckets: RangeBucket[];
}

/** "12:00mn", "3:00am", "12:00nn", "9:00pm" — mn/nn rather than a 12:00am. */
export function formatHourLabel(hour: number): string {
  if (hour === 0) return "12:00mn";
  if (hour === 12) return "12:00nn";
  if (hour < 12) return `${hour}:00am`;
  return `${hour - 12}:00pm`;
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

/**
 * The same buckets `backend/src/lib/range.ts` builds, computed locally.
 *
 * The app does not normally need this — real labels arrive with the payload —
 * but sample-data mode has no server to ask, and it must land on exactly the
 * axis the real thing would produce or the demo would misrepresent the product.
 * Keep the two in step.
 */
export function resolveBuckets(state: RangeState, now: Date = new Date()): ResolvedRange {
  const buckets: RangeBucket[] = [];

  const pushDays = (from: Date, to: Date, label: (d: Date) => string) => {
    let cursor = startOfDay(from);
    const last = startOfDay(to);
    while (cursor <= last) {
      buckets.push({
        label: label(cursor),
        start: startOfDay(cursor),
        end: endOfDay(cursor),
        unit: "day",
      });
      cursor = addDays(cursor, 1);
    }
  };

  let from: Date;
  let to: Date;

  if (state.period === "Cycle") {
    from = fromIso(state.cycle.from);
    to = endOfDay(fromIso(state.cycle.to));
    const span = daysBetween(from, fromIso(state.cycle.to));

    if (span <= 62) {
      pushDays(from, to, (d) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" }));
    } else {
      let cursor = new Date(from.getFullYear(), from.getMonth(), 1);
      const last = new Date(to.getFullYear(), to.getMonth(), 1);
      while (cursor <= last) {
        buckets.push({
          label: cursor.toLocaleDateString("en-US", { month: "short" }),
          start: new Date(cursor.getFullYear(), cursor.getMonth(), 1),
          end: new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59, 999),
          unit: "month",
        });
        cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      }
    }
  } else {
    const anchor = fromIso(state.anchor);

    if (state.period === "Day") {
      from = startOfDay(anchor);
      to = endOfDay(anchor);
      for (let hour = 0; hour < 24; hour++) {
        const start = new Date(from);
        start.setHours(hour, 0, 0, 0);
        const end = new Date(from);
        end.setHours(hour, 59, 59, 999);
        buckets.push({ label: formatHourLabel(hour), start, end, unit: "hour" });
      }
    } else if (state.period === "Week") {
      from = startOfDay(addDays(anchor, -6));
      to = endOfDay(anchor);
      pushDays(from, to, (d) => d.toLocaleDateString("en-US", { weekday: "short" }));
    } else {
      from = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
      to = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0, 23, 59, 59, 999);
      pushDays(from, to, (d) => String(d.getDate()));
    }
  }

  return {
    from,
    to: to < now ? to : now,
    // Nothing has happened in the future, so it is not drawn.
    buckets: buckets.filter((bucket) => bucket.start <= now),
  };
}

// ─── Chart axis ──────────────────────────────────────────────────────────────

/**
 * Blanks out labels so a dense axis stays readable while keeping every data
 * point.
 *
 * A day is 24 hourly points and a month is up to 31 daily ones; drawing a label
 * under each turns the axis into a grey smear. Thinning the *labels* rather than
 * the points keeps the line at full resolution — the tooltip still names the
 * exact hour a dot belongs to, because it reads the untouched label array.
 *
 * Accepts the full label list, roughly how many should remain visible, and an
 * optional fixed step that overrides that estimate.
 *
 * The fixed step exists for the hourly axis: derived spacing would label every
 * second hour on a part-finished day and every third on a complete one, so the
 * clock times under the chart would shift as the day went on. Pinning it to 3
 * keeps the labels on 12mn / 3am / 6am / 9am / 12nn / 3pm / 6pm / 9pm all day.
 *
 * Returns a list of the same length with the in-between entries emptied.
 */
export function thinLabels(
  labels: string[],
  maxVisible = 8,
  fixedStep?: number
): string[] {
  if (fixedStep === undefined && labels.length <= maxVisible) return labels;
  const step = fixedStep ?? Math.ceil(labels.length / maxVisible);
  if (step <= 1) return labels;
  return labels.map((label, index) => (index % step === 0 ? label : ""));
}

/** How often the axis should be labelled for a given period. */
export function axisLabelStep(period: RangePeriod): number | undefined {
  // Hours read as clock times, so they get fixed 3-hour anchors. Everything
  // else is spaced to fit.
  return period === "Day" ? 3 : undefined;
}

/**
 * Dot radius for a chart with this many points. Dots are the tap targets on the
 * dashboard, so they cannot simply shrink away — but at 24 or 31 points the
 * full-size dot swallows the line it sits on.
 */
export function dotRadiusFor(pointCount: number): string {
  if (pointCount > 20) return "2.5";
  if (pointCount > 12) return "3";
  return "4";
}

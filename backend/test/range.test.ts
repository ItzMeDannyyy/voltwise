// Unit tests for the pure range resolver (src/lib/range.ts).
//
// resolveRange decides what every chart on both the dashboard and the analytics
// screen is looking at, so the boundaries matter more than the happy path: the
// clock is injected, which lets these tests pin "now" and assert exactly where
// a range stops rather than guessing at whatever day CI runs on.

import { describe, it, expect } from "@jest/globals";
import {
  formatHourLabel,
  parseDateParam,
  resolveRange,
  MAX_RANGE_DAYS,
} from "../src/lib/range.ts";

// A fixed clock: Tuesday 25 August 2026, 15:40 local time.
const NOW = new Date(2026, 7, 25, 15, 40, 0, 0);

describe("formatHourLabel", () => {
  it("uses the mn/nn convention at midnight and noon", () => {
    expect(formatHourLabel(0)).toBe("12:00mn");
    expect(formatHourLabel(12)).toBe("12:00nn");
  });

  it("labels the rest of the day am/pm with an explicit :00", () => {
    expect(formatHourLabel(3)).toBe("3:00am");
    expect(formatHourLabel(11)).toBe("11:00am");
    expect(formatHourLabel(13)).toBe("1:00pm");
    expect(formatHourLabel(21)).toBe("9:00pm");
  });
});

describe("resolveRange — Day", () => {
  it("gives 24 hourly buckets for a day that is fully in the past", () => {
    const range = resolveRange({ period: "Day", anchor: new Date(2026, 7, 20) }, NOW);

    expect(range.buckets).toHaveLength(24);
    expect(range.buckets[0].label).toBe("12:00mn");
    expect(range.buckets[23].label).toBe("11:00pm");
    expect(range.label).toBe("Aug 20, 2026");
  });

  it("stops at the current hour when the anchor is today", () => {
    const range = resolveRange({ period: "Day", anchor: NOW }, NOW);

    // 15:40 means the 3pm bucket has started; 4pm has not.
    expect(range.buckets).toHaveLength(16);
    expect(range.buckets[range.buckets.length - 1].label).toBe("3:00pm");
  });

  it("defaults the anchor to today when none is given", () => {
    expect(resolveRange({ period: "Day" }, NOW).label).toBe("Aug 25, 2026");
  });

  it("never reports an end beyond now", () => {
    expect(resolveRange({ period: "Day", anchor: NOW }, NOW).end).toEqual(NOW);
  });
});

describe("resolveRange — Week", () => {
  it("covers the seven days ending on the anchor", () => {
    const range = resolveRange({ period: "Week", anchor: NOW }, NOW);

    expect(range.buckets).toHaveLength(7);
    expect(range.buckets.map((bucket) => bucket.label)).toEqual([
      "Wed",
      "Thu",
      "Fri",
      "Sat",
      "Sun",
      "Mon",
      "Tue",
    ]);
    expect(range.start).toEqual(new Date(2026, 7, 19, 0, 0, 0, 0));
    expect(range.label).toBe("Aug 19 - Aug 25, 2026");
  });

  it("keeps all seven days for a week entirely in the past", () => {
    const range = resolveRange({ period: "Week", anchor: new Date(2026, 6, 4) }, NOW);
    expect(range.buckets).toHaveLength(7);
  });
});

describe("resolveRange — Month", () => {
  it("stops at today for the current month", () => {
    const range = resolveRange({ period: "Month", anchor: NOW }, NOW);

    expect(range.buckets).toHaveLength(25); // Aug 1..25
    expect(range.buckets[0].label).toBe("1");
    expect(range.buckets[24].label).toBe("25");
    expect(range.label).toBe("August 2026");
  });

  it("covers a whole past month, including its real length", () => {
    const february = resolveRange({ period: "Month", anchor: new Date(2026, 1, 10) }, NOW);
    expect(february.buckets).toHaveLength(28);

    const july = resolveRange({ period: "Month", anchor: new Date(2026, 6, 10) }, NOW);
    expect(july.buckets).toHaveLength(31);
  });
});

describe("resolveRange — Cycle", () => {
  it("buckets a billing cycle by day and labels each with its date", () => {
    const range = resolveRange(
      {
        period: "Cycle",
        from: new Date(2026, 0, 14),
        to: new Date(2026, 1, 15),
      },
      NOW
    );

    expect(range.buckets).toHaveLength(33); // Jan 14..Feb 15 inclusive
    expect(range.buckets[0].label).toBe("Jan 14");
    expect(range.buckets[32].label).toBe("Feb 15");
    expect(range.label).toBe("Jan 14 - Feb 15, 2026");
  });

  it("switches to monthly buckets once a range outgrows a readable daily axis", () => {
    const range = resolveRange(
      {
        period: "Cycle",
        from: new Date(2026, 0, 1),
        to: new Date(2026, 5, 30),
      },
      NOW
    );

    expect(range.buckets).toHaveLength(6);
    expect(range.buckets.map((bucket) => bucket.label)).toEqual([
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
    ]);
  });

  it("drops the part of a cycle that has not happened yet", () => {
    const range = resolveRange(
      {
        period: "Cycle",
        from: new Date(2026, 7, 14),
        to: new Date(2026, 8, 15),
      },
      NOW
    );

    // Aug 14..Aug 25 have happened; the rest of the cycle has not.
    expect(range.buckets).toHaveLength(12);
    expect(range.buckets[range.buckets.length - 1].label).toBe("Aug 25");
    expect(range.end).toEqual(NOW);
  });

  it("spans a year boundary without losing the year in the label", () => {
    const range = resolveRange(
      {
        period: "Cycle",
        from: new Date(2025, 11, 14),
        to: new Date(2026, 0, 13),
      },
      NOW
    );

    expect(range.label).toBe("Dec 14, 2025 - Jan 13, 2026");
  });

  it("rejects a cycle with missing, inverted or oversized bounds", () => {
    expect(() => resolveRange({ period: "Cycle", from: new Date(2026, 0, 14) }, NOW)).toThrow(
      /both a from and a to date/
    );

    expect(() =>
      resolveRange(
        { period: "Cycle", from: new Date(2026, 1, 15), to: new Date(2026, 0, 14) },
        NOW
      )
    ).toThrow(/before its start date/);

    expect(() =>
      resolveRange(
        { period: "Cycle", from: new Date(2025, 0, 1), to: new Date(2026, 5, 1) },
        NOW
      )
    ).toThrow(new RegExp(`at most ${MAX_RANGE_DAYS} days`));
  });
});

describe("parseDateParam", () => {
  it("reads a YYYY-MM-DD string as local midnight, not UTC", () => {
    const parsed = parseDateParam("2026-08-25", "anchor")!;

    // The UTC+8 trap: `new Date("2026-08-25")` would land on Aug 24 locally.
    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(7);
    expect(parsed.getDate()).toBe(25);
    expect(parsed.getHours()).toBe(0);
  });

  it("treats an absent value as absent rather than as an error", () => {
    expect(parseDateParam(undefined, "anchor")).toBeUndefined();
    expect(parseDateParam("", "anchor")).toBeUndefined();
  });

  it("rejects malformed and impossible dates", () => {
    expect(() => parseDateParam("25-08-2026", "anchor")).toThrow(/Expected a YYYY-MM-DD/);
    expect(() => parseDateParam("2026-8-5", "anchor")).toThrow(/Expected a YYYY-MM-DD/);
    expect(() => parseDateParam("2026-02-30", "anchor")).toThrow(/not a real date/);
    expect(() => parseDateParam("2026-13-01", "anchor")).toThrow(/not a real date/);
  });
});

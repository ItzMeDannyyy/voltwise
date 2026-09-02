// Unit tests for the dashboard module.
//
// The service talks to PostgreSQL through the shared Prisma client, so we mock
// `../src/lib/prisma.ts` (and the generated `DeviceStatus` enum) with
// jest.unstable_mockModule — the ESM-safe way to swap a module before the code
// under test imports it. Each test wires the mocked Prisma methods to return
// canned rows, then asserts the service shapes the payload correctly. No real
// database is touched.

import {
  jest,
  describe,
  it,
  expect,
  beforeEach,
} from "@jest/globals";
import type { Request, Response, NextFunction } from "express";

// A loose function signature for the Prisma mocks — the service passes/returns
// arbitrary shapes and we only care about the canned resolved values, so `any`
// keeps the test readable without fighting Prisma's generics.
type AnyFn = (...args: any[]) => any;

// ---- Mock the Prisma client ------------------------------------------------
// A minimal fake exposing only the methods the dashboard service calls.
const prismaMock = {
  device: {
    findMany: jest.fn<AnyFn>(),
  },
  energyReading: {
    findMany: jest.fn<AnyFn>(),
    aggregate: jest.fn<AnyFn>(),
    groupBy: jest.fn<AnyFn>(),
    findFirst: jest.fn<AnyFn>(),
    count: jest.fn<AnyFn>(),
  },
  tariff: {
    findFirst: jest.fn<AnyFn>(),
  },
};

jest.unstable_mockModule("../src/lib/prisma.ts", () => ({
  prisma: prismaMock,
}));

// The service also imports the DeviceStatus enum from the generated client.
// Stub it so we don't load the real Prisma engine.
jest.unstable_mockModule("../src/generated/prisma/index.js", () => ({
  DeviceStatus: { ACTIVE: "ACTIVE", STANDBY: "STANDBY", OFFLINE: "OFFLINE" },
}));

// Import the code under test AFTER registering the mocks (ESM requirement).
const { getDashboardData } = await import(
  "../src/modules/dashboard/dashboard.service.ts"
);
const { getDashboard } = await import(
  "../src/modules/dashboard/dashboard.controller.ts"
);

// The range resolver is pure and unmocked — the service now takes a resolved
// range rather than a period string, so the tests build one the same way the
// controller does. Its own boundary cases live in test/range.test.ts.
const { resolveRange } = await import("../src/lib/range.ts");

/** The range the service used to assume: today, hourly. */
const dayRange = () => resolveRange({ period: "Day" });

// Convenience: reset the aggregate/groupBy/etc. mocks to an "empty DB" baseline
// so every test starts from a known, boring state and only overrides what it
// cares about.
function seedEmptyDatabase() {
  prismaMock.device.findMany.mockResolvedValue([]);
  prismaMock.energyReading.findMany.mockResolvedValue([]);
  prismaMock.energyReading.aggregate.mockResolvedValue({ _sum: { kwh: null } });
  prismaMock.energyReading.groupBy.mockResolvedValue([]);
  prismaMock.energyReading.findFirst.mockResolvedValue(null);
  prismaMock.energyReading.count.mockResolvedValue(0);
  prismaMock.tariff.findFirst.mockResolvedValue(null);
}

beforeEach(() => {
  jest.clearAllMocks();
  seedEmptyDatabase();
});

describe("getDashboardData (service)", () => {
  it("returns a fully-shaped payload with nominal defaults on an empty database", async () => {
    const data = await getDashboardData(1, dayRange());

    expect(data).toMatchObject({
      currentKw: 0,
      totalTodayKwh: 0,
      devices: [],
      topConsumers: [],
      iotOnline: false,
    });
    // History buckets are still produced (zero-filled), and the reading falls
    // back to nominal 220V / 60Hz / 0.9 PF placeholders.
    expect(Array.isArray(data.history.labels)).toBe(true);
    expect(data.history.labels.length).toBe(data.history.data.length);
    expect(data.reading).toMatchObject({
      voltage: 220,
      current: 0,
      activePower: 0,
      energy: 0,
      frequency: 60,
      powerFactor: 0.9,
    });
    expect(typeof data.reading.timestamp).toBe("string");
  });

  it("computes currentKw from the summed rated watts of ACTIVE devices only", async () => {
    prismaMock.device.findMany.mockResolvedValue([
      { id: 1, name: "Aircon", ratedWatts: 1200, status: "ACTIVE" },
      { id: 2, name: "Fridge", ratedWatts: 180, status: "ACTIVE" },
      { id: 3, name: "TV", ratedWatts: 85, status: "STANDBY" },
    ]);

    const data = await getDashboardData(1, dayRange());

    // (1200 + 180) / 1000 = 1.38 kW — the STANDBY TV is excluded.
    expect(data.currentKw).toBe(1.38);
    expect(data.devices).toEqual([
      { id: "1", name: "Aircon", watts: 1200, active: true },
      { id: "2", name: "Fridge", watts: 180, active: true },
      { id: "3", name: "TV", watts: 85, active: false },
    ]);
  });

  it("sums today's whole-home kWh into totalTodayKwh, rounded to 2 decimals", async () => {
    // The service calls aggregate several times; the first call it awaits for
    // the daily total is the whole-home sum. Return the same total everywhere
    // so the assertion is deterministic regardless of call order.
    prismaMock.energyReading.aggregate.mockResolvedValue({
      _sum: { kwh: 18.719 },
    });

    const data = await getDashboardData(1, dayRange());

    expect(data.totalTodayKwh).toBe(18.72);
  });

  it("marks iotOnline true when a recent whole-home reading exists", async () => {
    prismaMock.energyReading.count.mockResolvedValue(3);

    const data = await getDashboardData(1, dayRange());

    expect(data.iotOnline).toBe(true);
    // The liveness check filters to whole-home readings (deviceId: null).
    expect(prismaMock.energyReading.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 1, deviceId: null }),
      })
    );
  });

  it("builds topConsumers as descending integer percentages of the daily total", async () => {
    prismaMock.energyReading.groupBy.mockResolvedValue([
      { deviceId: 10, _sum: { kwh: 6 } },
      { deviceId: 20, _sum: { kwh: 3 } },
      { deviceId: 30, _sum: { kwh: 1 } },
    ]);
    prismaMock.device.findMany.mockImplementation((args: any) => {
      // First call (dashboard device list) has no id filter; the top-consumer
      // name lookup passes { where: { id: { in: [...] } } }.
      if (args?.where?.id?.in) {
        return Promise.resolve([
          { id: 10, name: "Aircon" },
          { id: 20, name: "Fridge" },
          { id: 30, name: "Lights" },
        ]);
      }
      return Promise.resolve([]);
    });

    const data = await getDashboardData(1, dayRange());

    // Total = 10 kWh → 60%, 30%, 10%. Sorted descending, top 5.
    // No tariff seeded → falls back to the default ₱10.5/kWh rate.
    expect(data.topConsumers).toEqual([
      { id: "10", name: "Aircon", pct: 60, color: "#00d4aa", kwh: 6, cost: 63 },
      { id: "20", name: "Fridge", pct: 30, color: "#3b82f6", kwh: 3, cost: 31.5 },
      { id: "30", name: "Lights", pct: 10, color: "#f59e0b", kwh: 1, cost: 10.5 },
    ]);
  });

  it("computes topConsumers cost using the user's active tariff rate", async () => {
    prismaMock.energyReading.groupBy.mockResolvedValue([
      { deviceId: 10, _sum: { kwh: 2 } },
    ]);
    prismaMock.device.findMany.mockImplementation((args: any) => {
      if (args?.where?.id?.in) {
        return Promise.resolve([{ id: 10, name: "Aircon" }]);
      }
      return Promise.resolve([]);
    });
    prismaMock.tariff.findFirst.mockResolvedValue({
      id: 1,
      userId: 1,
      ratePerKwh: 12,
      currency: "₱",
      effectiveFrom: new Date(),
    });

    const data = await getDashboardData(1, dayRange());

    expect(data.topConsumers).toEqual([
      { id: "10", name: "Aircon", pct: 100, color: "#00d4aa", kwh: 2, cost: 24 },
    ]);
  });
});

// ---- Controller period validation -----------------------------------------
// The controller is pure request/response plumbing over the service; here we
// only exercise its period-validation guard with fake req/res/next objects.
describe("getDashboard (controller)", () => {
  function mockRes() {
    const res = {} as Response;
    res.status = jest.fn<AnyFn>().mockReturnValue(res) as any;
    res.json = jest.fn<AnyFn>().mockReturnValue(res) as any;
    return res;
  }

  it("rejects an invalid period and does not hit the database", async () => {
    const req = { user: { id: 1 }, query: { period: "Year" } } as unknown as Request;
    const res = mockRes();
    const next = jest.fn() as unknown as NextFunction;

    await getDashboard(req, res, next);

    // Validation moved into the shared resolver, so a bad range now surfaces as
    // an AppError(400) handed to next() rather than a response written here.
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400 })
    );
    expect(res.status).not.toHaveBeenCalled();
    expect(prismaMock.device.findMany).not.toHaveBeenCalled();
  });

  it("rejects a billing cycle that is missing its bounds", async () => {
    const req = {
      user: { id: 1 },
      query: { period: "Cycle", from: "2026-01-14" },
    } as unknown as Request;
    const res = mockRes();
    const next = jest.fn() as unknown as NextFunction;

    await getDashboard(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400 })
    );
    expect(prismaMock.device.findMany).not.toHaveBeenCalled();
  });

  it("rejects a malformed anchor date", async () => {
    const req = {
      user: { id: 1 },
      query: { period: "Day", anchor: "25-08-2026" },
    } as unknown as Request;
    const res = mockRes();
    const next = jest.fn() as unknown as NextFunction;

    await getDashboard(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400 })
    );
    expect(prismaMock.device.findMany).not.toHaveBeenCalled();
  });

  it("accepts a valid period and returns 200 with the wrapped payload", async () => {
    const req = { user: { id: 1 }, query: { period: "Day" } } as unknown as Request;
    const res = mockRes();
    const next = jest.fn() as unknown as NextFunction;

    await getDashboard(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: expect.any(Object) })
    );
  });

  it("defaults to the 'Day' period when the query param is absent", async () => {
    const req = { user: { id: 1 }, query: {} } as unknown as Request;
    const res = mockRes();
    const next = jest.fn() as unknown as NextFunction;

    await getDashboard(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
  });
});

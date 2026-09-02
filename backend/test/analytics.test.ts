import {
  jest,
  describe,
  it,
  expect,
  beforeEach,
} from "@jest/globals";
import type { Request, Response, NextFunction } from "express";

type AnyFn = (...args: any[]) => any;

// ---- Mock the Prisma client ----
const prismaMock = {
  tariff: {
    findFirst: jest.fn<AnyFn>(),
    create: jest.fn<AnyFn>(),
  },
  billingPeriod: {
    findFirst: jest.fn<AnyFn>(),
    update: jest.fn<AnyFn>(),
  },
  energyReading: {
    aggregate: jest.fn<AnyFn>(),
    groupBy: jest.fn<AnyFn>(),
    findMany: jest.fn<AnyFn>(),
  },
  device: {
    findMany: jest.fn<AnyFn>(),
  },
};

jest.unstable_mockModule("../src/lib/prisma.ts", () => ({
  prisma: prismaMock,
}));

// Mock index.js generated enum so we don't load the real Prisma engine.
jest.unstable_mockModule("../src/generated/prisma/index.js", () => ({
  DeviceStatus: { ACTIVE: "ACTIVE", STANDBY: "STANDBY", OFFLINE: "OFFLINE" },
}));

// Import code under test
const { getAnalyticsData, updateTariff: updateTariffService } = await import(
  "../src/modules/analytics/analytics.service.ts"
);
const { getAnalytics, updateTariff: updateTariffController } = await import(
  "../src/modules/analytics/analytics.controller.ts"
);

// The range resolver is pure and unmocked — the service takes a resolved range
// rather than a period string. Its own boundary cases live in test/range.test.ts.
const { resolveRange } = await import("../src/lib/range.ts");

/** The default analytics window: the current calendar month, day by day. */
const monthRange = () => resolveRange({ period: "Month" });

/** An explicit billing cycle, the case the bill predictor is built for. */
const cycleRange = (from: string, to: string) =>
  resolveRange({ period: "Cycle", from: new Date(from), to: new Date(to) });

function seedEmptyDatabase() {
  prismaMock.tariff.findFirst.mockResolvedValue(null);
  prismaMock.tariff.create.mockResolvedValue({
    id: 1,
    userId: 1,
    ratePerKwh: 10.5,
    currency: "₱",
    effectiveFrom: new Date(),
  });
  prismaMock.billingPeriod.findFirst.mockResolvedValue(null);
  prismaMock.billingPeriod.update.mockResolvedValue({ id: 1, tariffRate: 10.5 });
  prismaMock.energyReading.aggregate.mockResolvedValue({ _sum: { kwh: null } });
  prismaMock.energyReading.groupBy.mockResolvedValue([]);
  prismaMock.energyReading.findMany.mockResolvedValue([]);
  prismaMock.device.findMany.mockResolvedValue([]);
}

beforeEach(() => {
  jest.clearAllMocks();
  seedEmptyDatabase();
});

describe("analytics.service (getAnalyticsData)", () => {
  it("returns a formatted analytics payload with defaults when DB is empty", async () => {
    const data = await getAnalyticsData(1, monthRange());

    expect(data).toMatchObject({
      billPredictor: {
        tariff: 10.5,
        currency: "₱",
        accumulatedKwh: 0,
        estimatedBill: 0,
      },
      totalKwh: 0,
      breakdown: [],
      topConsumers: [],
    });
  });

  it("calculates estimated bill based on latest tariff rate and billing period accumulatedKwh", async () => {
    prismaMock.tariff.findFirst.mockResolvedValue({
      id: 2,
      userId: 1,
      ratePerKwh: 12.34,
      currency: "$",
      effectiveFrom: new Date(),
    });
    prismaMock.billingPeriod.findFirst.mockResolvedValue({
      id: 5,
      userId: 1,
      startDate: new Date(),
      endDate: null,
      accumulatedKwh: 100.5,
      estimatedCost: 0,
      tariffRate: 12.34,
    });

    const data = await getAnalyticsData(1, monthRange());

    expect(data.billPredictor).toEqual({
      tariff: 12.34,
      currency: "$",
      accumulatedKwh: 100.5,
      estimatedBill: 1240.17, // 12.34 * 100.5 = 1240.17
      cycleStart: expect.any(String),
      cycleEnd: null, // the open period has no end date yet
    });
  });

  it("prices the selected window, not the open period, for an explicit billing cycle", async () => {
    prismaMock.tariff.findFirst.mockResolvedValue({
      id: 2,
      userId: 1,
      ratePerKwh: 10,
      currency: "₱",
      effectiveFrom: new Date(),
    });
    // The open BillingPeriod says 100.5 kWh. It must be ignored: the user asked
    // about a specific cycle, so the answer has to come from that window.
    prismaMock.billingPeriod.findFirst.mockResolvedValue({
      id: 5,
      userId: 1,
      startDate: new Date(),
      endDate: null,
      accumulatedKwh: 100.5,
      estimatedCost: 0,
      tariffRate: 10,
    });
    prismaMock.energyReading.aggregate.mockResolvedValue({ _sum: { kwh: 42.5 } });

    const data = await getAnalyticsData(1, cycleRange("2026-01-14", "2026-02-15"));

    expect(data.billPredictor).toMatchObject({
      accumulatedKwh: 42.5,
      estimatedBill: 425,
      cycleStart: "Jan 14, 2026",
      cycleEnd: "Feb 15, 2026",
    });
    expect(data.range).toMatchObject({
      period: "Cycle",
      label: "Jan 14 - Feb 15, 2026",
    });
  });
});

describe("analytics.service (updateTariff)", () => {
  it("creates a new tariff record and updates the active billing period if it exists", async () => {
    prismaMock.billingPeriod.findFirst.mockResolvedValue({
      id: 5,
      userId: 1,
      startDate: new Date(),
      endDate: null,
      accumulatedKwh: 100.5,
      estimatedCost: 0,
      tariffRate: 10.5,
    });
    prismaMock.tariff.create.mockResolvedValue({
      id: 10,
      userId: 1,
      ratePerKwh: 15.2,
      currency: "₱",
      effectiveFrom: new Date(),
    });

    const result = await updateTariffService(1, 15.2, "₱");

    expect(prismaMock.tariff.create).toHaveBeenCalledWith({
      data: {
        userId: 1,
        ratePerKwh: 15.2,
        currency: "₱",
        effectiveFrom: expect.any(Date),
      },
    });
    expect(prismaMock.billingPeriod.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: { tariffRate: 15.2 },
    });
    expect(result).toMatchObject({
      ratePerKwh: 15.2,
      currency: "₱",
    });
  });
});

describe("analytics.controller (getAnalytics)", () => {
  function mockRes() {
    const res = {} as Response;
    res.status = jest.fn<AnyFn>().mockReturnValue(res) as any;
    res.json = jest.fn<AnyFn>().mockReturnValue(res) as any;
    return res;
  }

  it("rejects an invalid period", async () => {
    const req = { user: { id: 1 }, query: { period: "Year" } } as unknown as Request;
    const res = mockRes();
    const next = jest.fn() as unknown as NextFunction;

    await getAnalytics(req, res, next);

    // Validation moved into the shared resolver, so a bad range now surfaces as
    // an AppError(400) handed to next() rather than a response written here.
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400 })
    );
    expect(res.status).not.toHaveBeenCalled();
  });

  it("accepts an explicit billing cycle", async () => {
    const req = {
      user: { id: 1 },
      query: { period: "Cycle", from: "2026-01-14", to: "2026-02-15" },
    } as unknown as Request;
    const res = mockRes();
    const next = jest.fn() as unknown as NextFunction;

    await getAnalytics(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(next).not.toHaveBeenCalled();
  });

  it("accepts a valid period and responds 200", async () => {
    const req = { user: { id: 1 }, query: { period: "Month" } } as unknown as Request;
    const res = mockRes();
    const next = jest.fn() as unknown as NextFunction;

    await getAnalytics(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true })
    );
  });
});

describe("analytics.controller (updateTariff)", () => {
  function mockRes() {
    const res = {} as Response;
    res.status = jest.fn<AnyFn>().mockReturnValue(res) as any;
    res.json = jest.fn<AnyFn>().mockReturnValue(res) as any;
    return res;
  }

  it("rejects missing/invalid ratePerKwh with 400", async () => {
    const req = { user: { id: 1 }, body: { ratePerKwh: -5 } } as unknown as Request;
    const res = mockRes();
    const next = jest.fn() as unknown as NextFunction;

    await updateTariffController(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: expect.stringContaining("Invalid tariff rate"),
      })
    );
  });

  it("accepts valid tariff body and calls updateTariff service", async () => {
    const req = { user: { id: 1 }, body: { ratePerKwh: 11.5, currency: "₱" } } as unknown as Request;
    const res = mockRes();
    const next = jest.fn() as unknown as NextFunction;

    prismaMock.tariff.create.mockResolvedValue({
      id: 11,
      userId: 1,
      ratePerKwh: 11.5,
      currency: "₱",
      effectiveFrom: new Date(),
    });

    await updateTariffController(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({ ratePerKwh: 11.5 }),
      })
    );
  });
});

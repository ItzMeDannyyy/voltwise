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
    const data = await getAnalyticsData(1, "Month");

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

    const data = await getAnalyticsData(1, "Month");

    expect(data.billPredictor).toEqual({
      tariff: 12.34,
      currency: "$",
      accumulatedKwh: 100.5,
      estimatedBill: 1240.17, // 12.34 * 100.5 = 1240.17
      cycleStart: expect.any(String),
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

  it("rejects an invalid period with 400", async () => {
    const req = { user: { id: 1 }, query: { period: "Year" } } as unknown as Request;
    const res = mockRes();
    const next = jest.fn() as unknown as NextFunction;

    await getAnalytics(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false })
    );
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

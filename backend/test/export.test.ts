// Unit tests for the export module and the shared CSV serializer (src/lib/csv.ts).
//
// Following the dashboard.test.ts pattern: the shared Prisma client is mocked
// with jest.unstable_mockModule BEFORE the code under test is imported, so no
// database is touched.
//
// The emphasis is on the two things an export can get wrong without anyone
// noticing until the file is opened somewhere else: the escaping, and the
// per-user scoping.

import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import type { Request, Response, NextFunction } from "express";

type AnyFn = (...args: any[]) => any;

// ---- Mock the Prisma client ------------------------------------------------
const prismaMock = {
  energyReading: {
    count: jest.fn<AnyFn>(),
    aggregate: jest.fn<AnyFn>(),
    findMany: jest.fn<AnyFn>(),
  },
  device: {
    count: jest.fn<AnyFn>(),
    findMany: jest.fn<AnyFn>(),
  },
  alert: {
    count: jest.fn<AnyFn>(),
    findMany: jest.fn<AnyFn>(),
  },
};

jest.unstable_mockModule("../src/lib/prisma.ts", () => ({
  prisma: prismaMock,
}));

// Import the code under test AFTER registering the mocks (ESM requirement).
const { toCsv, UTF8_BOM } = await import("../src/lib/csv.ts");
const exportService = await import("../src/modules/export/export.service.ts");
const exportController = await import("../src/modules/export/export.controller.ts");

const USER_ID = 7;

// Minimal fake Express response that records status, headers and the sent body.
function createRes() {
  const res = {
    statusCode: 0,
    body: null as unknown,
    headers: {} as Record<string, string>,
    status: jest.fn<AnyFn>(),
    json: jest.fn<AnyFn>(),
    send: jest.fn<AnyFn>(),
    setHeader: jest.fn<AnyFn>(),
  };
  res.status.mockImplementation((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json.mockImplementation((payload: unknown) => {
    res.body = payload;
    return res;
  });
  res.send.mockImplementation((payload: unknown) => {
    res.body = payload;
    return res;
  });
  res.setHeader.mockImplementation((name: string, value: string) => {
    res.headers[name] = value;
    return res;
  });
  return res as unknown as Response & typeof res;
}

const createReq = (params: object = {}, query: object = {}) =>
  ({ params, query, user: { id: USER_ID } }) as unknown as Request;

const next: NextFunction = jest.fn<AnyFn>() as unknown as NextFunction;

beforeEach(() => {
  jest.clearAllMocks();

  prismaMock.energyReading.count.mockResolvedValue(0);
  prismaMock.energyReading.findMany.mockResolvedValue([]);
  prismaMock.energyReading.aggregate.mockResolvedValue({
    _min: { timestamp: null },
    _max: { timestamp: null },
  });
  prismaMock.device.count.mockResolvedValue(0);
  prismaMock.device.findMany.mockResolvedValue([]);
  prismaMock.alert.count.mockResolvedValue(0);
  prismaMock.alert.findMany.mockResolvedValue([]);
});

describe("toCsv", () => {
  it("emits the header line even when there are no rows", () => {
    expect(toCsv([], ["a", "b"])).toBe("a,b");
  });

  it("quotes fields containing a comma, quote or newline", () => {
    const csv = toCsv(
      [{ name: 'Living, "big" room', note: "line one\nline two" }],
      ["name", "note"]
    );

    expect(csv).toBe(
      'name,note\r\n"Living, ""big"" room","line one\nline two"'
    );
  });

  it("writes null and undefined as empty fields rather than the words", () => {
    expect(toCsv([{ a: null, b: undefined }], ["a", "b"])).toBe("a,b\r\n,");
  });

  it("neutralises a value a spreadsheet would evaluate as a formula", () => {
    const csv = toCsv([{ name: "=1+1" }], ["name"]);

    // Prefixed with a quote, and then quoted because the guard is invisible
    // otherwise — what matters is that it does not start with "=".
    expect(csv).toBe("name\r\n'=1+1");
  });

  it("leaves negative numbers alone — the formula guard is for strings only", () => {
    expect(toCsv([{ watts: -12.5 }], ["watts"])).toBe("watts\r\n-12.5");
  });

  it("skips a row's missing key instead of shifting the columns", () => {
    expect(toCsv([{ a: 1 }], ["a", "b", "c"])).toBe("a,b,c\r\n1,,");
  });
});

describe("getExportSummary", () => {
  it("scopes every count to the caller's userId", async () => {
    await exportService.getExportSummary(USER_ID, "all");

    for (const call of [
      prismaMock.energyReading.count.mock.calls[0],
      prismaMock.device.count.mock.calls[0],
      prismaMock.alert.count.mock.calls[0],
    ]) {
      expect((call[0] as any).where.userId).toBe(USER_ID);
    }
  });

  it("applies no time filter for the 'all' range", async () => {
    await exportService.getExportSummary(USER_ID, "all");

    const where = (prismaMock.energyReading.count.mock.calls[0][0] as any).where;
    expect(where).toEqual({ userId: USER_ID });
  });

  it("filters readings from midnight for the 'today' range", async () => {
    await exportService.getExportSummary(USER_ID, "today");

    const where = (prismaMock.energyReading.count.mock.calls[0][0] as any).where;
    const start: Date = where.timestamp.gte;
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(start.toDateString()).toBe(new Date().toDateString());
  });

  it("counts devices without a time filter, since the inventory is not a log", async () => {
    await exportService.getExportSummary(USER_ID, "today");

    expect((prismaMock.device.count.mock.calls[0][0] as any).where).toEqual({
      userId: USER_ID,
    });
  });

  it("flags a dataset as truncated only once it exceeds the row cap", async () => {
    prismaMock.energyReading.count.mockResolvedValue(exportService.MAX_EXPORT_ROWS + 1);
    prismaMock.alert.count.mockResolvedValue(exportService.MAX_EXPORT_ROWS);

    const summary = await exportService.getExportSummary(USER_ID, "all");

    expect(summary.readings.truncated).toBe(true);
    expect(summary.alerts.truncated).toBe(false);
    expect(summary.maxRows).toBe(exportService.MAX_EXPORT_ROWS);
  });

  it("reports the reading window bounds as ISO strings", async () => {
    prismaMock.energyReading.aggregate.mockResolvedValue({
      _min: { timestamp: new Date("2026-06-01T00:00:00.000Z") },
      _max: { timestamp: new Date("2026-08-02T10:30:00.000Z") },
    });

    const summary = await exportService.getExportSummary(USER_ID, "all");

    expect(summary.firstReadingAt).toBe("2026-06-01T00:00:00.000Z");
    expect(summary.lastReadingAt).toBe("2026-08-02T10:30:00.000Z");
  });
});

describe("buildExportTable", () => {
  it("marks whole-home and per-device readings apart in a scope column", async () => {
    prismaMock.energyReading.findMany.mockResolvedValue([
      {
        timestamp: new Date("2026-08-02T09:00:00.000Z"),
        deviceId: null,
        device: null,
        watts: 1200,
        kwh: 0.66,
        voltage: 221.4,
        current: 5.4,
        frequency: 60,
        powerFactor: 0.97,
      },
      {
        timestamp: new Date("2026-08-02T08:00:00.000Z"),
        deviceId: 3,
        device: { name: "Aircon" },
        watts: 900,
        kwh: 0.5,
        voltage: null,
        current: null,
        frequency: null,
        powerFactor: null,
      },
    ]);

    const table = await exportService.buildExportTable(USER_ID, "readings", "7d");

    // Fetched newest-first for the row cap, emitted oldest-first for charting.
    expect(table.rows.map((row) => row.timestamp)).toEqual([
      "2026-08-02T08:00:00.000Z",
      "2026-08-02T09:00:00.000Z",
    ]);
    expect(table.rows[0].scope).toBe("device");
    expect(table.rows[0].deviceName).toBe("Aircon");
    expect(table.rows[1].scope).toBe("home");
    expect(table.rows[1].deviceName).toBeNull();
  });

  it("caps the readings query at MAX_EXPORT_ROWS", async () => {
    await exportService.buildExportTable(USER_ID, "readings", "all");

    const args = prismaMock.energyReading.findMany.mock.calls[0][0] as any;
    expect(args.take).toBe(exportService.MAX_EXPORT_ROWS);
    expect(args.orderBy).toEqual({ timestamp: "desc" });
    expect(args.where.userId).toBe(USER_ID);
  });

  it("ignores the range when exporting the device inventory", async () => {
    await exportService.buildExportTable(USER_ID, "devices", "today");

    expect((prismaMock.device.findMany.mock.calls[0][0] as any).where).toEqual({
      userId: USER_ID,
    });
  });

  it("flattens the room relation onto the device row", async () => {
    prismaMock.device.findMany.mockResolvedValue([
      {
        id: 1,
        name: "Fridge",
        room: { name: "Kitchen" },
        category: "Appliance",
        ratedWatts: 150,
        status: "ACTIVE",
        enabled: true,
        createdAt: new Date("2026-01-05T00:00:00.000Z"),
        updatedAt: new Date("2026-08-01T00:00:00.000Z"),
      },
    ]);

    const table = await exportService.buildExportTable(USER_ID, "devices", "all");

    expect(table.rows[0].room).toBe("Kitchen");
    expect(table.rows[0].status).toBe("ACTIVE");
  });

  it("filters alerts on createdAt rather than a timestamp column", async () => {
    await exportService.buildExportTable(USER_ID, "alerts", "30d");

    const where = (prismaMock.alert.findMany.mock.calls[0][0] as any).where;
    expect(where.createdAt.gte).toBeInstanceOf(Date);
    expect(where.timestamp).toBeUndefined();
  });
});

describe("exportFilename", () => {
  it("names the file after the dataset, range and a minute-precision stamp", () => {
    const name = exportService.exportFilename(
      "readings",
      "7d",
      "csv",
      new Date(2026, 7, 2, 14, 5)
    );

    expect(name).toBe("voltwise-readings-7d-20260802-1405.csv");
  });
});

describe("export controller", () => {
  it("rejects an unknown dataset with 400", async () => {
    const res = createRes();
    await exportController.getExport(createReq({ dataset: "passwords" }), res, next);

    expect(res.statusCode).toBe(400);
    expect(prismaMock.energyReading.findMany).not.toHaveBeenCalled();
  });

  it("rejects an unknown range with 400", async () => {
    const res = createRes();
    await exportController.getExport(
      createReq({ dataset: "readings" }, { range: "forever" }),
      res,
      next
    );

    expect(res.statusCode).toBe(400);
  });

  it("rejects an unknown format with 400", async () => {
    const res = createRes();
    await exportController.getExport(
      createReq({ dataset: "readings" }, { format: "xlsx" }),
      res,
      next
    );

    expect(res.statusCode).toBe(400);
  });

  it("sends CSV with a BOM and a download filename, and no envelope", async () => {
    prismaMock.energyReading.findMany.mockResolvedValue([
      {
        timestamp: new Date("2026-08-02T09:00:00.000Z"),
        deviceId: null,
        device: null,
        watts: 1200,
        kwh: 0.66,
        voltage: 221.4,
        current: 5.4,
        frequency: 60,
        powerFactor: 0.97,
      },
    ]);

    const res = createRes();
    await exportController.getExport(createReq({ dataset: "readings" }), res, next);

    expect(res.statusCode).toBe(200);
    expect(res.headers["Content-Type"]).toBe("text/csv; charset=utf-8");
    expect(res.headers["Content-Disposition"]).toMatch(
      /^attachment; filename="voltwise-readings-30d-\d{8}-\d{4}\.csv"$/
    );

    const body = res.body as string;
    expect(body.startsWith(UTF8_BOM)).toBe(true);
    expect(body).toContain("timestamp,scope,deviceId");
    expect(body).toContain("2026-08-02T09:00:00.000Z,home,,");
    // The file is the response — wrapping it would make it unopenable.
    expect(res.json).not.toHaveBeenCalled();
  });

  it("sends JSON exports with their metadata and the same rows", async () => {
    prismaMock.device.findMany.mockResolvedValue([
      {
        id: 1,
        name: "Fridge",
        room: null,
        category: null,
        ratedWatts: 150,
        status: "IDLE",
        enabled: true,
        createdAt: new Date("2026-01-05T00:00:00.000Z"),
        updatedAt: new Date("2026-08-01T00:00:00.000Z"),
      },
    ]);

    const res = createRes();
    await exportController.getExport(
      createReq({ dataset: "devices" }, { format: "json" }),
      res,
      next
    );

    expect(res.headers["Content-Type"]).toBe("application/json; charset=utf-8");

    const parsed = JSON.parse(res.body as string);
    expect(parsed.dataset).toBe("devices");
    expect(parsed.rowCount).toBe(1);
    expect(parsed.truncated).toBe(false);
    expect(parsed.rows[0].name).toBe("Fridge");
    // Not the { success, data } envelope.
    expect(parsed.success).toBeUndefined();
  });

  it("defaults the summary range to 30d and wraps it in the envelope", async () => {
    const res = createRes();
    await exportController.getSummary(createReq({}, {}), res, next);

    expect(res.statusCode).toBe(200);
    expect((res.body as any).success).toBe(true);
    expect((res.body as any).data.range).toBe("30d");
  });

  it("rejects an unknown summary range with 400", async () => {
    const res = createRes();
    await exportController.getSummary(createReq({}, { range: "yesterday" }), res, next);

    expect(res.statusCode).toBe(400);
    expect(prismaMock.energyReading.count).not.toHaveBeenCalled();
  });
});

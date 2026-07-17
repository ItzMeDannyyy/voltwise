// Unit tests for the alerts module service layer.
//
// Following the dashboard.test.ts pattern: the shared Prisma client and the
// generated AlertType enum are mocked with jest.unstable_mockModule BEFORE the
// service is imported, so no real database is touched.

import { jest, describe, it, expect, beforeEach } from "@jest/globals";

type AnyFn = (...args: any[]) => any;

// ---- Mock the Prisma client ------------------------------------------------
const prismaMock = {
  alert: {
    findMany: jest.fn<AnyFn>(),
    findUnique: jest.fn<AnyFn>(),
    update: jest.fn<AnyFn>(),
    updateMany: jest.fn<AnyFn>(),
    create: jest.fn<AnyFn>(),
  },
};

jest.unstable_mockModule("../src/lib/prisma.ts", () => ({
  prisma: prismaMock,
}));

// The service imports the AlertType enum from the generated client.
jest.unstable_mockModule("../src/generated/prisma/index.js", () => ({
  AlertType: { CRITICAL: "CRITICAL", WARNING: "WARNING", INFO: "INFO" },
}));

// Import the code under test AFTER registering the mocks (ESM requirement).
const alertsService = await import("../src/modules/alerts/alerts.service.ts");

// A canned Prisma alert row created "now" (so its section label is TODAY).
const alertRow = (overrides: Record<string, unknown> = {}) => ({
  id: 42,
  userId: 7,
  deviceId: null,
  type: "WARNING",
  title: "High consumption detected",
  description: "Total usage exceeded 8 kW for 15 minutes.",
  recommendation: null,
  threshold: null,
  value: null,
  read: false,
  createdAt: new Date(),
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe("createAlert", () => {
  it("maps the lowercase type to the enum and persists the payload", async () => {
    prismaMock.alert.create.mockImplementation((args: { data: unknown }) =>
      Promise.resolve(alertRow(args.data as Record<string, unknown>))
    );

    const created = await alertsService.createAlert(7, {
      type: "info",
      title: "New load detected",
      description: "Power jumped by ~200 W.",
      recommendation: "Add it as a device.",
      value: 200,
    });

    expect(prismaMock.alert.create).toHaveBeenCalledTimes(1);
    const arg = prismaMock.alert.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(arg.data).toMatchObject({
      userId: 7,
      type: "INFO",
      title: "New load detected",
      recommendation: "Add it as a device.",
      value: 200,
      deviceId: null,
      read: false,
    });

    // The response uses the app-facing lowercase type and shape.
    expect(created).toMatchObject({
      type: "info",
      title: "New load detected",
      read: false,
      section: "TODAY",
    });
  });
});

describe("getAllAlerts", () => {
  it("returns the user's alerts formatted for the app, newest first", async () => {
    prismaMock.alert.findMany.mockResolvedValue([
      alertRow({ id: 2, type: "CRITICAL", recommendation: "Check the AC." }),
      alertRow({ id: 1, type: "INFO", createdAt: new Date("2026-01-01T09:15:00") }),
    ]);

    const alerts = await alertsService.getAllAlerts(7);

    expect(prismaMock.alert.findMany).toHaveBeenCalledWith({
      where: { userId: 7 },
      orderBy: { createdAt: "desc" },
    });
    expect(alerts).toHaveLength(2);
    expect(alerts[0]).toMatchObject({
      id: "2",
      type: "critical",
      section: "TODAY",
      recommendation: "Check the AC.",
    });
    // Older alert: lowercased type, HH:mm time, non-today section.
    expect(alerts[1]).toMatchObject({
      id: "1",
      type: "info",
      time: "09:15",
      section: "YESTERDAY",
    });
    // No recommendation key at all when the column is null.
    expect("recommendation" in alerts[1]).toBe(false);
  });
});

describe("markAlertRead", () => {
  it("marks the user's own alert as read", async () => {
    prismaMock.alert.findUnique.mockResolvedValue(alertRow());
    prismaMock.alert.update.mockResolvedValue(alertRow({ read: true }));

    const updated = await alertsService.markAlertRead(7, 42);

    expect(prismaMock.alert.update).toHaveBeenCalledWith({
      where: { id: 42 },
      data: { read: true },
    });
    expect(updated.read).toBe(true);
  });

  it("rejects an alert owned by another user without updating it", async () => {
    prismaMock.alert.findUnique.mockResolvedValue(alertRow({ userId: 99 }));

    await expect(alertsService.markAlertRead(7, 42)).rejects.toThrow(
      "Alert not found"
    );
    expect(prismaMock.alert.update).not.toHaveBeenCalled();
  });

  it("rejects a missing alert", async () => {
    prismaMock.alert.findUnique.mockResolvedValue(null);

    await expect(alertsService.markAlertRead(7, 42)).rejects.toThrow(
      "Alert not found"
    );
  });
});

describe("markAllAlertsRead", () => {
  it("batch-updates only the user's unread alerts", async () => {
    prismaMock.alert.updateMany.mockResolvedValue({ count: 3 });

    const ok = await alertsService.markAllAlertsRead(7);

    expect(ok).toBe(true);
    expect(prismaMock.alert.updateMany).toHaveBeenCalledWith({
      where: { userId: 7, read: false },
      data: { read: true },
    });
  });
});

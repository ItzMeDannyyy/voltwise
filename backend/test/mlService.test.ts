// Unit tests for the ML service client (src/lib/mlService.ts).
// Tests appliance fuzzy matching, prediction handling, registered device association,
// and the "Unregistered Load" tagging workflow.

import { jest, describe, it, expect, beforeEach } from "@jest/globals";

type AnyFn = (...args: any[]) => any;

const prismaMock = {
  device: {
    findMany: jest.fn<AnyFn>(),
    findFirst: jest.fn<AnyFn>(),
    create: jest.fn<AnyFn>(),
    update: jest.fn<AnyFn>(),
    updateMany: jest.fn<AnyFn>(),
  },
  alert: {
    create: jest.fn<AnyFn>(),
  },
};

jest.unstable_mockModule("../src/lib/prisma.ts", () => ({
  prisma: prismaMock,
}));

// Import after unstable_mockModule
const mlService = await import("../src/lib/mlService.ts");

describe("matchesAppliance fuzzy matching", () => {
  it("matches Air Conditioner variants", () => {
    expect(mlService.matchesAppliance("Air Conditioner", "Living Room Aircon", "Cooling")).toBe(true);
    expect(mlService.matchesAppliance("Air Conditioner", "Master Bed AC", "Cooling")).toBe(true);
    expect(mlService.matchesAppliance("Air Conditioner", "Inverter Air Conditioner", null)).toBe(true);
    expect(mlService.matchesAppliance("Air Conditioner", "Desk Fan", "Ventilation")).toBe(false);
  });

  it("matches Refrigerator variants", () => {
    expect(mlService.matchesAppliance("Refrigerator", "Kitchen Fridge", "Kitchen")).toBe(true);
    expect(mlService.matchesAppliance("Refrigerator", "Samsung Refrigerator", null)).toBe(true);
    expect(mlService.matchesAppliance("Refrigerator", "Microwave Oven", "Kitchen")).toBe(false);
  });

  it("matches Light Bulb variants", () => {
    expect(mlService.matchesAppliance("Light Bulb", "Living Room Chandelier", "Lighting")).toBe(true);
    expect(mlService.matchesAppliance("Light Bulb", "Desk Lamp", null)).toBe(true);
    expect(mlService.matchesAppliance("Light Bulb", "LED Bulb", null)).toBe(true);
    expect(mlService.matchesAppliance("Light Bulb", "Water Kettle", "Kitchen")).toBe(false);
  });

  it("matches Cellphone charger variants", () => {
    expect(
      mlService.matchesAppliance("Cellphone SAMSUNG A14 5G 10watts", "Phone Charger", "Electronics")
    ).toBe(true);
    expect(
      mlService.matchesAppliance("Cellphone SAMSUNG A14 5G 10watts", "Samsung Charger", null)
    ).toBe(true);
    expect(
      mlService.matchesAppliance("Cellphone SAMSUNG A14 5G 10watts", "Aircon", "Cooling")
    ).toBe(false);
  });
});

describe("matchOrTagDevice", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns null for negligible standby power (< 3W) without anomaly", async () => {
    const res = await mlService.matchOrTagDevice(
      1,
      {
        cluster: 1,
        interpretation: "Standby / Idle",
        dominant_appliance: "Refrigerator",
        nearest_distance: 0.2,
        distance_threshold: 1.5,
        is_anomaly: false,
        alert_level: "normal",
        message: "Normal",
      },
      2.1
    );

    expect(res).toBeNull();
    expect(prismaMock.device.findMany).not.toHaveBeenCalled();
  });

  it("associates reading with registered device when dominant appliance matches", async () => {
    prismaMock.device.findMany.mockResolvedValue([
      { id: 10, name: "Master Bedroom Aircon", category: "Cooling", status: "IDLE" },
    ]);
    prismaMock.device.update.mockResolvedValue({});

    const res = await mlService.matchOrTagDevice(
      1,
      {
        cluster: 2,
        interpretation: "High Continuous Load (Air Conditioner)",
        dominant_appliance: "Air Conditioner",
        nearest_distance: 0.5,
        distance_threshold: 1.5,
        is_anomaly: false,
        alert_level: "normal",
        message: "Normal",
      },
      630.0
    );

    expect(res).not.toBeNull();
    expect(res?.deviceId).toBe(10);
    expect(res?.deviceName).toBe("Master Bedroom Aircon");
    expect(res?.isUnregistered).toBe(false);
    expect(prismaMock.device.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { status: "ACTIVE" },
    });
  });

  it("creates and tags Unregistered Load when no registered device matches", async () => {
    prismaMock.device.findMany.mockResolvedValue([
      { id: 10, name: "Master Bedroom Aircon", category: "Cooling", status: "IDLE" },
    ]);
    prismaMock.device.findFirst.mockResolvedValue(null);
    prismaMock.device.create.mockResolvedValue({
      id: 99,
      name: "Unregistered Load",
      category: "Unregistered",
      status: "ACTIVE",
    });
    prismaMock.alert.create.mockResolvedValue({
      id: 1,
      type: "WARNING",
      title: "Unregistered Load Detected",
      description: "...",
      read: false,
      createdAt: new Date(),
    });

    const res = await mlService.matchOrTagDevice(
      1,
      {
        cluster: 5,
        interpretation: "Low-Power Device / Charging (Cellphone SAMSUNG A14 5G 10watts)",
        dominant_appliance: "Cellphone SAMSUNG A14 5G 10watts",
        nearest_distance: 0.6,
        distance_threshold: 1.5,
        is_anomaly: false,
        alert_level: "normal",
        message: "Normal",
      },
      8.5
    );

    expect(res).not.toBeNull();
    expect(res?.deviceId).toBe(99);
    expect(res?.deviceName).toBe("Unregistered Load");
    expect(res?.isUnregistered).toBe(true);
    expect(prismaMock.device.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 1,
        name: "Unregistered Load",
        category: "Unregistered",
        status: "ACTIVE",
      }),
    });
  });
});

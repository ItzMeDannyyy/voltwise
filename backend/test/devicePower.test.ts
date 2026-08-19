// Unit tests for the master-power reconciliation rule in the devices module.
//
// Following the dashboard.test.ts pattern: the shared Prisma client and the
// generated enums are mocked with jest.unstable_mockModule BEFORE the code
// under test is imported, so importing devices.service.ts never opens a
// database connection. The relay position is a parameter rather than an import,
// so no MQTT mock is needed here at all. The rule itself
// (resolvePowerReconciliation) is pure, so the tests drive it with plain
// objects and assert only which devices change.

import { jest, describe, it, expect } from "@jest/globals";

type AnyFn = (...args: any[]) => any;

// ---- Mock the Prisma client ------------------------------------------------
jest.unstable_mockModule("../src/lib/prisma.ts", () => ({
  prisma: {
    device: { findMany: jest.fn<AnyFn>(), update: jest.fn<AnyFn>() },
    $transaction: jest.fn<AnyFn>(),
  },
}));

// ---- Mock the generated enum ------------------------------------------------
const DeviceStatus = {
  ACTIVE: "ACTIVE",
  IDLE: "IDLE",
  OFF: "OFF",
  UNPOWERED: "UNPOWERED",
} as const;

jest.unstable_mockModule("../src/generated/prisma/index.js", () => ({
  DeviceStatus,
}));

const { resolvePowerReconciliation } = await import(
  "../src/modules/devices/devices.service.ts"
);

// A representative spread: two drawing, one idle, one the user switched off.
const devices = [
  { id: 1, status: DeviceStatus.ACTIVE, enabled: true, ratedWatts: 1200 },
  { id: 2, status: DeviceStatus.IDLE, enabled: true, ratedWatts: 0 },
  { id: 3, status: DeviceStatus.OFF, enabled: false, ratedWatts: 0 },
  { id: 4, status: DeviceStatus.ACTIVE, enabled: true, ratedWatts: 180 },
] as any[];

describe("resolvePowerReconciliation", () => {
  describe("when power is not confirmed available", () => {
    it("marks every device that is not already UNPOWERED", () => {
      const changes = resolvePowerReconciliation(false, devices);

      expect(changes).toHaveLength(4);
      expect(changes.every((c) => c.status === DeviceStatus.UNPOWERED)).toBe(true);
      expect(changes.map((c) => c.id)).toEqual([1, 2, 3, 4]);
    });

    it("skips devices already UNPOWERED so a repeated refresh writes nothing", () => {
      const parked = devices.map((d) => ({ ...d, status: DeviceStatus.UNPOWERED }));

      expect(resolvePowerReconciliation(false, parked)).toEqual([]);
    });

    it("returns only the devices that still need changing in a mixed list", () => {
      const mixed = [
        { ...devices[0], status: DeviceStatus.UNPOWERED },
        devices[1],
      ];

      expect(resolvePowerReconciliation(false, mixed)).toEqual([
        { id: 2, status: DeviceStatus.UNPOWERED },
      ]);
    });
  });

  describe("when power is confirmed available", () => {
    it("releases UNPOWERED devices back to the status their own intent implies", () => {
      const parked = devices.map((d) => ({ ...d, status: DeviceStatus.UNPOWERED }));

      expect(resolvePowerReconciliation(true, parked)).toEqual([
        { id: 1, status: DeviceStatus.ACTIVE },
        { id: 2, status: DeviceStatus.IDLE },
        { id: 3, status: DeviceStatus.OFF },
        { id: 4, status: DeviceStatus.ACTIVE },
      ]);
    });

    it("leaves devices that were never parked alone", () => {
      expect(resolvePowerReconciliation(true, devices)).toEqual([]);
    });
  });

  // The caller collapses "relay open", "sensor unreachable" and "no sensor
  // paired" into the same false, because none of them is evidence that an
  // appliance is drawing power.
  describe("when the link is dead rather than the relay open", () => {
    it("still parks devices, since power cannot be confirmed either way", () => {
      const changes = resolvePowerReconciliation(false, devices);

      expect(changes).toHaveLength(4);
      expect(changes.every((c) => c.status === DeviceStatus.UNPOWERED)).toBe(true);
    });
  });

  it("never mutates the devices it is given", () => {
    const snapshot = JSON.parse(JSON.stringify(devices));
    resolvePowerReconciliation(false, devices);
    resolvePowerReconciliation(true, devices);

    expect(devices).toEqual(snapshot);
  });
});

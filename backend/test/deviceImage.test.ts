// Unit tests for the device photo attachment flow
// (devices.service.setDeviceImage): ownership enforcement and imageUri update.
//
// Same harness as dashboard.test.ts: the shared Prisma client and the
// generated DeviceStatus enum are mocked before importing the service.

import { jest, describe, it, expect, beforeEach } from "@jest/globals";

type AnyFn = (...args: any[]) => any;

// ---- Mock the Prisma client ------------------------------------------------
const prismaMock = {
  device: {
    findUnique: jest.fn<AnyFn>(),
    update: jest.fn<AnyFn>(),
  },
  room: {
    findFirst: jest.fn<AnyFn>(),
    create: jest.fn<AnyFn>(),
  },
};

jest.unstable_mockModule("../src/lib/prisma.ts", () => ({
  prisma: prismaMock,
}));

jest.unstable_mockModule("../src/generated/prisma/index.js", () => ({
  DeviceStatus: { ACTIVE: "ACTIVE", IDLE: "IDLE", OFF: "OFF" },
}));

// Import the code under test AFTER registering the mocks (ESM requirement).
const devicesService = await import("../src/modules/devices/devices.service.ts");

const deviceRow = (overrides: Record<string, unknown> = {}) => ({
  id: 3,
  userId: 7,
  roomId: 1,
  name: "Refrigerator",
  category: "Kitchen",
  imageUri: null,
  ratedWatts: 180,
  status: "ACTIVE",
  enabled: true,
  room: { name: "Kitchen" },
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe("setDeviceImage", () => {
  it("stores the served /uploads path on the user's device", async () => {
    prismaMock.device.findUnique.mockResolvedValue(deviceRow());
    prismaMock.device.update.mockImplementation((args: { data: { imageUri: string } }) =>
      Promise.resolve(deviceRow({ imageUri: args.data.imageUri }))
    );

    const updated = await devicesService.setDeviceImage(
      7,
      3,
      "device-3-1234567890.jpg"
    );

    expect(prismaMock.device.update).toHaveBeenCalledWith({
      where: { id: 3 },
      data: { imageUri: "/uploads/device-3-1234567890.jpg" },
      include: { room: true },
    });
    expect(updated).toMatchObject({
      id: "3",
      imageUri: "/uploads/device-3-1234567890.jpg",
      room: "Kitchen",
    });
  });

  it("rejects a device owned by another user without updating it", async () => {
    prismaMock.device.findUnique.mockResolvedValue(deviceRow({ userId: 99 }));

    await expect(
      devicesService.setDeviceImage(7, 3, "device-3-1.jpg")
    ).rejects.toThrow("Device not found");
    expect(prismaMock.device.update).not.toHaveBeenCalled();
  });

  it("rejects a missing device", async () => {
    prismaMock.device.findUnique.mockResolvedValue(null);

    await expect(
      devicesService.setDeviceImage(7, 999, "device-999-1.jpg")
    ).rejects.toThrow("Device not found");
    expect(prismaMock.device.update).not.toHaveBeenCalled();
  });
});

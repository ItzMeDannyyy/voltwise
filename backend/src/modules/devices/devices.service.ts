// Documentation only: Service layer for the devices module.
// Contains all business logic and Prisma database calls for device management.
// No HTTP-specific code (req, res) lives here — this layer is fully reusable.
// All functions accept a userId parameter so they operate on the authenticated
// user's data rather than a hardcoded demo user.

import fs from "node:fs";
import path from "node:path";
import { prisma } from "../../lib/prisma.ts";
import { UPLOADS_DIR } from "../../lib/upload.ts";
import { getLatestTariff } from "../../lib/tariff.ts";
import { DeviceStatus } from "../../generated/prisma/index.js";
import type {
  DeviceResponseDto,
  CreateDeviceDto,
  UpdateDeviceDto,
  DeviceLatestReadingDto,
} from "./devices";

// Documentation only: Formats a raw Prisma Device record (with its Room relation)
// into the DeviceResponseDto shape the mobile app expects.
// Accepts the Prisma device object including optional category and imageUri fields,
// plus an optional room relation.
// Returns a DeviceResponseDto.
const formatDeviceForResponse = (device: {
  id: number;
  name: string;
  category: string | null;
  imageUri: string | null;
  ratedWatts: number;
  status: DeviceStatus;
  enabled: boolean;
  room: { name: string } | null;
}): DeviceResponseDto => {
  return {
    id: String(device.id),
    name: device.name,
    room: device.room?.name ?? "Unassigned",
    category: device.category,
    imageUri: device.imageUri,
    status: device.status,
    watts: device.ratedWatts,
    enabled: device.enabled,
  };
};

// Documentation only: Derives the DeviceStatus enum value from enabled + watt fields.
// An enabled device with watts > 0 is ACTIVE; enabled with 0 watts is IDLE; disabled is OFF.
// Accepts enabled (boolean) and watts (number).
// Returns a DeviceStatus value.
const deriveDeviceStatus = (enabled: boolean, watts: number): DeviceStatus => {
  if (!enabled) return DeviceStatus.OFF;
  if (watts > 0) return DeviceStatus.ACTIVE;
  return DeviceStatus.IDLE;
};

// The subset of a Device this reconciliation needs. Declared structurally so
// the pure function below can be unit-tested with plain objects.
export interface ReconcilableDevice {
  id: number;
  status: DeviceStatus;
  enabled: boolean;
  ratedWatts: number;
}

// Documentation only: Decides which devices must change status given whether
// mains power is confirmed to be reaching them. Pure — no Prisma, no clock, no
// MQTT — so the rule can be tested on its own; reconcilePowerState does the I/O.
//
// powerAvailable is a positive assertion, not the absence of bad news: it is
// true only when the sensor is reporting AND its relay says closed. Every other
// situation — relay open, sensor unreachable, no sensor paired at all — is
// false, because in none of them can the system stand behind a claim that an
// appliance is drawing power. Downgrading to UNPOWERED is the conservative
// move; leaving a device ACTIVE asserts something nothing has verified.
//
//   false → every device not already UNPOWERED becomes UNPOWERED.
//   true  → devices parked as UNPOWERED are released, each returning to
//           whatever its own intent implies, so nothing the user chose is lost.
//
// Accepts whether power is confirmed available, and the user's devices.
// Returns only the devices whose status actually changes, as {id, status}.
export const resolvePowerReconciliation = (
  powerAvailable: boolean,
  devices: readonly ReconcilableDevice[]
): { id: number; status: DeviceStatus }[] => {
  if (!powerAvailable) {
    return devices
      .filter((device) => device.status !== DeviceStatus.UNPOWERED)
      .map((device) => ({ id: device.id, status: DeviceStatus.UNPOWERED }));
  }

  return devices
    .filter((device) => device.status === DeviceStatus.UNPOWERED)
    .map((device) => ({
      id: device.id,
      status: deriveDeviceStatus(device.enabled, device.ratedWatts),
    }));
};

// Documentation only: Finds or creates a Room record by name for a given user.
// This allows the "create device" flow to accept a room name string without requiring
// the caller to pre-create the room separately.
// Accepts userId (number) and roomName (string).
// Returns the Room's id (number).
const findOrCreateRoomByName = async (
  userId: number,
  roomName: string
): Promise<number> => {
  const existingRoom = await prisma.room.findFirst({
    where: { userId, name: roomName },
  });

  if (existingRoom) {
    return existingRoom.id;
  }

  const newRoom = await prisma.room.create({
    data: { userId, name: roomName },
  });

  return newRoom.id;
};

// Documentation only: Retrieves all devices belonging to the given user,
// including their associated room names, formatted as DeviceResponseDto objects.
// Accepts userId (number) — the authenticated user's database id.
// Returns a Promise resolving to an array of DeviceResponseDto.
export const getAllDevices = async (userId: number): Promise<DeviceResponseDto[]> => {
  const devices = await prisma.device.findMany({
    where: { userId },
    include: { room: true },
    orderBy: { createdAt: "asc" },
  });

  return devices.map(formatDeviceForResponse);
};

// Documentation only: Applies the master-relay position to the stored device
// statuses and returns the resulting device list. Invoked by the app's
// pull-to-refresh so the list a user pulls down is consistent with whether the
// house actually has power.
//
// powerAvailable is passed in rather than derived here so this module never
// imports the MQTT client — that would pull the broker singleton and the alerts
// service into every consumer of the devices service, including its tests. The
// controller computes it from the backend's own MQTT state; it is never taken
// from the client, since the app may be paired to a different board and no
// client should be able to mark another account's devices UNPOWERED.
//
// Accepts userId (number) and whether power is confirmed available (boolean).
// Returns a Promise resolving to the full DeviceResponseDto[] after any change.
export const reconcilePowerState = async (
  userId: number,
  powerAvailable: boolean
): Promise<DeviceResponseDto[]> => {
  const devices = await prisma.device.findMany({
    where: { userId },
    include: { room: true },
    orderBy: { createdAt: "asc" },
  });

  const changes = resolvePowerReconciliation(powerAvailable, devices);

  // Nothing to do — return what we already read rather than querying twice.
  if (changes.length === 0) return devices.map(formatDeviceForResponse);

  // One transaction so the list can never be observed half-reconciled.
  await prisma.$transaction(
    changes.map((change) =>
      prisma.device.update({
        where: { id: change.id },
        data: { status: change.status },
      })
    )
  );

  return getAllDevices(userId);
};

// Documentation only: Creates a new device for the given user.
// If the given room name does not yet exist for this user, it is created automatically.
// The device status is derived from the enabled flag and watt value.
// Accepts userId (number) and a CreateDeviceDto.
// Returns a Promise resolving to the newly created DeviceResponseDto.
export const createDevice = async (
  userId: number,
  dto: CreateDeviceDto
): Promise<DeviceResponseDto> => {
  const roomId = await findOrCreateRoomByName(userId, dto.room);
  const effectiveWatts = dto.enabled ? dto.watts : 0;
  const status = deriveDeviceStatus(dto.enabled, effectiveWatts);

  const newDevice = await prisma.device.create({
    data: {
      userId,
      roomId,
      name: dto.name,
      category: dto.category ?? null,
      imageUri: dto.imageUri ?? null,
      ratedWatts: dto.watts,
      status,
      enabled: dto.enabled,
    },
    include: { room: true },
  });

  return formatDeviceForResponse(newDevice);
};

// Documentation only: Updates an existing device by its ID.
// Toggling enabled to false forces status to OFF and clears current watts to 0.
// Toggling enabled to true restores ratedWatts and recomputes ACTIVE or IDLE status.
// Changing the room name will find-or-create the Room record for the given user.
// Accepts userId (number), the device id (number), and a partial UpdateDeviceDto.
// Returns a Promise resolving to the updated DeviceResponseDto.
// Throws an error if the device does not exist.
export const updateDevice = async (
  userId: number,
  deviceId: number,
  dto: UpdateDeviceDto
): Promise<DeviceResponseDto> => {
  const existingDevice = await prisma.device.findUnique({
    where: { id: deviceId },
  });

  if (!existingDevice) {
    throw new Error("Device not found");
  }

  const updatedRoomId =
    dto.room !== undefined
      ? await findOrCreateRoomByName(userId, dto.room)
      : undefined;

  // Determine the new enabled state, falling back to the current stored value.
  const newEnabled =
    dto.enabled !== undefined ? dto.enabled : existingDevice.enabled;

  // Determine the new rated watts, falling back to the current stored value.
  const newRatedWatts =
    dto.watts !== undefined ? dto.watts : existingDevice.ratedWatts;

  const newStatus = deriveDeviceStatus(newEnabled, newRatedWatts);

  const updatedDevice = await prisma.device.update({
    where: { id: deviceId },
    data: {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.category !== undefined && { category: dto.category }),
      ...(dto.imageUri !== undefined && { imageUri: dto.imageUri }),
      ...(updatedRoomId !== undefined && { roomId: updatedRoomId }),
      ratedWatts: newRatedWatts,
      enabled: newEnabled,
      status: newStatus,
    },
    include: { room: true },
  });

  return formatDeviceForResponse(updatedDevice);
};

// Documentation only: Deletes a device by its ID.
// Accepts userId (number) — reserved for future ownership verification — and
// the device id (number).
// Returns a Promise resolving to true if deletion succeeded.
// Throws an error if the device does not exist.
export const deleteDevice = async (
  _userId: number,
  deviceId: number
): Promise<boolean> => {
  const existingDevice = await prisma.device.findUnique({
    where: { id: deviceId },
  });

  if (!existingDevice) {
    throw new Error("Device not found");
  }

  await prisma.device.delete({ where: { id: deviceId } });
  return true;
};

// Documentation only: Attaches an uploaded photo to a device.
// Verifies the device exists AND belongs to the given user before touching it
// (uploads must never land on another user's device). Replaces imageUri with
// the served path of the new file and best-effort deletes the previously
// uploaded file so the uploads folder doesn't accumulate orphans.
// Accepts userId (number), deviceId (number), and the stored filename (string).
// Returns a Promise resolving to the updated DeviceResponseDto.
// Throws an error if the device does not exist or is owned by another user.
export const setDeviceImage = async (
  userId: number,
  deviceId: number,
  filename: string
): Promise<DeviceResponseDto> => {
  const existingDevice = await prisma.device.findUnique({
    where: { id: deviceId },
  });

  if (!existingDevice || existingDevice.userId !== userId) {
    throw new Error("Device not found");
  }

  // Clean up the previous upload (only files we manage under /uploads/).
  if (existingDevice.imageUri?.startsWith("/uploads/")) {
    const oldFile = path.join(UPLOADS_DIR, path.basename(existingDevice.imageUri));
    fs.promises.unlink(oldFile).catch(() => {});
  }

  const updatedDevice = await prisma.device.update({
    where: { id: deviceId },
    data: { imageUri: `/uploads/${filename}` },
    include: { room: true },
  });

  return formatDeviceForResponse(updatedDevice);
};

// Documentation only: Retrieves the most recent EnergyReading row for a specific device,
// plus that device's total kWh consumed today and its cost at the user's current tariff rate.
// Filters by both deviceId and userId to ensure the reading belongs to the authenticated user's device.
// Accepts userId (number) and deviceId (number).
// Returns a Promise resolving to a DeviceLatestReadingDto if a reading exists, or null if none found.
export const getDeviceLatestReading = async (
  userId: number,
  deviceId: number
): Promise<DeviceLatestReadingDto | null> => {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const [reading, todayAggregate, tariff] = await Promise.all([
    prisma.energyReading.findFirst({
      where: { deviceId, userId },
      orderBy: { timestamp: "desc" },
    }),
    prisma.energyReading.aggregate({
      where: { deviceId, userId, timestamp: { gte: todayStart, lte: todayEnd } },
      _sum: { kwh: true },
    }),
    getLatestTariff(userId),
  ]);

  if (!reading) return null;

  const todayKwh = parseFloat((todayAggregate._sum.kwh ?? 0).toFixed(3));

  return {
    watts: reading.watts,
    kwh: reading.kwh,
    todayKwh,
    costToday: parseFloat((todayKwh * tariff.ratePerKwh).toFixed(2)),
    voltage: reading.voltage,
    current: reading.current,
    frequency: reading.frequency,
    powerFactor: reading.powerFactor,
    timestamp: reading.timestamp.toISOString(),
  };
};

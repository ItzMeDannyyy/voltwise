// Documentation only: Service layer for the devices module.
// Contains all business logic and Prisma database calls for device management.
// No HTTP-specific code (req, res) lives here — this layer is fully reusable.

import { prisma } from "../../lib/prisma.ts";
import { DeviceStatus } from "../../generated/prisma/index.js";
import type {
  DeviceResponseDto,
  CreateDeviceDto,
  UpdateDeviceDto,
} from "./devices.dto.ts";

// The demo user ID that all MVP operations are scoped to.
const DEMO_USER_ID = 1;

// Documentation only: Formats a raw Prisma Device record (with its Room relation)
// into the DeviceResponseDto shape the mobile app expects.
// Accepts the Prisma device object with an optional room relation included.
// Returns a DeviceResponseDto.
const formatDeviceForResponse = (device: {
  id: number;
  icon: string;
  name: string;
  ratedWatts: number;
  status: DeviceStatus;
  enabled: boolean;
  room: { name: string } | null;
}): DeviceResponseDto => {
  return {
    id: String(device.id),
    icon: device.icon,
    name: device.name,
    room: device.room?.name ?? "Unassigned",
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

// Documentation only: Retrieves all devices belonging to the demo user,
// including their associated room names, formatted as DeviceResponseDto objects.
// Returns a Promise resolving to an array of DeviceResponseDto.
export const getAllDevices = async (): Promise<DeviceResponseDto[]> => {
  const devices = await prisma.device.findMany({
    where: { userId: DEMO_USER_ID },
    include: { room: true },
    orderBy: { createdAt: "asc" },
  });

  return devices.map(formatDeviceForResponse);
};

// Documentation only: Creates a new device for the demo user.
// If the given room name does not yet exist for this user, it is created automatically.
// The device status is derived from the enabled flag and watt value.
// Accepts a CreateDeviceDto.
// Returns a Promise resolving to the newly created DeviceResponseDto.
export const createDevice = async (
  dto: CreateDeviceDto
): Promise<DeviceResponseDto> => {
  const roomId = await findOrCreateRoomByName(DEMO_USER_ID, dto.room);
  const effectiveWatts = dto.enabled ? dto.watts : 0;
  const status = deriveDeviceStatus(dto.enabled, effectiveWatts);

  const newDevice = await prisma.device.create({
    data: {
      userId: DEMO_USER_ID,
      roomId,
      name: dto.name,
      icon: dto.icon,
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
// Changing the room name will find-or-create the Room record.
// Accepts the device id (number) and a partial UpdateDeviceDto.
// Returns a Promise resolving to the updated DeviceResponseDto.
// Throws an error if the device does not exist.
export const updateDevice = async (
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
      ? await findOrCreateRoomByName(DEMO_USER_ID, dto.room)
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
      ...(dto.icon !== undefined && { icon: dto.icon }),
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
// Accepts the device id (number).
// Returns a Promise resolving to true if deletion succeeded.
// Throws an error if the device does not exist.
export const deleteDevice = async (deviceId: number): Promise<boolean> => {
  const existingDevice = await prisma.device.findUnique({
    where: { id: deviceId },
  });

  if (!existingDevice) {
    throw new Error("Device not found");
  }

  await prisma.device.delete({ where: { id: deviceId } });
  return true;
};

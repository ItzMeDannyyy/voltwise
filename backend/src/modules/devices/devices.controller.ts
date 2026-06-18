// Documentation only: Controller layer for the devices module.
// Handles the HTTP request/response cycle for all device endpoints.
// Extracts and type-checks input, delegates to the service, and returns
// standardized JSON responses. No business logic lives here.

import type { Request, Response, NextFunction } from "express";
import * as devicesService from "./devices.service.ts";
import type { CreateDeviceDto, UpdateDeviceDto } from "./devices.dto.ts";

// Documentation only: Handles GET /api/devices.
// Fetches all devices for the demo user and returns them as a JSON array.
// Returns 200 with { success: true, data: DeviceResponseDto[] } on success.
// Passes any errors to the Express error handler via next().
export const getAllDevices = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const deviceList = await devicesService.getAllDevices();
    res.status(200).json({ success: true, data: deviceList });
  } catch (error) {
    next(error);
  }
};

// Documentation only: Handles POST /api/devices.
// Reads icon, name, room, watts, and enabled from the request body.
// Validates that required fields are present before calling the service.
// Returns 201 with { success: true, data: DeviceResponseDto } on success.
// Passes any errors to the Express error handler via next().
export const createDevice = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { icon, name, room, watts, enabled } = req.body as CreateDeviceDto;

    if (!icon || !name || !room || watts === undefined || enabled === undefined) {
      res.status(400).json({
        success: false,
        message:
          "Missing required fields: icon, name, room, watts, and enabled are all required.",
      });
      return;
    }

    const createDeviceDto: CreateDeviceDto = {
      icon,
      name,
      room,
      watts: Number(watts),
      enabled: Boolean(enabled),
    };

    const createdDevice = await devicesService.createDevice(createDeviceDto);
    res.status(201).json({ success: true, data: createdDevice });
  } catch (error) {
    next(error);
  }
};

// Documentation only: Handles PATCH /api/devices/:id.
// Reads the device ID from the route params and optional update fields from the body.
// Returns 200 with { success: true, data: DeviceResponseDto } on success.
// Returns 404 if the device does not exist.
// Passes any errors to the Express error handler via next().
export const updateDevice = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const deviceId = Number(req.params.id);

    if (isNaN(deviceId)) {
      res
        .status(400)
        .json({ success: false, message: "Device ID must be a valid number." });
      return;
    }

    const updateDeviceDto: UpdateDeviceDto = {};

    if (req.body.icon !== undefined) updateDeviceDto.icon = req.body.icon;
    if (req.body.name !== undefined) updateDeviceDto.name = req.body.name;
    if (req.body.room !== undefined) updateDeviceDto.room = req.body.room;
    if (req.body.watts !== undefined)
      updateDeviceDto.watts = Number(req.body.watts);
    if (req.body.enabled !== undefined)
      updateDeviceDto.enabled = Boolean(req.body.enabled);

    const updatedDevice = await devicesService.updateDevice(
      deviceId,
      updateDeviceDto
    );

    res.status(200).json({ success: true, data: updatedDevice });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === "Device not found") {
      res.status(404).json({ success: false, message: "Device not found." });
      return;
    }
    next(error);
  }
};

// Documentation only: Handles DELETE /api/devices/:id.
// Reads the device ID from the route params and calls the service to delete it.
// Returns 200 with { success: true } on success.
// Returns 404 if the device does not exist.
// Passes any errors to the Express error handler via next().
export const deleteDevice = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const deviceId = Number(req.params.id);

    if (isNaN(deviceId)) {
      res
        .status(400)
        .json({ success: false, message: "Device ID must be a valid number." });
      return;
    }

    await devicesService.deleteDevice(deviceId);
    res.status(200).json({ success: true });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === "Device not found") {
      res.status(404).json({ success: false, message: "Device not found." });
      return;
    }
    next(error);
  }
};

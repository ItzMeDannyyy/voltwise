// Documentation only: Controller layer for the devices module.
// Handles the HTTP request/response cycle for all device endpoints.
// Extracts and type-checks input, reads the authenticated user's id from req.user,
// delegates to the service, and returns standardized JSON responses.
// No business logic lives here.

import fs from "node:fs";
import type { Request, Response, NextFunction } from "express";
import * as devicesService from "./devices.service.ts";
import type {
  CreateDeviceDto,
  UpdateDeviceDto,
  DeviceLatestReadingDto,
} from "./devices";

// Documentation only: Handles GET /api/devices.
// Reads the authenticated user's id from req.user (set by requireAuth middleware).
// Fetches all devices for that user and returns them as a JSON array.
// Returns 200 with { success: true, data: DeviceResponseDto[] } on success.
// Passes any errors to the Express error handler via next().
export const getAllDevices = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user!.id;
    const deviceList = await devicesService.getAllDevices(userId);
    res.status(200).json({ success: true, data: deviceList });
  } catch (error) {
    next(error);
  }
};

// Documentation only: Handles POST /api/devices.
// Reads name, room, watts, and enabled from the request body as required fields.
// Also reads optional category and imageUri fields if provided.
// Validates that all required fields are present before calling the service.
// Returns 201 with { success: true, data: DeviceResponseDto } on success.
// Passes any errors to the Express error handler via next().
export const createDevice = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { name, room, watts, enabled, category, imageUri } =
      req.body as CreateDeviceDto;

    if (!name || !room || watts === undefined || enabled === undefined) {
      res.status(400).json({
        success: false,
        message:
          "Missing required fields: name, room, watts, and enabled are all required.",
      });
      return;
    }

    const createDeviceDto: CreateDeviceDto = {
      name,
      room,
      watts: Number(watts),
      enabled: Boolean(enabled),
      category,
      imageUri,
    };

    const createdDevice = await devicesService.createDevice(userId, createDeviceDto);
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
    const userId = req.user!.id;
    const deviceId = Number(req.params.id);

    if (isNaN(deviceId)) {
      res
        .status(400)
        .json({ success: false, message: "Device ID must be a valid number." });
      return;
    }

    const updateDeviceDto: UpdateDeviceDto = {};

    if (req.body.name !== undefined) updateDeviceDto.name = req.body.name;
    if (req.body.category !== undefined) updateDeviceDto.category = req.body.category;
    if (req.body.imageUri !== undefined) updateDeviceDto.imageUri = req.body.imageUri;
    if (req.body.room !== undefined) updateDeviceDto.room = req.body.room;
    if (req.body.watts !== undefined)
      updateDeviceDto.watts = Number(req.body.watts);
    if (req.body.enabled !== undefined)
      updateDeviceDto.enabled = Boolean(req.body.enabled);

    const updatedDevice = await devicesService.updateDevice(
      userId,
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
    const userId = req.user!.id;
    const deviceId = Number(req.params.id);

    if (isNaN(deviceId)) {
      res
        .status(400)
        .json({ success: false, message: "Device ID must be a valid number." });
      return;
    }

    await devicesService.deleteDevice(userId, deviceId);
    res.status(200).json({ success: true });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === "Device not found") {
      res.status(404).json({ success: false, message: "Device not found." });
      return;
    }
    next(error);
  }
};

// Documentation only: Handles POST /api/devices/:id/photo.
// The route's multer middleware has already stored the multipart "photo" file
// into the uploads folder and set req.file; this handler validates the id and
// file presence, then delegates to the service to attach it to the device.
// Returns 200 with { success: true, data: DeviceResponseDto } on success.
// Returns 400 when no file was sent, 404 when the device isn't the user's.
// Passes any errors to the Express error handler via next().
export const uploadDevicePhoto = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user!.id;
    const deviceId = Number(req.params.id);

    if (isNaN(deviceId)) {
      res
        .status(400)
        .json({ success: false, message: "Device ID must be a valid number." });
      return;
    }

    if (!req.file) {
      res.status(400).json({
        success: false,
        message: 'Missing image file: send it as the multipart field "photo".',
      });
      return;
    }

    const updatedDevice = await devicesService.setDeviceImage(
      userId,
      deviceId,
      req.file.filename
    );

    res.status(200).json({ success: true, data: updatedDevice });
  } catch (error: unknown) {
    // The file was already written by multer — remove it when the device
    // lookup fails so rejected uploads don't linger in the bucket.
    if (req.file) fs.promises.unlink(req.file.path).catch(() => {});

    if (error instanceof Error && error.message === "Device not found") {
      res.status(404).json({ success: false, message: "Device not found." });
      return;
    }
    next(error);
  }
};

// Documentation only: Handles GET /api/devices/:id/readings/latest.
// Reads the device ID from the route params and the authenticated user's id from req.user.
// Fetches the single most recent EnergyReading row for that device.
// Returns 200 with { success: true, data: DeviceLatestReadingDto | null } — data is null
// when no readings exist yet for the device (e.g. newly added device).
// Passes any errors to the Express error handler via next().
export const getDeviceLatestReading = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user!.id;
    const deviceId = Number(req.params.id);

    if (isNaN(deviceId)) {
      res
        .status(400)
        .json({ success: false, message: "Device ID must be a valid number." });
      return;
    }

    const reading: DeviceLatestReadingDto | null =
      await devicesService.getDeviceLatestReading(userId, deviceId);

    res.status(200).json({ success: true, data: reading });
  } catch (error) {
    next(error);
  }
};

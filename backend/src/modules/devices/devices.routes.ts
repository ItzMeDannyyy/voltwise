// Documentation only: Registers all HTTP routes for the devices module.
// Maps REST endpoints to their respective controller functions.
// No middleware is applied at this level for the MVP (no auth guard yet).

import { Router } from "express";
import * as devicesController from "./devices.controller.ts";
import { deviceImageUpload } from "../../lib/upload.ts";

const devicesRouter = Router();

// GET /api/devices — returns the full list of devices for the authenticated user.
devicesRouter.get("/", devicesController.getAllDevices);

// POST /api/devices — creates a new device, find-or-creating the room by name.
devicesRouter.post("/", devicesController.createDevice);

// PATCH /api/devices/:id — partially updates a device's fields.
devicesRouter.patch("/:id", devicesController.updateDevice);

// POST /api/devices/:id/photo — attaches an uploaded image (multipart field
// "photo") to the device; the file lands in backend/uploads/ and is served
// back at the /uploads path stored in imageUri.
devicesRouter.post(
  "/:id/photo",
  deviceImageUpload.single("photo"),
  devicesController.uploadDevicePhoto
);

// GET /api/devices/:id/readings/latest — returns the most recent energy reading for a device.
devicesRouter.get("/:id/readings/latest", devicesController.getDeviceLatestReading);

// DELETE /api/devices/:id — removes a device permanently.
devicesRouter.delete("/:id", devicesController.deleteDevice);

export default devicesRouter;

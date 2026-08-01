// Documentation only: Controller layer for the iot module.
// Handles the HTTP request/response cycle for relay commands and IoT status.
// Requires authentication (applied at the router level in routes/index.ts) —
// relay commands switch real mains power, so they must never be anonymous.
// No business logic lives here — all logic is delegated to iot.service.ts.

import type { Request, Response, NextFunction } from "express";
import * as iotService from "./iot.service.ts";
import type { RelayCommandDto } from "./iot";

// Documentation only: Handles POST /api/iot/relay.
// Body must be { on: boolean } (strict boolean — strings like "true" are
// rejected so a malformed client can't accidentally switch mains power).
// Publishes the command to the device and returns the current status snapshot.
// Returns 503 (via AppError) when the MQTT broker connection is down.
export const setRelay = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const body = req.body as Partial<RelayCommandDto>;

    if (typeof body.on !== "boolean") {
      res.status(400).json({
        success: false,
        message: "Body must be { on: boolean }.",
      });
      return;
    }

    const status = iotService.setRelay(body.on);
    res.status(200).json({ success: true, data: status });
  } catch (error) {
    next(error);
  }
};

// Documentation only: Handles GET /api/iot/status.
// Returns the last-known device state: online flag (telemetry-freshness
// checked), broker connectivity, retained relay state, and latest telemetry.
export const getStatus = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    res.status(200).json({ success: true, data: iotService.getStatus() });
  } catch (error) {
    next(error);
  }
};

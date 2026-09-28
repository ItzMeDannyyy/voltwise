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
        message: "Body must be { on: boolean, line?: 'high' | 'low' | 'all' }.",
      });
      return;
    }

    const line = body.line;
    if (line !== undefined && line !== "high" && line !== "low" && line !== "all") {
      res.status(400).json({
        success: false,
        message: "line must be 'high', 'low', or 'all'.",
      });
      return;
    }

    const status = iotService.setRelay(body.on, line);
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

/**
 * Handles POST/PUT /api/iot/safety.
 * Body: { enabled: boolean, thresholdWatts?: number }.
 */
export const setSafety = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const body = req.body as Partial<iotService.StartCollectionDto & { enabled?: unknown; thresholdWatts?: unknown }>;

    if (typeof body.enabled !== "boolean") {
      res.status(400).json({
        success: false,
        message: "Body must include { enabled: boolean, thresholdWatts?: number }.",
      });
      return;
    }

    const thresholdWatts =
      typeof body.thresholdWatts === "number" && Number.isFinite(body.thresholdWatts)
        ? body.thresholdWatts
        : undefined;

    const status = iotService.setSafety(body.enabled, thresholdWatts);
    res.status(200).json({ success: true, data: status });
  } catch (error) {
    next(error);
  }
};

/**
 * Handles POST/PUT /api/iot/countdown.
 * Body: { enabled: boolean, seconds?: number }.
 */
export const setCountdown = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const body = req.body as { enabled?: unknown; seconds?: unknown };

    if (typeof body.enabled !== "boolean") {
      res.status(400).json({
        success: false,
        message: "Body must include { enabled: boolean, seconds?: number }.",
      });
      return;
    }

    const seconds =
      typeof body.seconds === "number" && Number.isFinite(body.seconds) && body.seconds > 0
        ? body.seconds
        : undefined;

    const status = iotService.setCountdown(body.enabled, seconds);
    res.status(200).json({ success: true, data: status });
  } catch (error) {
    next(error);
  }
};


/**
 * Handles POST /api/iot/collection/start.
 * Body: { applianceName: string, line?: 'high' | 'low' | 'all', clearReadings?: boolean }.
 */
export const startCollection = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const body = req.body as { applianceName?: unknown; line?: unknown; clearReadings?: unknown };

    if (!body || typeof body.applianceName !== "string" || !body.applianceName.trim()) {
      res.status(400).json({
        success: false,
        message: "applianceName is required and must be a non-empty string.",
      });
      return;
    }

    const line = body.line as iotService.PowerLine | undefined;
    if (line !== undefined && line !== "high" && line !== "low" && line !== "all") {
      res.status(400).json({
        success: false,
        message: "line must be 'high', 'low', or 'all'.",
      });
      return;
    }

    const result = await iotService.startCollection(req.user!.id, {
      applianceName: body.applianceName.trim(),
      line,
      clearReadings: body.clearReadings !== false,
    });

    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

/**
 * Handles POST /api/iot/collection/stop.
 * Stops collection and turns OFF the relay module.
 */
export const stopCollection = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const body = req.body as { line?: unknown };
    const line = body?.line as iotService.PowerLine | undefined;
    const result = await iotService.stopCollection(line);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

/**
 * Handles GET /api/iot/collection/status.
 */
export const getCollectionStatus = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const status = iotService.getCollectionStatus();
    res.status(200).json({ success: true, data: status });
  } catch (error) {
    next(error);
  }
};

/**
 * Handles DELETE /api/iot/readings.
 * Clears all energy readings in the database.
 */
export const resetReadings = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const result = await iotService.resetReadings();
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};


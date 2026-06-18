// Documentation only: Controller layer for the alerts module.
// Handles the HTTP request/response cycle for all alert endpoints.
// No business logic lives here — all logic is delegated to alerts.service.ts.

import type { Request, Response, NextFunction } from "express";
import * as alertsService from "./alerts.service.ts";
import type { CreateAlertDto } from "./alerts.dto.ts";

const VALID_ALERT_TYPES = ["critical", "warning", "info"] as const;

// Documentation only: Handles POST /api/alerts.
// Creates a new alert (used by the in-app demo control to simulate events).
// Validates that type/title/description are present and well-formed.
// Returns 201 with { success: true, data: AlertResponseDto } on success.
// Passes any errors to the Express error handler via next().
export const createAlert = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const body = req.body as Partial<CreateAlertDto>;

    if (
      !body.type ||
      !VALID_ALERT_TYPES.includes(body.type) ||
      typeof body.title !== "string" ||
      body.title.trim() === "" ||
      typeof body.description !== "string" ||
      body.description.trim() === ""
    ) {
      res.status(400).json({
        success: false,
        message:
          "type (critical|warning|info), title and description are required.",
      });
      return;
    }

    const created = await alertsService.createAlert({
      type: body.type,
      title: body.title.trim(),
      description: body.description.trim(),
      recommendation: body.recommendation,
      threshold: body.threshold,
      value: body.value,
      deviceId: body.deviceId,
    });

    res.status(201).json({ success: true, data: created });
  } catch (error) {
    next(error);
  }
};

// Documentation only: Handles GET /api/alerts.
// Fetches all alerts for the demo user, ordered newest-first.
// Returns 200 with { success: true, data: AlertResponseDto[] } on success.
// Passes any errors to the Express error handler via next().
export const getAllAlerts = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const alertList = await alertsService.getAllAlerts();
    res.status(200).json({ success: true, data: alertList });
  } catch (error) {
    next(error);
  }
};

// Documentation only: Handles PATCH /api/alerts/:id/read.
// Reads the alert ID from the route params and marks that alert as read.
// Returns 200 with { success: true, data: AlertResponseDto } on success.
// Returns 404 if the alert does not exist.
// Passes any errors to the Express error handler via next().
export const markAlertRead = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const alertId = Number(req.params.id);

    if (isNaN(alertId)) {
      res
        .status(400)
        .json({ success: false, message: "Alert ID must be a valid number." });
      return;
    }

    const updatedAlert = await alertsService.markAlertRead(alertId);
    res.status(200).json({ success: true, data: updatedAlert });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === "Alert not found") {
      res.status(404).json({ success: false, message: "Alert not found." });
      return;
    }
    next(error);
  }
};

// Documentation only: Handles POST /api/alerts/read-all.
// Marks all unread alerts for the demo user as read in a single batch operation.
// Returns 200 with { success: true } on success.
// Passes any errors to the Express error handler via next().
export const markAllAlertsRead = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    await alertsService.markAllAlertsRead();
    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
};

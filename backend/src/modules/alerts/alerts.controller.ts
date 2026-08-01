// Documentation only: Controller layer for the alerts module.
// Handles the HTTP request/response cycle for all alert endpoints.
// Reads the authenticated user's id from req.user (set by requireAuth middleware).
// No business logic lives here — all logic is delegated to alerts.service.ts.

import type { Request, Response, NextFunction } from "express";
import * as alertsService from "./alerts.service.ts";
import type { CreateAlertDto } from "./alerts";

const VALID_ALERT_TYPES = ["critical", "warning", "info"] as const;

// Documentation only: Handles POST /api/alerts.
// Creates a new alert (used by the in-app demo control to simulate events).
// Reads the authenticated user's id from req.user.
// Validates that type/title/description are present and well-formed.
// Returns 201 with { success: true, data: AlertResponseDto } on success.
// Passes any errors to the Express error handler via next().
export const createAlert = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user!.id;
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

    const created = await alertsService.createAlert(userId, {
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
// Reads the authenticated user's id from req.user.
// Fetches all alerts for that user, ordered newest-first.
// Returns 200 with { success: true, data: AlertResponseDto[] } on success.
// Passes any errors to the Express error handler via next().
export const getAllAlerts = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user!.id;
    const alertList = await alertsService.getAllAlerts(userId);
    res.status(200).json({ success: true, data: alertList });
  } catch (error) {
    next(error);
  }
};

// Documentation only: Handles PATCH /api/alerts/:id/read.
// Reads the authenticated user's id from req.user.
// Reads the alert ID from the route params and marks that alert as read.
// Returns 200 with { success: true, data: AlertResponseDto } on success.
// Returns 404 if the alert does not exist or belongs to a different user.
// Passes any errors to the Express error handler via next().
export const markAlertRead = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user!.id;
    const alertId = Number(req.params.id);

    if (isNaN(alertId)) {
      res
        .status(400)
        .json({ success: false, message: "Alert ID must be a valid number." });
      return;
    }

    const updatedAlert = await alertsService.markAlertRead(userId, alertId);
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
// Reads the authenticated user's id from req.user.
// Marks all unread alerts for that user as read in a single batch operation.
// Returns 200 with { success: true } on success.
// Passes any errors to the Express error handler via next().
export const markAllAlertsRead = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user!.id;
    await alertsService.markAllAlertsRead(userId);
    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
};

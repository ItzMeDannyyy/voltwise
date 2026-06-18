// Documentation only: Registers all HTTP routes for the alerts module.
// Maps alert list and mark-read endpoints to their controller functions.

import { Router } from "express";
import * as alertsController from "./alerts.controller.ts";

const alertsRouter = Router();

// GET /api/alerts — returns all alerts for the demo user, newest-first.
alertsRouter.get("/", alertsController.getAllAlerts);

// POST /api/alerts — creates a new alert (used by the in-app demo simulator).
alertsRouter.post("/", alertsController.createAlert);

// POST /api/alerts/read-all — marks every unread alert for the user as read.
// Defined BEFORE /:id routes to prevent "read-all" being parsed as an ID.
alertsRouter.post("/read-all", alertsController.markAllAlertsRead);

// PATCH /api/alerts/:id/read — marks a single alert as read.
alertsRouter.patch("/:id/read", alertsController.markAlertRead);

export default alertsRouter;

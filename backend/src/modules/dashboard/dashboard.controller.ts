// Documentation only: Controller layer for the dashboard module.
// Handles the HTTP request/response cycle for the dashboard endpoint.
// Reads the authenticated user's id from req.user, parses the period query
// parameter, delegates to the service, and returns a standardized JSON response.
// No business logic lives here.

import type { Request, Response, NextFunction } from "express";
import * as dashboardService from "./dashboard.service.ts";
import type { DashboardPeriod } from "./dashboard";

// The set of valid period values the mobile app is permitted to send.
const VALID_PERIODS: DashboardPeriod[] = ["Day", "Week", "Month"];

// Documentation only: Handles GET /api/dashboard?period=Day|Week|Month.
// Reads the authenticated user's id from req.user (set by requireAuth middleware).
// Reads the period query parameter (defaults to "Day" if absent).
// Validates the period value before delegating to the dashboard service.
// Returns 200 with { success: true, data: DashboardResponseDto } on success.
// Passes any errors to the Express error handler via next().
export const getDashboard = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user!.id;
    const rawPeriod = (req.query.period as string) ?? "Day";
    const period = rawPeriod as DashboardPeriod;

    if (!VALID_PERIODS.includes(period)) {
      res.status(400).json({
        success: false,
        message: `Invalid period value "${rawPeriod}". Must be one of: ${VALID_PERIODS.join(", ")}.`,
      });
      return;
    }

    const dashboardData = await dashboardService.getDashboardData(userId, period);
    res.status(200).json({ success: true, data: dashboardData });
  } catch (error) {
    next(error);
  }
};

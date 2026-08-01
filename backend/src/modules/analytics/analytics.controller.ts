// Documentation only: Controller layer for the analytics module.
// Handles the HTTP request/response cycle for the analytics endpoint.
// Reads the authenticated user's id from req.user (set by requireAuth middleware),
// parses the period query parameter, validates it, and delegates to the service.
// No business logic lives here.

import type { Request, Response, NextFunction } from "express";
import * as analyticsService from "./analytics.service.ts";
import type { AnalyticsPeriod } from "./analytics";

// The set of valid period values the mobile app is permitted to send.
const VALID_PERIODS: AnalyticsPeriod[] = ["Day", "Week", "Month"];

// Documentation only: Handles GET /api/analytics?period=Day|Week|Month.
// Reads the authenticated user's id from req.user (set by requireAuth middleware).
// Reads the period query parameter (defaults to "Month" if absent, since analytics
// is most meaningful over a billing cycle).
// Validates the period, then delegates to the analytics service.
// Returns 200 with { success: true, data: AnalyticsResponseDto } on success.
// Passes any errors to the Express error handler via next().
export const getAnalytics = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user!.id;
    const rawPeriod = (req.query.period as string) ?? "Month";
    const period = rawPeriod as AnalyticsPeriod;

    if (!VALID_PERIODS.includes(period)) {
      res.status(400).json({
        success: false,
        message: `Invalid period value "${rawPeriod}". Must be one of: ${VALID_PERIODS.join(", ")}.`,
      });
      return;
    }

    const analyticsData = await analyticsService.getAnalyticsData(userId, period);
    res.status(200).json({ success: true, data: analyticsData });
  } catch (error) {
    next(error);
  }
};

// Documentation only: Handles PUT /api/analytics/tariff.
// Validates that ratePerKwh is a positive number and optional currency is present.
// Delegates to the analytics service and returns the newly created tariff.
export const updateTariff = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { ratePerKwh, currency } = req.body;

    if (ratePerKwh === undefined || typeof ratePerKwh !== "number" || ratePerKwh <= 0) {
      res.status(400).json({
        success: false,
        message: "Invalid tariff rate. ratePerKwh is required and must be a positive number.",
      });
      return;
    }

    const updated = await analyticsService.updateTariff(userId, ratePerKwh, currency);
    res.status(200).json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};


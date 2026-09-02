// Documentation only: Controller layer for the analytics module.
// Handles the HTTP request/response cycle for the analytics endpoint.
// Reads the authenticated user's id from req.user (set by requireAuth middleware),
// parses the period query parameter, validates it, and delegates to the service.
// No business logic lives here.

import type { Request, Response, NextFunction } from "express";
import * as analyticsService from "./analytics.service.ts";
import { parseRangeQuery } from "../../lib/range.ts";

// Documentation only: Handles GET /api/analytics.
//
// Takes the same four range parameters as /api/dashboard — period, anchor,
// from, to — parsed by the shared resolver so the two endpoints can never
// disagree about what a range means. Defaults to "Month" when no period is
// given, since analytics is most meaningful over a billing-length window.
//
// Reads the authenticated user's id from req.user (set by requireAuth
// middleware). Validation lives in the resolver and surfaces as AppError(400).
// Returns 200 with { success: true, data: AnalyticsResponseDto } on success.
export const getAnalytics = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const range = parseRangeQuery(req.query, "Month");
    const analyticsData = await analyticsService.getAnalyticsData(req.user!.id, range);
    res.status(200).json({ success: true, data: analyticsData });
  } catch (error) {
    next(error);
  }
};

// Documentation only: Handles GET /api/analytics/tariff.
// Reads the authenticated user's id from req.user and returns the currently
// effective rate plan. Used by the mobile app's Units & Tariff settings screen.
export const getTariff = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const tariff = await analyticsService.getTariff(req.user!.id);
    res.status(200).json({ success: true, data: tariff });
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

    // The currency is a display symbol ("₱", "$"), not a code — reject anything
    // long enough to suggest the caller sent something else entirely, since it
    // is persisted verbatim and rendered in front of every cost figure.
    if (
      currency !== undefined &&
      (typeof currency !== "string" || currency.trim().length === 0 || currency.length > 4)
    ) {
      res.status(400).json({
        success: false,
        message: "Invalid currency. Expected a symbol of 1-4 characters.",
      });
      return;
    }

    const updated = await analyticsService.updateTariff(userId, ratePerKwh, currency);
    res.status(200).json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};


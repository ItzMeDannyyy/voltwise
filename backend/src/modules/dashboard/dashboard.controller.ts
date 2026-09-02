// Documentation only: Controller layer for the dashboard module.
// Handles the HTTP request/response cycle for the dashboard endpoint.
// Reads the authenticated user's id from req.user, parses the period query
// parameter, delegates to the service, and returns a standardized JSON response.
// No business logic lives here.

import type { Request, Response, NextFunction } from "express";
import * as dashboardService from "./dashboard.service.ts";
import { parseRangeQuery } from "../../lib/range.ts";

// Documentation only: Handles GET /api/dashboard.
//
// Query parameters:
//   period  Day | Week | Month | Cycle   (default Day)
//   anchor  YYYY-MM-DD — which day/week/month to show (default today)
//   from    YYYY-MM-DD — Cycle only, the billing window's first day
//   to      YYYY-MM-DD — Cycle only, its last day
//
// Reads the authenticated user's id from req.user (set by requireAuth
// middleware), resolves the query into a concrete range, and delegates. The
// resolver owns all validation and throws AppError(400) on bad input, which the
// global handler turns into a 400 — so there is one place that decides what a
// valid range is.
// Returns 200 with { success: true, data: DashboardResponseDto } on success.
export const getDashboard = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const range = parseRangeQuery(req.query, "Day");
    const dashboardData = await dashboardService.getDashboardData(req.user!.id, range);
    res.status(200).json({ success: true, data: dashboardData });
  } catch (error) {
    next(error);
  }
};

// Documentation only: Registers all HTTP routes for the analytics module.
// Maps the single analytics endpoint to its controller function.

import { Router } from "express";
import * as analyticsController from "./analytics.controller.ts";

const analyticsRouter = Router();

// GET /api/analytics?period=Day|Week|Month — returns analytics payload for the period.
analyticsRouter.get("/", analyticsController.getAnalytics);

// GET /api/analytics/tariff — returns the currently effective rate plan.
analyticsRouter.get("/tariff", analyticsController.getTariff);

// PUT /api/analytics/tariff — updates the user-defined localized utility tariff rate.
analyticsRouter.put("/tariff", analyticsController.updateTariff);

export default analyticsRouter;

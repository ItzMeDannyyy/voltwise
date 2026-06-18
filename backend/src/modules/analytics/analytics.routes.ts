// Documentation only: Registers all HTTP routes for the analytics module.
// Maps the single analytics endpoint to its controller function.

import { Router } from "express";
import * as analyticsController from "./analytics.controller.ts";

const analyticsRouter = Router();

// GET /api/analytics?period=Day|Week|Month — returns analytics payload for the period.
analyticsRouter.get("/", analyticsController.getAnalytics);

export default analyticsRouter;

// Documentation only: Registers all HTTP routes for the dashboard module.
// Maps the single dashboard endpoint to its controller function.

import { Router } from "express";
import * as dashboardController from "./dashboard.controller.ts";

const dashboardRouter = Router();

// GET /api/dashboard?period=Day|Week|Month — returns the full dashboard payload.
dashboardRouter.get("/", dashboardController.getDashboard);

export default dashboardRouter;

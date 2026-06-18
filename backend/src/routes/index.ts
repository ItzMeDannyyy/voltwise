// Documentation only: Aggregates all module routers into a single top-level Express Router.
// This file is the single source of truth for which modules exist and what path prefix each uses.
// Mount this router in index.ts under "/api" to expose all endpoints.

import { Router } from "express";
import authRouter from "../modules/auth/auth.routes.ts";
import devicesRouter from "../modules/devices/devices.routes.ts";
import dashboardRouter from "../modules/dashboard/dashboard.routes.ts";
import alertsRouter from "../modules/alerts/alerts.routes.ts";
import analyticsRouter from "../modules/analytics/analytics.routes.ts";

const appRouter = Router();

// Auth module — handles register and login.
appRouter.use("/auth", authRouter);

// Devices module — CRUD operations for smart devices.
appRouter.use("/devices", devicesRouter);

// Dashboard module — live summary for the home screen.
appRouter.use("/dashboard", dashboardRouter);

// Alerts module — energy and device alert management.
appRouter.use("/alerts", alertsRouter);

// Analytics module — billing prediction and kWh breakdown.
appRouter.use("/analytics", analyticsRouter);

export default appRouter;

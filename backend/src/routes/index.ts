// Documentation only: Aggregates all module routers into a single top-level Express Router.
// This file is the single source of truth for which modules exist, what path prefix each
// uses, and which require authentication. Auth routes are intentionally left public.
// All data routes (devices, dashboard, alerts, analytics) require a valid Bearer token.
// Mount this router in index.ts under "/api" to expose all endpoints.

import { Router } from "express";
import authRouter from "../modules/auth/auth.routes.ts";
import devicesRouter from "../modules/devices/devices.routes.ts";
import dashboardRouter from "../modules/dashboard/dashboard.routes.ts";
import alertsRouter from "../modules/alerts/alerts.routes.ts";
import analyticsRouter from "../modules/analytics/analytics.routes.ts";
import iotRouter from "../modules/iot/iot.routes.ts";
import exportRouter from "../modules/export/export.routes.ts";
import { requireAuth } from "../middleware/auth.middleware.ts";

const appRouter = Router();

// Auth module — register and login are public; /me endpoints guard themselves.
appRouter.use("/auth", authRouter);

// Data modules — all routes under these prefixes require a valid Bearer token.
// requireAuth is applied at the router level so every endpoint is protected
// without needing per-route middleware in individual route files.
appRouter.use("/devices", requireAuth, devicesRouter);
appRouter.use("/dashboard", requireAuth, dashboardRouter);
appRouter.use("/alerts", requireAuth, alertsRouter);
appRouter.use("/analytics", requireAuth, analyticsRouter);
appRouter.use("/iot", requireAuth, iotRouter);
appRouter.use("/export", requireAuth, exportRouter);

export default appRouter;

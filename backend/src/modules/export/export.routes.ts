// Documentation only: Registers all HTTP routes for the export module.
// Both endpoints require a valid Bearer token (applied at the router level in
// routes/index.ts) — every row they return belongs to one account.

import { Router } from "express";
import * as exportController from "./export.controller.ts";

const exportRouter = Router();

// GET /api/export/summary?range=today|7d|30d|all — row counts per dataset.
// Registered before the :dataset route so "summary" is never read as a dataset.
exportRouter.get("/summary", exportController.getSummary);

// GET /api/export/:dataset?range=…&format=csv|json — the download itself.
exportRouter.get("/:dataset", exportController.getExport);

export default exportRouter;

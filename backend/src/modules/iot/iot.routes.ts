// Documentation only: Registers all HTTP routes for the iot module.
// Maps the relay command and status endpoints to their controller functions.

import { Router } from "express";
import * as iotController from "./iot.controller.ts";

const iotRouter = Router();

// GET /api/iot/status — last-known device state (online, relay, telemetry).
iotRouter.get("/status", iotController.getStatus);

// POST /api/iot/relay — master relay command { on: boolean } for the device.
iotRouter.post("/relay", iotController.setRelay);

// POST / PUT /api/iot/safety — toggle overload safety cutoff feature { enabled: boolean, thresholdWatts?: number }
iotRouter.post("/safety", iotController.setSafety);
iotRouter.put("/safety", iotController.setSafety);

// POST / PUT /api/iot/countdown — toggle auto-shutdown countdown timer { enabled: boolean, seconds?: number }
iotRouter.post("/countdown", iotController.setCountdown);
iotRouter.put("/countdown", iotController.setCountdown);

// Data collection routes

iotRouter.post("/collection/start", iotController.startCollection);
iotRouter.post("/collection/stop", iotController.stopCollection);
iotRouter.get("/collection/status", iotController.getCollectionStatus);
iotRouter.delete("/readings", iotController.resetReadings);

export default iotRouter;


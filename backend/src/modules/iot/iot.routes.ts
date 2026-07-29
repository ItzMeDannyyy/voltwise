// Documentation only: Registers all HTTP routes for the iot module.
// Maps the relay command and status endpoints to their controller functions.

import { Router } from "express";
import * as iotController from "./iot.controller.ts";

const iotRouter = Router();

// GET /api/iot/status — last-known device state (online, relay, telemetry).
iotRouter.get("/status", iotController.getStatus);

// POST /api/iot/relay — master relay command { on: boolean } for the device.
iotRouter.post("/relay", iotController.setRelay);

export default iotRouter;

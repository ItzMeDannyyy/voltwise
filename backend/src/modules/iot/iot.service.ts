// Documentation only: Service layer for the iot module. Thin wrapper around
// the shared MQTT client in src/lib/mqtt.ts: publishes relay commands and
// shapes the last-known device state for the status endpoint. No Prisma access
// here — telemetry ingestion lives in lib/mqtt.ts itself.

import { getIotState, publishRelayCommand } from "../../lib/mqtt.ts";
import type { IotStatusDto } from "./iot";

// A retained "online" status can outlive a crashed device until the broker's
// last-will fires, so the device only counts as online when telemetry (sent
// every ~2 s) has arrived within this window.
const TELEMETRY_FRESH_MS = 15_000;

// Documentation only: Returns the last-known IoT state, with the online flag
// cross-checked against telemetry freshness.
export const getStatus = (): IotStatusDto => {
  const state = getIotState();

  const telemetryFresh =
    state.lastTelemetryAt !== null &&
    Date.now() - new Date(state.lastTelemetryAt).getTime() < TELEMETRY_FRESH_MS;

  return {
    online: state.deviceOnline && telemetryFresh,
    brokerConnected: state.brokerConnected,
    relay: state.relay,
    lastTelemetry: state.lastTelemetry,
    lastTelemetryAt: state.lastTelemetryAt,
  };
};

// Documentation only: Publishes a master relay on/off command to the device.
// Throws AppError 503 (from publishRelayCommand) when the broker is down.
// Returns the current status snapshot so the client can show pending state
// until the firmware confirms via the retained relay/state topic.
export const setRelay = (on: boolean): IotStatusDto => {
  publishRelayCommand(on);
  return getStatus();
};

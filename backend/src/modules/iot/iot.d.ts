// Documentation only: Type definitions for the iot module's request and
// response payloads. The relay is a single master switch (the physical
// 2-channel module is always driven together), so the command body is just
// an "on" boolean.

import type { RelayState, TelemetryPayload } from "../../lib/mqtt.ts";

// Body of POST /api/iot/relay.
export interface RelayCommandDto {
  on: boolean;
}

// Response of both POST /api/iot/relay and GET /api/iot/status.
export interface IotStatusDto {
  // The device UID this backend ingests from (MQTT_DEVICE_UID). The app pairs
  // itself independently, so it compares the two and warns on a mismatch.
  deviceUid: string;
  // True when the device is publishing telemetry (retained "online" alone is
  // not trusted — see the stale-retained guard in iot.service.ts).
  online: boolean;
  // Whether the backend itself is connected to the MQTT broker.
  brokerConnected: boolean;
  relay: RelayState | null;
  lastTelemetry: TelemetryPayload | null;
  lastTelemetryAt: string | null;
}

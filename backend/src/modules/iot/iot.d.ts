// Documentation only: Type definitions for the iot module's request and
// response payloads. The relay is a single master switch (the physical
// 2-channel module is always driven together), so the command body is just
// an "on" boolean.

import type { PowerLine, RelayState, TelemetryPayload } from "../../lib/mqtt.ts";

export type { PowerLine };

// Body of POST /api/iot/relay.
export interface RelayCommandDto {
  on: boolean;
  line?: PowerLine;
}

export interface StartCollectionDto {
  applianceName: string;
  line?: PowerLine;
  clearReadings?: boolean;
}

export interface CollectionSessionDto {
  applianceName: string;
  deviceId: number | null;
  startedAt: string;
  sampleCount: number;
}

export interface CollectionStartResponseDto {
  session: CollectionSessionDto;
  status: IotStatusDto;
  clearedReadingsCount: number;
}

export interface CollectionStopResponseDto {
  applianceName: string;
  durationSeconds: number;
  sampleCount: number;
  status: IotStatusDto;
}

export interface SafetyCommandDto {
  enabled: boolean;
  thresholdWatts?: number;
}

export interface SafetyConfigDto {
  enabled: boolean;
  thresholdWatts: number;
}

export interface CountdownCommandDto {
  enabled: boolean;
  seconds?: number;
}

export interface CountdownConfigDto {
  enabled: boolean;
  seconds: number;
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
  activeCollection?: CollectionSessionDto | null;
  safety?: SafetyConfigDto | null;
  countdown?: CountdownConfigDto | null;
}



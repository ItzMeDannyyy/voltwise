// Documentation only: MQTT client singleton for the IoT layer (HiveMQ Cloud).
// Connects over TLS (mqtts://) using credentials from .env, subscribes to the
// device's telemetry / relay-state / status topics, and ingests telemetry into
// the EnergyReading table as whole-home readings (deviceId = null) owned by
// the account named in MQTT_INGEST_USER_EMAIL. Also exposes the command path
// used by the iot module to publish relay on/off commands, plus an in-memory
// snapshot of the device's last-known state for GET /api/iot/status.

import mqtt, { type MqttClient } from "mqtt";
import { prisma } from "./prisma.ts";
import { AppError } from "./AppError.ts";
import { createLoadDetector } from "./loadDetector.ts";
import { createAlert } from "../modules/alerts/alerts.service.ts";

// Shape of a relay/state message published (retained) by the firmware.
export interface RelayState {
  on: boolean;
  reason: string; // "boot" | "remote" | "overpower" | "countdown"
  updatedAt: string;
}

// Numeric fields of a telemetry message. Keys mirror EnergyReading columns.
export interface TelemetryPayload {
  voltage?: number;
  current?: number;
  watts: number;
  kwh: number;
  frequency?: number;
  powerFactor?: number;
}

// Last-known device state, fed by retained status/relay messages + telemetry.
export interface IotState {
  // The UID this backend ingests from (MQTT_DEVICE_UID). Reported so the app
  // can tell the user when its own pairing points at a different board — the
  // dashboard would then show live readings that are never being stored.
  deviceUid: string;
  brokerConnected: boolean;
  deviceOnline: boolean;
  relay: RelayState | null;
  lastTelemetry: TelemetryPayload | null;
  lastTelemetryAt: string | null;
}

// deviceUid is resolved from env on every read rather than captured here, so
// the snapshot can never report a UID the topic helpers are no longer using.
const state: Omit<IotState, "deviceUid"> = {
  brokerConnected: false,
  deviceOnline: false,
  relay: null,
  lastTelemetry: null,
  lastTelemetryAt: null,
};

let client: MqttClient | null = null;

// Resolved once at startup; null means "no ingest user" and telemetry is only
// mirrored into the in-memory state, never written to the database.
let ingestUserId: number | null = null;

// Timestamp of the last EnergyReading insert, for the optional throttle.
let lastInsertAtMs = 0;

// Step-change detector for "a new appliance just switched on" suggestions.
// Thresholds are tunable via env; created lazily so tests (and a process that
// sets env late) always see the effective configuration.
let loadDetector: ReturnType<typeof createLoadDetector> | null = null;
const getLoadDetector = () => {
  if (!loadDetector) {
    loadDetector = createLoadDetector({
      deltaThresholdWatts: Number(process.env.LOAD_DETECT_DELTA_WATTS ?? 60),
      sustainSamples: Number(process.env.LOAD_DETECT_SUSTAIN_SAMPLES ?? 3),
      cooldownMs: Number(process.env.LOAD_DETECT_COOLDOWN_MS ?? 120_000),
    });
  }
  return loadDetector;
};

// Documentation only: Builds the topic string for this deployment's device.
// The UID must match DEVICE_UID in the firmware's secrets.h.
const deviceUid = (): string => process.env.MQTT_DEVICE_UID ?? "esp32-01";
const topic = (suffix: string): string => `voltwise/${deviceUid()}/${suffix}`;

// Documentation only: Looks up the account that owns ingested readings
// (MQTT_INGEST_USER_EMAIL, default demo@voltwise.app) and caches its id.
// Returns the id, or null (with a warning) when the account doesn't exist —
// ingestion is skipped in that case but the process keeps running.
export const resolveIngestUser = async (): Promise<number | null> => {
  const email = process.env.MQTT_INGEST_USER_EMAIL ?? "demo@voltwise.app";
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    console.warn(
      `MQTT ingest: no account found for "${email}" — telemetry will NOT be saved to the database. ` +
        `Run "npm run seed" or set MQTT_INGEST_USER_EMAIL to an existing account.`
    );
    ingestUserId = null;
    return null;
  }

  ingestUserId = user.id;
  console.log(`MQTT ingest: readings will be stored for ${email} (user #${user.id}).`);
  return user.id;
};

// Documentation only: Parses a raw number-ish value, returning undefined for
// anything that isn't a finite number (protects the DB from NaN/strings).
const asFiniteNumber = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

// Documentation only: Handles every incoming MQTT message. Exported separately
// from initMqtt so unit tests can drive it with fake topics/payloads without a
// real broker. Never throws — a malformed payload or DB hiccup must not crash
// the server, so failures are logged and swallowed.
export const handleMessage = async (
  incomingTopic: string,
  payload: Buffer
): Promise<void> => {
  try {
    if (incomingTopic === topic("status")) {
      state.deviceOnline = payload.toString() === "online";
      return;
    }

    if (incomingTopic === topic("relay/state")) {
      const parsed = JSON.parse(payload.toString()) as {
        on?: unknown;
        reason?: unknown;
      };
      if (typeof parsed.on !== "boolean") return;
      state.relay = {
        on: parsed.on,
        reason: typeof parsed.reason === "string" ? parsed.reason : "unknown",
        updatedAt: new Date().toISOString(),
      };
      return;
    }

    if (incomingTopic === topic("telemetry")) {
      const parsed = JSON.parse(payload.toString()) as Record<string, unknown>;

      const watts = asFiniteNumber(parsed.watts);
      const kwh = asFiniteNumber(parsed.kwh);
      if (watts === undefined || kwh === undefined) return;

      const telemetry: TelemetryPayload = {
        watts,
        kwh,
        voltage: asFiniteNumber(parsed.voltage),
        current: asFiniteNumber(parsed.current),
        frequency: asFiniteNumber(parsed.frequency),
        powerFactor: asFiniteNumber(parsed.powerFactor),
      };

      const now = new Date();
      state.lastTelemetry = telemetry;
      state.lastTelemetryAt = now.toISOString();
      // Telemetry arriving is the strongest liveness signal (a retained
      // "online" status can outlive a crashed device until its LWT fires).
      state.deviceOnline = true;

      // New-load detection runs on every message — before the ingest throttle,
      // which would otherwise starve the detector of samples.
      if (process.env.LOAD_DETECT_ENABLED !== "false") {
        const detection = getLoadDetector().sample(watts, now.getTime());
        if (detection) {
          // Fire-and-forget: a failed alert/publish must not break ingestion.
          void notifyNewLoad(detection.deltaWatts);
        }
      }

      if (ingestUserId === null) return;

      // Optional throttle: skip the insert when the previous one is too
      // recent. Default 0 = store every message (~2 s cadence).
      const minIntervalMs = Number(process.env.MQTT_INGEST_MIN_INTERVAL_MS ?? 0);
      if (minIntervalMs > 0 && now.getTime() - lastInsertAtMs < minIntervalMs) {
        return;
      }
      lastInsertAtMs = now.getTime();

      // deviceId null = whole-home aggregate reading (see EnergyReading dual-use).
      await prisma.energyReading.create({
        data: {
          userId: ingestUserId,
          deviceId: null,
          timestamp: now,
          watts: telemetry.watts,
          kwh: telemetry.kwh,
          voltage: telemetry.voltage ?? null,
          current: telemetry.current ?? null,
          frequency: telemetry.frequency ?? null,
          powerFactor: telemetry.powerFactor ?? null,
        },
      });
    }
  } catch (error) {
    console.error(`MQTT: failed to handle message on ${incomingTopic}:`, error);
  }
};

// Documentation only: Reacts to a detected new load: records an INFO alert for
// the ingest account (visible in the app's Alerts tab) and pushes a live
// "new_load" event over MQTT so the app can prompt "add this as a device?"
// immediately. Both halves are best-effort — errors are logged, never thrown.
const notifyNewLoad = async (deltaWatts: number): Promise<void> => {
  if (ingestUserId !== null) {
    try {
      await createAlert(ingestUserId, {
        type: "info",
        title: "New load detected",
        description: `Whole-home power jumped by ~${deltaWatts} W — did you plug in a new appliance?`,
        recommendation:
          "If this is a new device, add it in the Devices tab to track its usage.",
        value: deltaWatts,
      });
    } catch (error) {
      console.error("MQTT: failed to create new-load alert:", error);
    }
  }

  publishEvent({ type: "new_load", deltaWatts, at: new Date().toISOString() });
};

// Documentation only: Publishes a backend-originated event (e.g. new_load) to
// the device's events topic for live in-app prompts. Non-retained; silently
// no-ops when the broker is unavailable — events are ephemeral by design.
export const publishEvent = (payload: Record<string, unknown>): void => {
  if (!client || !client.connected) return;
  client.publish(topic("events"), JSON.stringify(payload), { qos: 1 });
};

// Documentation only: Connects the singleton client to HiveMQ Cloud and wires
// up subscriptions + the message handler. Called once from index.ts after the
// HTTP server starts. Missing configuration disables the IoT layer with a
// warning instead of crashing (the REST API still works without it).
export const initMqtt = async (): Promise<void> => {
  const host = process.env.MQTT_HOST;
  const username = process.env.MQTT_USERNAME;
  const password = process.env.MQTT_PASSWORD;

  if (!host || !username || !password) {
    console.warn(
      "MQTT: MQTT_HOST / MQTT_USERNAME / MQTT_PASSWORD not set — IoT layer disabled."
    );
    return;
  }

  try {
    await resolveIngestUser();
  } catch (error) {
    // A DB hiccup at boot must not take the whole server down — telemetry
    // still flows to the app; only persistence is disabled.
    console.warn("MQTT ingest: could not resolve ingest user:", error);
  }

  const port = process.env.MQTT_PORT ?? "8883";
  const url = `mqtts://${host}:${port}`;

  client = mqtt.connect(url, {
    username,
    password,
    clientId: `voltwise-backend-${Math.random().toString(16).slice(2, 8)}`,
    reconnectPeriod: 5000,
    connectTimeout: 10000,
  });

  client.on("connect", () => {
    state.brokerConnected = true;
    console.log(`MQTT: connected to ${url}`);
    client!.subscribe(
      [topic("telemetry"), topic("relay/state"), topic("status")],
      { qos: 1 },
      (error) => {
        if (error) console.error("MQTT: subscribe failed:", error);
      }
    );
  });

  client.on("message", (incomingTopic, payload) => {
    void handleMessage(incomingTopic, payload);
  });

  client.on("close", () => {
    state.brokerConnected = false;
  });

  client.on("error", (error) => {
    console.error("MQTT: connection error:", error.message);
  });
};

// Documentation only: Publishes a relay command ({ on: true|false }) to the
// device's relay/set topic at QoS 1. Throws AppError 503 when the broker
// connection is down so the controller can report a meaningful failure.
export const publishRelayCommand = (on: boolean): void => {
  if (!client || !client.connected) {
    throw new AppError(503, "IoT broker connection is not available.");
  }

  client.publish(topic("relay/set"), JSON.stringify({ on }), { qos: 1 });
};

// Documentation only: Returns a snapshot of the last-known IoT state for the
// status endpoint. Copied so callers can't mutate module state.
export const getIotState = (): IotState => ({ deviceUid: deviceUid(), ...state });

// Documentation only: Cleanly disconnects the MQTT client on shutdown.
export const closeMqtt = (): void => {
  if (client) {
    client.end(true);
    client = null;
    state.brokerConnected = false;
  }
};

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
// Metro resolves this to mqtt's precompiled browser bundle (the package's
// "react-native" field points at dist/mqtt.esm.js), which talks over the
// global WebSocket that React Native provides — no Node polyfills needed.
import mqtt from "mqtt";

/**
 * Live IoT layer: subscribes directly to the HiveMQ Cloud broker over secure
 * WebSocket (wss://...:8884/mqtt) for real-time telemetry and relay state.
 *
 * Read-only by design: relay COMMANDS go through the backend REST API
 * (POST /api/iot/relay) so they stay JWT-authenticated — the app's broker
 * credentials are only used to listen. Consider a second, subscribe-only
 * HiveMQ credential for the app since env values ship in the JS bundle.
 *
 * Topic contract (shared with iot-voltwise firmware and backend):
 *   voltwise/<uid>/telemetry    — PZEM reading JSON every ~2 s
 *   voltwise/<uid>/relay/state  — retained { on, reason }
 *   voltwise/<uid>/status       — retained "online"/"offline" (LWT)
 */

/** One PZEM telemetry message. Keys mirror the backend's EnergyReading columns. */
export interface MqttTelemetry {
  voltage?: number;
  current?: number;
  watts: number;
  kwh: number;
  frequency?: number;
  powerFactor?: number;
}

/** Retained relay state published by the firmware after every change. */
export interface MqttRelayState {
  on: boolean;
  /** "boot" | "remote" | "overpower" | "countdown" */
  reason: string;
}

/**
 * Backend-originated event (e.g. "new_load" when the load detector spots a
 * sustained watts step-up). Non-retained — only live listeners see it.
 */
export interface MqttEvent {
  type: string;
  /** Size of the detected power jump, for new_load events. */
  deltaWatts?: number;
  /** Date.now() when the event arrived — consumers de-dupe on this. */
  receivedAt: number;
}

interface MqttContextValue {
  /** True while the app itself is connected to the broker. */
  connected: boolean;
  /** Latest telemetry message, or null before the first one arrives. */
  telemetry: MqttTelemetry | null;
  /** Date.now() when the latest telemetry arrived (UI checks freshness). */
  telemetryAt: number | null;
  /** Last-known relay state from the retained relay/state topic. */
  relayState: MqttRelayState | null;
  /** From the retained status topic — cross-check with telemetryAt freshness. */
  deviceOnline: boolean;
  /** Latest backend event (new_load etc.), or null before the first one. */
  lastEvent: MqttEvent | null;
}

const MQTT_URL = process.env.EXPO_PUBLIC_MQTT_URL;
const MQTT_USERNAME = process.env.EXPO_PUBLIC_MQTT_USERNAME;
const MQTT_PASSWORD = process.env.EXPO_PUBLIC_MQTT_PASSWORD;
const DEVICE_UID = process.env.EXPO_PUBLIC_MQTT_DEVICE_UID ?? "esp32-01";

const TOPIC_TELEMETRY = `voltwise/${DEVICE_UID}/telemetry`;
const TOPIC_RELAY_STATE = `voltwise/${DEVICE_UID}/relay/state`;
const TOPIC_STATUS = `voltwise/${DEVICE_UID}/status`;
const TOPIC_EVENTS = `voltwise/${DEVICE_UID}/events`;

const MqttContext = createContext<MqttContextValue>({
  connected: false,
  telemetry: null,
  telemetryAt: null,
  relayState: null,
  deviceOnline: false,
  lastEvent: null,
});

function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function MqttProvider({ children }: { children: ReactNode }) {
  const [connected, setConnected] = useState(false);
  const [telemetry, setTelemetry] = useState<MqttTelemetry | null>(null);
  const [telemetryAt, setTelemetryAt] = useState<number | null>(null);
  const [relayState, setRelayState] = useState<MqttRelayState | null>(null);
  const [deviceOnline, setDeviceOnline] = useState(false);
  const [lastEvent, setLastEvent] = useState<MqttEvent | null>(null);

  useEffect(() => {
    // Without broker config the provider is inert and the app stays fully
    // functional on its offline-first fallbacks.
    if (!MQTT_URL || !MQTT_USERNAME || !MQTT_PASSWORD) {
      console.log("[VoltWise] MQTT disabled — EXPO_PUBLIC_MQTT_* not set.");
      return;
    }

    console.log("[VoltWise] MQTT connecting to", MQTT_URL);
    const client = mqtt.connect(MQTT_URL, {
      username: MQTT_USERNAME,
      password: MQTT_PASSWORD,
      clientId: `voltwise-app-${Math.random().toString(16).slice(2, 8)}`,
      reconnectPeriod: 5000,
      connectTimeout: 10000,
      keepalive: 30,
    });

    client.on("connect", () => {
      setConnected(true);
      client.subscribe(
        [TOPIC_TELEMETRY, TOPIC_RELAY_STATE, TOPIC_STATUS, TOPIC_EVENTS],
        { qos: 1 }
      );
    });

    client.on("close", () => setConnected(false));

    client.on("error", (error) => {
      console.log("[VoltWise] MQTT error:", error.message);
    });

    client.on("message", (topic, payload) => {
      try {
        if (topic === TOPIC_STATUS) {
          setDeviceOnline(payload.toString() === "online");
          return;
        }

        if (topic === TOPIC_RELAY_STATE) {
          const parsed = JSON.parse(payload.toString());
          if (typeof parsed.on !== "boolean") return;
          setRelayState({
            on: parsed.on,
            reason: typeof parsed.reason === "string" ? parsed.reason : "unknown",
          });
          return;
        }

        if (topic === TOPIC_EVENTS) {
          const parsed = JSON.parse(payload.toString());
          if (typeof parsed.type !== "string") return;
          setLastEvent({
            type: parsed.type,
            deltaWatts: asFiniteNumber(parsed.deltaWatts),
            receivedAt: Date.now(),
          });
          return;
        }

        if (topic === TOPIC_TELEMETRY) {
          const parsed = JSON.parse(payload.toString());
          const watts = asFiniteNumber(parsed.watts);
          const kwh = asFiniteNumber(parsed.kwh);
          if (watts === undefined || kwh === undefined) return;

          setTelemetry({
            watts,
            kwh,
            voltage: asFiniteNumber(parsed.voltage),
            current: asFiniteNumber(parsed.current),
            frequency: asFiniteNumber(parsed.frequency),
            powerFactor: asFiniteNumber(parsed.powerFactor),
          });
          setTelemetryAt(Date.now());
          // Telemetry flowing is the strongest liveness signal (a retained
          // "online" can outlive a crashed device until its LWT fires).
          setDeviceOnline(true);
        }
      } catch {
        // Malformed payloads are ignored — never crash the UI over them.
      }
    });

    return () => {
      client.end(true);
    };
  }, []);

  return (
    <MqttContext.Provider
      value={{ connected, telemetry, telemetryAt, relayState, deviceOnline, lastEvent }}
    >
      {children}
    </MqttContext.Provider>
  );
}

export function useMqtt() {
  return useContext(MqttContext);
}

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
// Metro resolves this to mqtt's precompiled browser bundle (the package's
// "react-native" field points at dist/mqtt.esm.js), which talks over the
// global WebSocket that React Native provides — no Node polyfills needed.
import mqtt, { type MqttClient } from "mqtt";
import {
  DEFAULT_DEVICE_UID,
  DISCOVERY_TOPIC,
  deviceTopics,
  parseTopic,
} from "../lib/iot-prefs";
import { getStoredDeviceUid, saveDeviceUid } from "../lib/iot-storage";

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
 *
 * The <uid> is not fixed to the build: Settings → Sensor & IoT can re-pair the
 * app to another board, so the device subscription is torn down and rebuilt
 * whenever the pairing changes. A second, permanent subscription to
 * voltwise/+/status feeds the pairing screen's scan — retained statuses make
 * that a passive discovery with no protocol of its own.
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

/** A sensor seen on the broker, from its retained status message. */
export interface DiscoveredSensor {
  uid: string;
  online: boolean;
  /** Date.now() of the last status or telemetry message from this uid. */
  lastSeenAt: number;
}

interface MqttContextValue {
  /** True while the app itself is connected to the broker. */
  connected: boolean;
  /** False when no EXPO_PUBLIC_MQTT_* credentials were built in. */
  configured: boolean;
  /** Last broker error message, cleared on a successful connect. */
  lastError: string | null;
  /** Broker URL as configured — host only is safe to display. */
  brokerUrl: string | null;

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

  /** UID of the sensor this install is paired with. */
  deviceUid: string;
  /** False until the stored pairing has been read back. */
  uidReady: boolean;
  /** True when the pairing differs from the UID compiled into the build. */
  isCustomUid: boolean;
  /** Re-pair to another sensor; persists and resubscribes. */
  setDeviceUid: (uid: string) => Promise<void>;
  /** Every sensor seen on the broker, newest status first. */
  discovered: DiscoveredSensor[];
  /** Tear down and rebuild the broker connection (the screen's Reconnect). */
  reconnect: () => void;
}

const MQTT_URL = process.env.EXPO_PUBLIC_MQTT_URL;
const MQTT_USERNAME = process.env.EXPO_PUBLIC_MQTT_USERNAME;
const MQTT_PASSWORD = process.env.EXPO_PUBLIC_MQTT_PASSWORD;

const CONFIGURED = Boolean(MQTT_URL && MQTT_USERNAME && MQTT_PASSWORD);

const MqttContext = createContext<MqttContextValue>({
  connected: false,
  configured: CONFIGURED,
  lastError: null,
  brokerUrl: MQTT_URL ?? null,
  telemetry: null,
  telemetryAt: null,
  relayState: null,
  deviceOnline: false,
  lastEvent: null,
  deviceUid: DEFAULT_DEVICE_UID,
  uidReady: false,
  isCustomUid: false,
  setDeviceUid: async () => {},
  discovered: [],
  reconnect: () => {},
});

function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function MqttProvider({ children }: { children: ReactNode }) {
  const [connected, setConnected] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [telemetry, setTelemetry] = useState<MqttTelemetry | null>(null);
  const [telemetryAt, setTelemetryAt] = useState<number | null>(null);
  const [relayState, setRelayState] = useState<MqttRelayState | null>(null);
  const [deviceOnline, setDeviceOnline] = useState(false);
  const [lastEvent, setLastEvent] = useState<MqttEvent | null>(null);
  const [discoveredMap, setDiscoveredMap] = useState<Record<string, DiscoveredSensor>>({});

  const [deviceUid, setDeviceUidState] = useState(DEFAULT_DEVICE_UID);
  const [uidReady, setUidReady] = useState(false);
  /** Bumping this rebuilds the client — the Reconnect action. */
  const [connectNonce, setConnectNonce] = useState(0);

  const clientRef = useRef<MqttClient | null>(null);
  /**
   * The message handler is installed once per connection but has to filter on
   * the *current* pairing, so it reads the uid from a ref that is written
   * synchronously alongside the state — waiting for a render to commit would
   * let a message from the previous sensor through.
   */
  const deviceUidRef = useRef(deviceUid);

  // ---- Hydrate the pairing before connecting ----

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = await getStoredDeviceUid();
      if (cancelled) return;
      if (stored) {
        deviceUidRef.current = stored;
        setDeviceUidState(stored);
      }
      // Connecting is gated on this flag so the first subscription is already
      // the right one — otherwise the screen briefly shows the default board's
      // retained relay state as if it were the paired sensor's.
      setUidReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ---- Broker connection ----

  useEffect(() => {
    if (!uidReady) return;

    // Without broker config the provider is inert and the app stays fully
    // functional on its offline-first fallbacks.
    if (!CONFIGURED) {
      console.log("[VoltWise] MQTT disabled — EXPO_PUBLIC_MQTT_* not set.");
      return;
    }

    console.log("[VoltWise] MQTT connecting to", MQTT_URL);
    const client = mqtt.connect(MQTT_URL!, {
      username: MQTT_USERNAME,
      password: MQTT_PASSWORD,
      clientId: `voltwise-app-${Math.random().toString(16).slice(2, 8)}`,
      reconnectPeriod: 5000,
      connectTimeout: 10000,
      keepalive: 30,
    });
    clientRef.current = client;

    client.on("connect", () => {
      setConnected(true);
      setLastError(null);
      // Discovery is independent of the pairing, so it lives here and stays up
      // for the life of the connection; the device topics are handled by the
      // effect below, which also runs on every re-pair.
      client.subscribe(DISCOVERY_TOPIC, { qos: 1 });
    });

    client.on("close", () => setConnected(false));

    client.on("error", (error) => {
      console.log("[VoltWise] MQTT error:", error.message);
      setLastError(error.message);
    });

    client.on("message", (topic, payload) => {
      try {
        const parts = parseTopic(topic);
        if (!parts) return;
        const { uid, suffix } = parts;

        if (suffix === "status") {
          const online = payload.toString() === "online";
          // Every board's status feeds the pairing scan, including boards we
          // are not subscribed to in any other way.
          setDiscoveredMap((prev) => ({
            ...prev,
            [uid]: { uid, online, lastSeenAt: Date.now() },
          }));
          if (uid === deviceUidRef.current) setDeviceOnline(online);
          return;
        }

        // Past this point only the paired sensor is of interest.
        if (uid !== deviceUidRef.current) return;

        if (suffix === "relay/state") {
          const parsed = JSON.parse(payload.toString());
          if (typeof parsed.on !== "boolean") return;
          setRelayState({
            on: parsed.on,
            reason: typeof parsed.reason === "string" ? parsed.reason : "unknown",
          });
          return;
        }

        if (suffix === "events") {
          const parsed = JSON.parse(payload.toString());
          if (typeof parsed.type !== "string") return;
          setLastEvent({
            type: parsed.type,
            deltaWatts: asFiniteNumber(parsed.deltaWatts),
            receivedAt: Date.now(),
          });
          return;
        }

        if (suffix === "telemetry") {
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
          const now = Date.now();
          setTelemetryAt(now);
          // Telemetry flowing is the strongest liveness signal (a retained
          // "online" can outlive a crashed device until its LWT fires).
          setDeviceOnline(true);
          setDiscoveredMap((prev) => ({
            ...prev,
            [uid]: { uid, online: true, lastSeenAt: now },
          }));
        }
      } catch {
        // Malformed payloads are ignored — never crash the UI over them.
      }
    });

    return () => {
      clientRef.current = null;
      client.end(true);
      setConnected(false);
    };
  }, [uidReady, connectNonce]);

  // ---- Per-pairing subscription ----

  useEffect(() => {
    const client = clientRef.current;
    if (!client || !connected) return;

    const topics = deviceTopics(deviceUid);
    const subscribed = [topics.telemetry, topics.relayState, topics.status, topics.events];
    client.subscribe(subscribed, { qos: 1 });

    return () => {
      // Unsubscribing on a dead socket would throw; the broker drops the
      // subscriptions with the session anyway.
      if (client.connected) client.unsubscribe(subscribed);
    };
  }, [deviceUid, connected]);

  // ---- Re-pairing ----

  const setDeviceUid = useCallback(async (uid: string) => {
    if (uid === deviceUidRef.current) return;
    deviceUidRef.current = uid;
    setDeviceUidState(uid);
    // Readings, relay state and liveness all belong to the *previous* sensor.
    // Keeping any of them would attribute one board's power to another until
    // the new one happens to publish.
    setTelemetry(null);
    setTelemetryAt(null);
    setRelayState(null);
    setDeviceOnline(false);
    setLastEvent(null);
    await saveDeviceUid(uid).catch(() => {});
  }, []);

  const reconnect = useCallback(() => setConnectNonce((n) => n + 1), []);

  const discovered = useMemo(
    () =>
      Object.values(discoveredMap).sort(
        (a, b) => Number(b.online) - Number(a.online) || a.uid.localeCompare(b.uid)
      ),
    [discoveredMap]
  );

  const value = useMemo<MqttContextValue>(
    () => ({
      connected,
      configured: CONFIGURED,
      lastError,
      brokerUrl: MQTT_URL ?? null,
      telemetry,
      telemetryAt,
      relayState,
      deviceOnline,
      lastEvent,
      deviceUid,
      uidReady,
      isCustomUid: deviceUid !== DEFAULT_DEVICE_UID,
      setDeviceUid,
      discovered,
      reconnect,
    }),
    [
      connected,
      lastError,
      telemetry,
      telemetryAt,
      relayState,
      deviceOnline,
      lastEvent,
      deviceUid,
      uidReady,
      setDeviceUid,
      discovered,
      reconnect,
    ]
  );

  return <MqttContext.Provider value={value}>{children}</MqttContext.Provider>;
}

export function useMqtt() {
  return useContext(MqttContext);
}

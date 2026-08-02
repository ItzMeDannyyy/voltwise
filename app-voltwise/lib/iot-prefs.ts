/**
 * The rules of the sensor/IoT layer: which ESP32 this device is paired with,
 * and how alive the link to it is.
 *
 * Deliberately pure — no React, no Expo, no storage — because three surfaces
 * (the MQTT provider, the Sensor & IoT screen and the dashboard's Master Power
 * card) all have to agree on when a sensor counts as "live", and because a
 * device UID becomes part of an MQTT topic, so validating it is a correctness
 * concern rather than a cosmetic one.
 */

/**
 * The UID compiled into the build. The pairing screen can override it per
 * install, which is the only way to point the app at a second ESP32 (or at a
 * classmate's board during a demo) without a rebuild.
 */
export const DEFAULT_DEVICE_UID = process.env.EXPO_PUBLIC_MQTT_DEVICE_UID ?? "esp32-01";

export const MAX_DEVICE_UID_LENGTH = 64;

/**
 * A UID is interpolated straight into `voltwise/<uid>/telemetry`, so the
 * alphabet has to exclude the characters that would re-shape the topic: "/"
 * would invent a level, and "+" or "#" would silently turn a subscription into
 * a wildcard across every other board on the broker. Restricting the input is
 * far cheaper than trying to detect the damage afterwards.
 */
const DEVICE_UID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

export const DEVICE_UID_HINT =
  "Letters, numbers, dot, dash, colon or underscore — the same DEVICE_UID the firmware publishes under.";

export function isValidDeviceUid(uid: string): boolean {
  return (
    uid.length > 0 &&
    uid.length <= MAX_DEVICE_UID_LENGTH &&
    DEVICE_UID_PATTERN.test(uid)
  );
}

/** Trims user input and validates it. Null means "not a usable UID". */
export function normalizeDeviceUid(raw: string): string | null {
  const trimmed = raw.trim();
  return isValidDeviceUid(trimmed) ? trimmed : null;
}

// ---- Topics ----

export interface DeviceTopics {
  telemetry: string;
  relayState: string;
  relaySet: string;
  status: string;
  events: string;
}

/** The per-device topic contract, shared with the firmware and the backend. */
export function deviceTopics(uid: string): DeviceTopics {
  const base = `voltwise/${uid}`;
  return {
    telemetry: `${base}/telemetry`,
    relayState: `${base}/relay/state`,
    relaySet: `${base}/relay/set`,
    status: `${base}/status`,
    events: `${base}/events`,
  };
}

/**
 * Every sensor's retained status in one subscription — this is what makes the
 * pairing scan possible. Retained messages are delivered the moment the
 * subscription lands, so a board that has ever connected shows up immediately
 * without any request/response discovery protocol.
 */
export const DISCOVERY_TOPIC = "voltwise/+/status";

/** Splits `voltwise/<uid>/<suffix>`. Null for anything off-contract. */
export function parseTopic(topic: string): { uid: string; suffix: string } | null {
  const parts = topic.split("/");
  if (parts.length < 3 || parts[0] !== "voltwise" || !parts[1]) return null;
  return { uid: parts[1], suffix: parts.slice(2).join("/") };
}

// ---- Link health ----

/**
 * The firmware publishes telemetry every ~2 s, so silence longer than this
 * means the stream has stopped — whatever the broker's retained status claims.
 * Matches the app-side window documented for the dashboard (the backend uses a
 * slightly laxer 15 s because it also has to survive its own event loop).
 */
export const TELEMETRY_FRESH_MS = 10_000;

/**
 * "stale" is the interesting state and the reason this is an enum rather than a
 * boolean: a crashed ESP32 leaves a retained "online" behind until the broker
 * notices the dead socket, so believing either the status topic or the data
 * stream alone gives the user a confidently wrong answer.
 */
export type LinkHealth = "live" | "stale" | "offline" | "disconnected" | "unconfigured";

export interface LinkInput {
  /** Whether broker credentials were compiled into the build at all. */
  configured: boolean;
  /** Whether this app currently holds a broker connection. */
  appConnected: boolean;
  /** The sensor's retained/implied status on the broker. */
  deviceOnline: boolean;
  /** Date.now() of the newest telemetry message, or null if none yet. */
  telemetryAt: number | null;
  now: number;
}

export function linkHealth({
  configured,
  appConnected,
  deviceOnline,
  telemetryAt,
  now,
}: LinkInput): LinkHealth {
  if (!configured) return "unconfigured";
  if (!appConnected) return "disconnected";
  if (telemetryAt !== null && now - telemetryAt <= TELEMETRY_FRESH_MS) return "live";
  if (deviceOnline) return "stale";
  return "offline";
}

export const LINK_LABELS: Record<LinkHealth, string> = {
  live: "Live",
  stale: "No data",
  offline: "Offline",
  disconnected: "No broker",
  unconfigured: "Not set up",
};

export const LINK_DESCRIPTIONS: Record<LinkHealth, string> = {
  live: "Readings are streaming from the sensor right now.",
  stale:
    "The broker still lists this sensor, but no readings are arriving. Check that the board is powered and within Wi-Fi range.",
  offline:
    "The broker has not heard from this sensor. It is powered down, off the network, or publishing under a different ID.",
  disconnected:
    "This app is not connected to the MQTT broker. Live telemetry resumes automatically once the connection is back.",
  unconfigured:
    "No broker credentials are built into this app, so live telemetry is turned off. Everything else keeps running on data from the server.",
};

// ---- Formatting ----

/** "just now" / "8s ago" / "4m ago" — for last-seen timestamps. */
export function formatAge(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "unknown";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 3) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** Human explanations for the firmware's relay/state reason codes. */
export const RELAY_REASON_LABELS: Record<string, string> = {
  boot: "On since the device started",
  remote: "Switched from the app",
  overpower: "Safety cutoff — power limit exceeded",
  countdown: "Auto shutdown countdown finished",
};

/**
 * Host:port of a broker URL for the diagnostics card. Credentials live in
 * separate connect options and are never part of this string, but the parse is
 * written to drop anything after the authority anyway.
 */
export function brokerLabel(url: string | undefined | null): string | null {
  if (!url) return null;
  const match = /^[a-z][a-z0-9+.-]*:\/\/(?:[^@/]*@)?([^/?#]+)/i.exec(url);
  return match ? match[1] : null;
}

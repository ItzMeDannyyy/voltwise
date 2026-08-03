import Constants from "expo-constants";
import { Platform } from "react-native";

/**
 * What the About screen is allowed to claim: the identity of the app, the four
 * tiers behind it, the open-source work it stands on, and the handful of facts
 * a support conversation actually needs.
 *
 * The describe/format half is written against a plain `BuildSource` rather than
 * against expo-constants directly, so the awkward cases — Expo Go versus a
 * standalone build, a browser with no OS version, a version string the manifest
 * never delivered — can be reasoned about without a device in hand. Only
 * `readBuildSource()` touches the platform.
 *
 * Two rules this module keeps:
 *  - Nothing here is invented. Licenses were read off the installed packages,
 *    and a fact that cannot be determined at runtime says so instead of
 *    guessing.
 *  - The diagnostics text carries endpoints, never credentials. The broker host
 *    is passed in already stripped (see `brokerLabel` in lib/iot-prefs.ts), and
 *    no token, password or account detail belongs in something people paste
 *    into a bug report.
 */

// ---- Identity ----

export const APP_NAME = "VoltWise";
export const APP_TAGLINE = "Smart energy tracking & monitoring";

export const APP_SUMMARY =
  "VoltWise watches the electricity going into your home, turns it into readings you can act on — live power, daily kWh, a running bill estimate and alerts when something is off — and lets you cut the mains from your phone when it is not.";

/** The project's public home. Used for the source and issue links. */
export const PROJECT_URL = "https://github.com/Danyxtu/voltwise";
export const ISSUES_URL = `${PROJECT_URL}/issues`;

export const PROJECT_CONTEXT =
  "Built as a capstone project — a working system rather than a product, developed in the open.";

/**
 * Stated plainly because the app switches a relay on live mains. It is a
 * monitoring aid built by students, not certified electrical safety equipment,
 * and nobody should learn that from the small print of a manual that does not
 * exist.
 */
export const SAFETY_NOTICE =
  "VoltWise is a monitoring aid, not certified electrical safety equipment. The sensor's own over-power cutoff is the last line of defence — never rely on this app in place of a breaker.";

// ---- The four tiers ----

export type LayerId = "app" | "server" | "sensor" | "ml";

export interface ProjectLayer {
  id: LayerId;
  title: string;
  description: string;
}

export const PROJECT_LAYERS: ProjectLayer[] = [
  {
    id: "app",
    title: "This app",
    description: "Expo + React Native. Reads from the server, listens to the sensor directly.",
  },
  {
    id: "server",
    title: "Server",
    description: "Express and PostgreSQL. Stores every reading, device, alert and account.",
  },
  {
    id: "sensor",
    title: "Sensor",
    description: "An ESP32 with a PZEM-004T meter and a relay, reporting over MQTT.",
  },
  {
    id: "ml",
    title: "Appliance detection",
    description: "A KMeans service for recognising loads. Designed and trained, not yet connected.",
  },
];

// ---- Open source ----

export interface OpenSourceComponent {
  name: string;
  role: string;
  license: string;
}

export interface OpenSourceGroup {
  id: LayerId;
  title: string;
  components: OpenSourceComponent[];
}

/**
 * Deliberately unversioned. A version pinned in this list goes stale the next
 * time someone runs `npm install`, and a stale licence notice is worse than a
 * general one — the licences themselves are what the notice is for.
 */
export const OPEN_SOURCE: OpenSourceGroup[] = [
  {
    id: "app",
    title: "In this app",
    components: [
      { name: "React & React Native", role: "The app itself", license: "MIT" },
      { name: "Expo & Expo Router", role: "Runtime and navigation", license: "MIT" },
      { name: "MQTT.js", role: "Live sensor telemetry", license: "MIT" },
      { name: "react-native-chart-kit", role: "Dashboard and analytics charts", license: "MIT" },
      { name: "react-native-svg", role: "Chart rendering", license: "MIT" },
      { name: "Reanimated & Gesture Handler", role: "Pull-to-refresh and motion", license: "MIT" },
      { name: "Ionicons", role: "Iconography", license: "MIT" },
    ],
  },
  {
    id: "server",
    title: "On the server",
    components: [
      { name: "Express", role: "HTTP API", license: "MIT" },
      { name: "Prisma", role: "Database access and migrations", license: "Apache-2.0" },
      { name: "PostgreSQL & node-postgres", role: "Storage", license: "PostgreSQL / MIT" },
      { name: "jsonwebtoken", role: "Sign-in tokens", license: "MIT" },
      { name: "bcryptjs", role: "Password hashing", license: "BSD-3-Clause" },
    ],
  },
  {
    id: "sensor",
    title: "On the sensor",
    components: [
      { name: "Arduino core for ESP32", role: "Firmware framework", license: "LGPL-2.1" },
      { name: "PZEM-004T-v30", role: "Reading the power meter", license: "MIT" },
      { name: "PubSubClient", role: "MQTT on the board", license: "MIT" },
      { name: "ArduinoJson", role: "Telemetry payloads", license: "MIT" },
    ],
  },
  {
    id: "ml",
    title: "In the model service",
    components: [
      { name: "FastAPI & Uvicorn", role: "Model serving", license: "MIT / BSD-3-Clause" },
      { name: "scikit-learn", role: "KMeans clustering", license: "BSD-3-Clause" },
      { name: "pandas & NumPy", role: "Feature engineering", license: "BSD-3-Clause" },
    ],
  },
];

// ---- This build ----

/** The raw platform facts, kept separate so the formatting below stays testable. */
export interface BuildSource {
  /** app.json's "version", as delivered to the running app. */
  version: string | null;
  /** Platform.OS */
  os: string;
  /** Platform.Version — an API level on Android, a version string on iOS. */
  osVersion: string | number | null;
  /** Constants.executionEnvironment */
  executionEnvironment: string;
  /** Constants.deviceName — the owner's own name for the device, where exposed. */
  deviceName: string | null;
  /** __DEV__ */
  dev: boolean;
}

export interface BuildFacts {
  version: string;
  /** Ready to display: "Version 1.0.0", or an honest stand-in. */
  versionLine: string;
  /** "Development" or "Release". */
  mode: string;
  /** "Expo Go", "Standalone build", "Web browser"… */
  runtime: string;
  /** "Android (API 34)", "iOS 17.4", "Web". */
  platform: string;
  deviceName: string | null;
}

const UNKNOWN_VERSION = "unknown";

/**
 * Expo Go and a build of your own are meaningfully different things to be
 * running — a bug that only reproduces in one of them is a different bug — so
 * the runtime is named rather than reduced to "native".
 */
function describeRuntime(os: string, executionEnvironment: string): string {
  if (os === "web") return "Web browser";
  switch (executionEnvironment) {
    case "storeClient":
      return "Expo Go";
    case "standalone":
      return "Standalone build";
    case "bare":
      return "Development build";
    default:
      return "Unknown runtime";
  }
}

/**
 * Android reports an API level (34), not a marketing version (14), and pretending
 * otherwise would put a wrong number in every bug report. It is labelled for what
 * it is instead of being converted through a table that needs updating yearly.
 */
function describePlatform(os: string, osVersion: string | number | null): string {
  const version =
    osVersion === null || osVersion === undefined || osVersion === "" ? null : String(osVersion);

  switch (os) {
    case "android":
      return version ? `Android (API ${version})` : "Android";
    case "ios":
      return version ? `iOS ${version}` : "iOS";
    case "web":
      return "Web";
    default:
      return version ? `${os} ${version}` : os;
  }
}

export function describeBuild(source: BuildSource): BuildFacts {
  const version = source.version?.trim() || UNKNOWN_VERSION;

  return {
    version,
    versionLine: version === UNKNOWN_VERSION ? "Version unavailable" : `Version ${version}`,
    mode: source.dev ? "Development" : "Release",
    runtime: describeRuntime(source.os, source.executionEnvironment),
    platform: describePlatform(source.os, source.osVersion),
    deviceName: source.deviceName?.trim() || null,
  };
}

/** The one function here that touches the platform. */
export function readBuildSource(): BuildSource {
  return {
    version: Constants.expoConfig?.version ?? null,
    os: Platform.OS,
    osVersion: Platform.Version ?? null,
    executionEnvironment: Constants.executionEnvironment,
    deviceName: Constants.deviceName ?? null,
    dev: __DEV__,
  };
}

// ---- Diagnostics ----

export interface DiagnosticsInput {
  build: BuildFacts;
  apiBaseUrl: string;
  /** Human verdict on the server, e.g. "Reachable". */
  serverStatus: string;
  /** Host:port only — never a URL carrying credentials. */
  broker: string | null;
  sensorUid: string;
  /** Human verdict on the sensor link, e.g. "Live". */
  sensorStatus: string;
  generatedAt: Date;
}

/**
 * The plain-text block behind "Share diagnostics". Everything in it is already
 * visible on the screen above; the point is that it can be pasted into a
 * message instead of retyped from a photo of a phone.
 */
export function diagnosticsReport(input: DiagnosticsInput): string {
  const { build } = input;

  return [
    `${APP_NAME} diagnostics`,
    `Generated ${input.generatedAt.toISOString()}`,
    "",
    `App: ${build.version} (${build.mode})`,
    `Runtime: ${build.runtime}`,
    `Platform: ${build.platform}`,
    ...(build.deviceName ? [`Device: ${build.deviceName}`] : []),
    "",
    `API: ${input.apiBaseUrl}`,
    `Server: ${input.serverStatus}`,
    `Broker: ${input.broker ?? "not configured"}`,
    `Sensor: ${input.sensorUid} (${input.sensorStatus})`,
  ].join("\n");
}

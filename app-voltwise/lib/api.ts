import { DeviceEventEmitter, Platform } from "react-native";
import Constants from "expo-constants";

/** Fired whenever alerts change (created or marked read) so views can refresh. */
export const ALERTS_CHANGED_EVENT = "voltwise:alertsChanged";

export function emitAlertsChanged() {
  DeviceEventEmitter.emit(ALERTS_CHANGED_EVENT);
}

/**
 * Fired when the server returns 401 (missing / expired token).
 * AuthContext subscribes to this event to trigger automatic sign-out.
 */
export const AUTH_UNAUTHORIZED_EVENT = "voltwise:authUnauthorized";

// ---- In-memory auth token ----
// Populated by AuthContext on boot/sign-in; cleared on sign-out.
let _authToken: string | null = null;

export function setAuthToken(token: string | null) {
  _authToken = token;
}

// ---- Auth response types ----

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  currency: string;
  createdAt?: string;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

/** How this install names itself in the account's list of signed-in devices. */
export interface ClientDescriptor {
  label: string;
  platform: string;
}

/**
 * Describes this device for the session the server is about to open. Sent with
 * register and login only — it is a display label, so the backend sanitises it
 * and falls back to the User-Agent if it is missing or useless.
 *
 * Constants.deviceName is the user's own name for their phone ("Danny's S23"),
 * which is far more recognisable in a device list than a model number. It is
 * undefined on some platforms, hence the plain-OS fallback.
 */
export function clientDescriptor(): ClientDescriptor {
  const platform = Platform.OS === "android" || Platform.OS === "ios" ? Platform.OS : "web";
  const deviceName = Constants.deviceName?.trim();

  if (deviceName) return { label: deviceName, platform };

  // On web the backend's User-Agent parse ("Chrome on Windows") beats anything
  // guessable here, so leave the label for it to fill in.
  return {
    label: platform === "android" ? "Android device" : platform === "ios" ? "iPhone" : "",
    platform,
  };
}

/**
 * Backend API base URL. Set EXPO_PUBLIC_BASE_URL in .env to your full backend
 * URL including the /api path, e.g. "http://192.168.1.10:3000/api".
 */
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_BASE_URL ?? "http://localhost:3000/api";

// Logged once at startup so you can confirm which URL the app is actually using
// (catches a stale .env that needs `npx expo start --clear`).
console.log("[VoltWise] API_BASE_URL =", API_BASE_URL);

/**
 * Performs the request and returns the raw Response, having already turned a
 * transport failure or a non-2xx status into a thrown Error with a useful
 * message. Split out from request() so that endpoints whose body is a file
 * rather than JSON (the exports) get identical auth, 401 handling and error
 * reporting without being forced through JSON.parse.
 */
async function rawRequest(path: string, init?: RequestInit): Promise<Response> {
  // Merge auth header when a token is available.
  const authHeaders: Record<string, string> = _authToken
    ? { Authorization: `Bearer ${_authToken}` }
    : {};

  // Multipart bodies must NOT get an explicit Content-Type — fetch generates
  // the multipart boundary itself, and overriding it breaks the upload.
  const isFormData =
    typeof FormData !== "undefined" && init?.body instanceof FormData;

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        ...(isFormData ? {} : { "Content-Type": "application/json" }),
        ...authHeaders,
        // Allow callers to override headers when needed.
        ...(init?.headers as Record<string, string> | undefined),
      },
    });
  } catch {
    // fetch() rejects only on a transport failure — wrong IP, server down, not on
    // the same network, or HTTP blocked. Make that distinct from an HTTP error.
    throw new Error(
      `Cannot reach the server at ${API_BASE_URL}. Check EXPO_PUBLIC_BASE_URL and that the backend is running on the same network.`
    );
  }

  if (res.status === 401) {
    DeviceEventEmitter.emit(AUTH_UNAUTHORIZED_EVENT);
  }

  if (!res.ok) {
    // Surface the backend's own message (e.g. "Invalid credentials") when present.
    // Errors always come back as JSON, even from the file endpoints.
    const serverMessage = await res
      .json()
      .then((body) => (body && typeof body === "object" ? body.message : null))
      .catch(() => null);
    throw new Error(serverMessage ?? `Request failed (${res.status}) for ${path}`);
  }

  return res;
}

/** Backend wraps every payload as { success, data } — this unwraps it. */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await rawRequest(path, init);
  const json = await res.json();
  // Tolerate both the { success, data } envelope and a raw payload.
  return (json && typeof json === "object" && "data" in json ? json.data : json) as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  /**
   * DELETE, optionally with a body. Account deletion re-checks the password,
   * and a password does not belong in a query string where it would be logged
   * by every proxy on the way.
   */
  delete: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: "DELETE",
      body: body ? JSON.stringify(body) : undefined,
    }),
  /** Multipart POST (e.g. device photo upload) — pass a ready-built FormData. */
  upload: <T>(path: string, form: FormData) =>
    request<T>(path, { method: "POST", body: form }),
  /**
   * GET whose body is a file, not an envelope (the /export downloads). Returns
   * the body verbatim — no unwrapping, no JSON.parse — so a CSV arrives as a
   * CSV and a JSON export keeps the exact bytes that will be written to disk.
   */
  getText: async (path: string): Promise<string> => (await rawRequest(path)).text(),
};

/**
 * Commands the master relay OFF through the backend (which publishes the MQTT
 * relay/set message the firmware acts on). Used by the anomaly "TURN OFF NOW"
 * flow, so it never throws — the modal choreography must not hang on a broker
 * outage. Returns true when the backend accepted the command.
 */
export async function requestMasterShutdown(): Promise<boolean> {
  try {
    await api.post<IotStatus>("/iot/relay", { on: false });
    return true;
  } catch (error) {
    console.warn("[VoltWise] Master shutdown command failed:", error);
    return false;
  }
}

/**
 * Resolves a server-relative asset path (e.g. "/uploads/device-3-....jpg")
 * against the backend host. Absolute http(s) and local file:// URIs pass
 * through untouched, so it is safe to call on any imageUri.
 */
export function resolveAssetUrl(uri: string | null): string | null {
  if (!uri) return null;
  if (uri.startsWith("/")) {
    return `${API_BASE_URL.replace(/\/api\/?$/, "")}${uri}`;
  }
  return uri;
}

/** Pings /api/health with a 3-second timeout. Returns true if server responds ok. Never throws. */
export async function checkHealth(): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const res = await fetch(`${API_BASE_URL}/health`, { signal: controller.signal });
    if (!res.ok) return false;
    const json = await res.json();
    return json?.status === "ok";
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// ---- Response types (mirror the backend contracts) ----

export type DashboardPeriod = "Day" | "Week" | "Month";

export interface DashboardDevice {
  id: string;
  name: string;
  watts: number;
  active: boolean;
}

export interface ConsumerSlice {
  id: string;
  name: string;
  pct: number;
  color: string;
  kwh: number;
  cost: number;
}

export interface Reading {
  voltage: number;
  current: number;
  activePower: number;
  energy: number;
  frequency: number;
  powerFactor: number;
  timestamp: string;
}

export interface MetricStat {
  key: "voltage" | "current" | "activePower" | "energy" | "frequency" | "powerFactor";
  label: string;
  unit: string;
  avg: number;
  min: number;
  max: number;
  info: string;
}

export interface DashboardData {
  currentKw: number;
  totalTodayKwh: number;
  devices: DashboardDevice[];
  history: { labels: string[]; data: number[] };
  topConsumers: ConsumerSlice[];
  reading: Reading;
  iotOnline: boolean;
}

export interface ApiDevice {
  id: string;
  name: string;
  room: string;
  category: string | null;
  imageUri: string | null;
  status: "ACTIVE" | "IDLE" | "OFF";
  watts: number;
  enabled: boolean;
}

export interface ApiDeviceReading {
  watts: number;
  kwh: number;
  todayKwh: number;
  costToday: number;
  voltage: number | null;
  current: number | null;
  frequency: number | null;
  powerFactor: number | null;
  timestamp: string;
}

export interface ApiAlert {
  id: string;
  type: "critical" | "warning" | "info";
  title: string;
  description: string;
  time: string;
  section: "TODAY" | "YESTERDAY";
  read: boolean;
  recommendation?: string;
}

/** Last-known relay state (from the firmware's retained relay/state topic). */
export interface RelayState {
  on: boolean;
  /** "boot" | "remote" | "overpower" | "countdown" */
  reason: string;
  updatedAt: string;
}

/** Response of POST /api/iot/relay and GET /api/iot/status. */
export interface IotStatus {
  /** The sensor the backend ingests from — not necessarily the app's pairing. */
  deviceUid: string;
  online: boolean;
  brokerConnected: boolean;
  relay: RelayState | null;
  lastTelemetry: {
    voltage?: number;
    current?: number;
    watts: number;
    kwh: number;
    frequency?: number;
    powerFactor?: number;
  } | null;
  lastTelemetryAt: string | null;
}

/** GET/PUT /api/analytics/tariff — the user's currently effective rate plan. */
export interface TariffInfo {
  ratePerKwh: number;
  /** A display symbol ("₱", "$"), not an ISO code. */
  currency: string;
}

/** One dataset's slice of GET /api/export/summary. */
export interface ExportDatasetSummary {
  /** Rows the selected range matches, before the server's row cap. */
  count: number;
  /** True when a download would be clipped to the most recent `maxRows`. */
  truncated: boolean;
}

/** GET /api/export/summary?range=… — what a download would contain. */
export interface ExportSummary {
  range: string;
  maxRows: number;
  readings: ExportDatasetSummary;
  /** The device inventory ignores the range — it is a list, not a log. */
  devices: ExportDatasetSummary;
  alerts: ExportDatasetSummary;
  firstReadingAt: string | null;
  lastReadingAt: string | null;
}

/** One signed-in device in GET /api/security/overview. */
export interface ApiSession {
  id: string;
  label: string;
  /** "android" | "ios" | "web" | "unknown" — picks the row icon. */
  platform: string;
  ipAddress: string | null;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  /** True for the session this app is using. Never offered a revoke button. */
  current: boolean;
}

/** Account-safety facts shown above the session list. */
export interface SecurityAccount {
  email: string;
  memberSince: string;
  /** Null when the password has never been changed since registering. */
  passwordChangedAt: string | null;
  hasPassword: boolean;
}

/** GET /api/security/overview, and the body of both revoke endpoints. */
export interface SecurityOverview {
  account: SecurityAccount;
  currentSessionId: string;
  sessions: ApiSession[];
}

/** DELETE /api/security/sessions/:id and POST /sessions/revoke-others. */
export interface RevokeResult {
  revokedCount: number;
  overview: SecurityOverview;
}

export interface AnalyticsData {
  billPredictor: {
    tariff: number;
    currency: string;
    accumulatedKwh: number;
    estimatedBill: number;
    cycleStart: string;
  };
  totalKwh: number;
  breakdown: { label: string; pct: number; color: string; kwh: number; cost: number }[];
  topConsumers: ConsumerSlice[];
  metrics: MetricStat[];
}

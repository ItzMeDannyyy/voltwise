import { DeviceEventEmitter } from "react-native";

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

/**
 * Backend API base URL. Set EXPO_PUBLIC_BASE_URL in .env to your full backend
 * URL including the /api path, e.g. "http://192.168.1.10:3000/api".
 */
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_BASE_URL ?? "http://localhost:3000/api";

// Logged once at startup so you can confirm which URL the app is actually using
// (catches a stale .env that needs `npx expo start --clear`).
console.log("[VoltWise] API_BASE_URL =", API_BASE_URL);

/** Backend wraps every payload as { success, data } — this unwraps it. */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  // Merge auth header when a token is available.
  const authHeaders: Record<string, string> = _authToken
    ? { Authorization: `Bearer ${_authToken}` }
    : {};

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
        // Allow callers to override headers (e.g. for multipart uploads in the future).
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
    const serverMessage = await res
      .json()
      .then((body) => (body && typeof body === "object" ? body.message : null))
      .catch(() => null);
    throw new Error(serverMessage ?? `Request failed (${res.status}) for ${path}`);
  }

  const json = await res.json();
  // Tolerate both the { success, data } envelope and a raw payload.
  return (json && typeof json === "object" && "data" in json ? json.data : json) as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

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
  icon: string;
  name: string;
  room: string;
  status: "ACTIVE" | "IDLE" | "OFF";
  watts: number;
  enabled: boolean;
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

export interface AnalyticsData {
  billPredictor: {
    tariff: number;
    currency: string;
    accumulatedKwh: number;
    estimatedBill: number;
    cycleStart: string;
  };
  totalKwh: number;
  breakdown: { label: string; pct: number; color: string }[];
  topConsumers: ConsumerSlice[];
  metrics: MetricStat[];
}

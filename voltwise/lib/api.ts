import Constants from "expo-constants";
import { DeviceEventEmitter } from "react-native";

/** Fired whenever alerts change (created or marked read) so views can refresh. */
export const ALERTS_CHANGED_EVENT = "voltwise:alertsChanged";

export function emitAlertsChanged() {
  DeviceEventEmitter.emit(ALERTS_CHANGED_EVENT);
}

/**
 * Resolves the VoltWise backend base URL.
 *
 * In Expo dev, the app may run on a physical device or simulator where
 * "localhost" points at the device itself, not the dev machine. We derive the
 * dev machine's LAN IP from Expo's `hostUri` (e.g. "192.168.1.5:8081") and
 * target the backend port (3000). Override with EXPO_PUBLIC_API_URL if needed.
 */
function resolveBaseUrl(): string {
  const override = process.env.EXPO_PUBLIC_API_URL;
  if (override) return override.replace(/\/$/, "");

  const hostUri =
    Constants.expoConfig?.hostUri ??
    // @ts-ignore legacy manifest field, present in some Expo runtimes
    Constants.manifest?.debuggerHost;

  if (hostUri) {
    const host = hostUri.split(":")[0];
    return `http://${host}:3000/api`;
  }

  return "http://localhost:3000/api";
}

export const API_BASE_URL = resolveBaseUrl();

/** Backend wraps every payload as { success, data } — this unwraps it. */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });

  if (!res.ok) {
    throw new Error(`Request failed (${res.status}) for ${path}`);
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

import type { ApiAlert } from "./api";

/**
 * The single source of truth for "should this alert be seen / heard".
 *
 * Deliberately pure — no React, no Expo, no storage — because six different
 * surfaces (tab badge, header bell + dropdown, banner engine, AnomalyModal
 * sound, haptics, new-load prompt) all have to agree, and because the
 * quiet-hours arithmetic is much easier to trust when it can be unit-tested
 * in isolation.
 */

export type AlertSeverity = ApiAlert["type"];

export const SEVERITIES: AlertSeverity[] = ["critical", "warning", "info"];

/** Display names, mirroring THEME_MODE_LABELS / FONT_SIZE_LABELS in constants/theme.ts. */
export const SEVERITY_LABELS: Record<AlertSeverity, string> = {
  critical: "Critical",
  warning: "Warning",
  info: "Info",
};

export const SEVERITY_HINTS: Record<AlertSeverity, string> = {
  critical: "Outages, safety cutoffs and power anomalies",
  warning: "Voltage dips and usage approaching your limits",
  info: "New loads, reports and status updates",
};

export interface QuietHours {
  enabled: boolean;
  /** Minutes since local midnight, 0–1439. */
  startMin: number;
  /** Minutes since local midnight, 0–1439. May be < startMin (wraps past midnight). */
  endMin: number;
}

export interface NotificationPrefs {
  /** Master switch — off means no banners, no badges, no sound. */
  enabled: boolean;
  severities: Record<AlertSeverity, boolean>;
  sound: boolean;
  haptics: boolean;
  /** The MQTT-driven "did you plug something in?" prompt. */
  newLoadPrompt: boolean;
  quietHours: QuietHours;
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  enabled: true,
  severities: { critical: true, warning: true, info: true },
  sound: true,
  haptics: true,
  newLoadPrompt: true,
  quietHours: { enabled: false, startMin: 22 * 60, endMin: 7 * 60 },
};

export const MINUTES_PER_DAY = 1440;

// ---- Validation ----

function isValidMinute(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value < MINUTES_PER_DAY;
}

function asBool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/**
 * Merge whatever came out of storage over the defaults, field by field. A
 * corrupt or missing field falls back to its own default rather than
 * discarding the entire blob — stricter than theme-storage's all-or-nothing
 * null, which is what lets us keep every preference in one stored value.
 */
export function normalizeNotificationPrefs(raw: unknown): NotificationPrefs {
  const d = DEFAULT_NOTIFICATION_PREFS;
  if (typeof raw !== "object" || raw === null) return { ...d, severities: { ...d.severities }, quietHours: { ...d.quietHours } };

  const obj = raw as Record<string, unknown>;
  const sev = (typeof obj.severities === "object" && obj.severities !== null
    ? obj.severities
    : {}) as Record<string, unknown>;
  const qh = (typeof obj.quietHours === "object" && obj.quietHours !== null
    ? obj.quietHours
    : {}) as Record<string, unknown>;

  return {
    enabled: asBool(obj.enabled, d.enabled),
    severities: {
      critical: asBool(sev.critical, d.severities.critical),
      warning: asBool(sev.warning, d.severities.warning),
      info: asBool(sev.info, d.severities.info),
    },
    sound: asBool(obj.sound, d.sound),
    haptics: asBool(obj.haptics, d.haptics),
    newLoadPrompt: asBool(obj.newLoadPrompt, d.newLoadPrompt),
    quietHours: {
      enabled: asBool(qh.enabled, d.quietHours.enabled),
      startMin: isValidMinute(qh.startMin) ? qh.startMin : d.quietHours.startMin,
      endMin: isValidMinute(qh.endMin) ? qh.endMin : d.quietHours.endMin,
    },
  };
}

// ---- Quiet hours ----

/** Minutes since local midnight for a given moment. */
export function minutesNow(now: Date = new Date()): number {
  return now.getHours() * 60 + now.getMinutes();
}

export function formatMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Windows may wrap past midnight (22:00 → 07:00), which is the normal case
 * for a "quiet hours" setting, hence the two-branch comparison rather than a
 * plain range check.
 */
export function isWithinQuietHours(nowMin: number, q: QuietHours): boolean {
  if (!q.enabled) return false;
  // A zero-width window would otherwise silence either nothing or everything
  // depending on the branch — treat it as "off".
  if (q.startMin === q.endMin) return false;
  return q.startMin < q.endMin
    ? nowMin >= q.startMin && nowMin < q.endMin
    : nowMin >= q.startMin || nowMin < q.endMin;
}

// ---- The two predicates ----

/**
 * In-app visibility: tab badge, bell badge, dropdown list.
 *
 * Master switch and severity only — quiet hours must NOT apply here. Quiet
 * hours suppresses *interruptions*, not the record of what happened; blanking
 * a badge between 22:00 and 07:00 would hide alerts rather than silence them.
 */
export function isAlertVisible(
  alert: Pick<ApiAlert, "type">,
  prefs: NotificationPrefs
): boolean {
  return prefs.enabled && prefs.severities[alert.type];
}

/**
 * Interruptions: OS banner, sound, haptics. Everything isAlertVisible checks,
 * plus quiet hours — which critical alerts always break through.
 */
export function shouldNotify(
  alert: Pick<ApiAlert, "type">,
  prefs: NotificationPrefs,
  nowMin: number = minutesNow()
): boolean {
  if (!isAlertVisible(alert, prefs)) return false;
  if (alert.type === "critical") return true;
  return !isWithinQuietHours(nowMin, prefs.quietHours);
}

// ---- New-alert diffing ----
//
// The backend hands out ids as String(autoincrement int) — see
// backend/src/modules/alerts/alerts.service.ts formatAlertForResponse — so a
// single high-water-mark integer is enough to know what is new, with no need
// to persist an ever-growing set of seen ids. If ids ever become UUIDs these
// helpers return null/0 and the engine falls back to its in-memory set.

export function alertIdNumber(alert: Pick<ApiAlert, "id">): number | null {
  const n = Number(alert.id);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Highest id in the list, never below `current`. */
export function highWaterMark(list: Pick<ApiAlert, "id">[], current: number): number {
  return list.reduce((max, a) => {
    const n = alertIdNumber(a);
    return n !== null && n > max ? n : max;
  }, current);
}

/** Alerts newer than the mark, oldest first so banners arrive in order. */
export function newAlertsSince(list: ApiAlert[], hwm: number): ApiAlert[] {
  return list
    .filter((a) => {
      const n = alertIdNumber(a);
      return n !== null && n > hwm;
    })
    .sort((a, b) => (alertIdNumber(a) ?? 0) - (alertIdNumber(b) ?? 0));
}

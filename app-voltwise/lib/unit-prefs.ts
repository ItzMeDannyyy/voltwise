/**
 * Display units + the electricity tariff — the single source of truth for how
 * every power, energy and money figure in the app is rendered.
 *
 * Deliberately pure (no React, no Expo, no storage), for the same reason
 * lib/notification-rules.ts is: the dashboard hero, the device cards, the
 * analytics donut, the bill predictor and the settings preview all have to
 * agree down to the decimal place, and unit arithmetic is far easier to trust
 * when it can be read — and tested — in one place.
 *
 * Values are always carried through the app in SI-ish base units (watts for
 * power, kWh for energy) exactly as the backend and the PZEM-004T report them.
 * Conversion happens only at the moment of display, so no preference change can
 * ever corrupt stored or in-flight data.
 */

export type PowerUnit = "auto" | "W" | "kW";
export type EnergyUnit = "kWh" | "Wh";

export interface Currency {
  /** ISO 4217 code — what we persist, since symbols are ambiguous ($ is not unique). */
  code: string;
  /** What gets rendered in front of an amount. */
  symbol: string;
  label: string;
}

/**
 * PHP leads the list: VoltWise is built for Philippine mains (220 V / 60 Hz)
 * and the backend defaults every tariff to ₱.
 */
export const CURRENCIES: Currency[] = [
  { code: "PHP", symbol: "₱", label: "Philippine Peso" },
  { code: "USD", symbol: "$", label: "US Dollar" },
  { code: "EUR", symbol: "€", label: "Euro" },
  { code: "GBP", symbol: "£", label: "Pound Sterling" },
  { code: "JPY", symbol: "¥", label: "Japanese Yen" },
  { code: "SGD", symbol: "S$", label: "Singapore Dollar" },
];

export const POWER_UNITS: PowerUnit[] = ["auto", "W", "kW"];
export const ENERGY_UNITS: EnergyUnit[] = ["kWh", "Wh"];

// Short labels: these sit in a segmented pill next to a "Power" / "Energy" row
// title, so the symbol alone reads unambiguously and fits at every font scale.
export const POWER_UNIT_LABELS: Record<PowerUnit, string> = {
  auto: "Auto",
  W: "W",
  kW: "kW",
};

export const ENERGY_UNIT_LABELS: Record<EnergyUnit, string> = {
  kWh: "kWh",
  Wh: "Wh",
};

export interface UnitPrefs {
  powerUnit: PowerUnit;
  energyUnit: EnergyUnit;
  currencyCode: string;
  /**
   * Utility rate per kWh. The backend is authoritative — it computes the cost
   * fields the API returns — and this is the device-local mirror the app reads
   * for display and for offline cost math. See context/UnitsContext.tsx for the
   * sync rules.
   */
  ratePerKwh: number;
}

/** Matches the backend's fallback in backend/src/lib/tariff.ts. */
export const DEFAULT_RATE_PER_KWH = 10.5;

export const DEFAULT_UNIT_PREFS: UnitPrefs = {
  powerUnit: "auto",
  energyUnit: "kWh",
  currencyCode: "PHP",
  ratePerKwh: DEFAULT_RATE_PER_KWH,
};

/**
 * Rate bounds. The floor keeps a stray 0 from silently zeroing every bill; the
 * ceiling catches a misplaced decimal (a residential kWh costs single-to-low
 * double digits in every currency listed above).
 */
export const MIN_RATE_PER_KWH = 0.01;
export const MAX_RATE_PER_KWH = 1000;

// ---- Validation ----

export function isValidRate(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= MIN_RATE_PER_KWH &&
    value <= MAX_RATE_PER_KWH
  );
}

/**
 * Parses user keyboard input into a rate. Returns null when the text isn't a
 * usable rate, so callers can show one error message rather than guessing.
 * Accepts a comma as the decimal mark — several of the locales above use it.
 */
export function parseRate(input: string): number | null {
  const normalized = input.trim().replace(",", ".");
  if (normalized === "") return null;
  const parsed = Number(normalized);
  return isValidRate(parsed) ? parsed : null;
}

function asOneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

/**
 * Merge whatever came out of storage over the defaults, field by field — the
 * same tolerant strategy normalizeNotificationPrefs uses, so one corrupt value
 * can't discard the whole blob.
 */
export function normalizeUnitPrefs(raw: unknown): UnitPrefs {
  const d = DEFAULT_UNIT_PREFS;
  if (typeof raw !== "object" || raw === null) return { ...d };

  const obj = raw as Record<string, unknown>;
  return {
    powerUnit: asOneOf(obj.powerUnit, POWER_UNITS, d.powerUnit),
    energyUnit: asOneOf(obj.energyUnit, ENERGY_UNITS, d.energyUnit),
    currencyCode: asOneOf(
      obj.currencyCode,
      CURRENCIES.map((c) => c.code),
      d.currencyCode
    ),
    ratePerKwh: isValidRate(obj.ratePerKwh) ? obj.ratePerKwh : d.ratePerKwh,
  };
}

// ---- Currency ----

export function currencyFor(code: string): Currency {
  return CURRENCIES.find((c) => c.code === code) ?? CURRENCIES[0];
}

/** Maps a symbol coming back from the backend to a known currency, if any. */
export function currencyForSymbol(symbol: string): Currency | null {
  return CURRENCIES.find((c) => c.symbol === symbol) ?? null;
}

// ---- Formatting ----
//
// The *Parts helpers exist because several screens style the number and its
// unit differently (the dashboard hero renders "1.24" at 44pt next to "kW" at
// 14pt). Everything else uses the flat format* wrappers.

export interface ValueParts {
  value: string;
  unit: string;
}

/**
 * Resolves "auto" against a reference value. Call this once when several
 * related figures share a unit label — an avg/min/max trio rendered under a
 * single "W" badge must not silently switch the max to kW.
 *
 * "auto" switches at 1 kW, the point where watt figures stop being readable.
 */
export function resolvePowerUnit(referenceWatts: number, prefs: UnitPrefs): "W" | "kW" {
  if (prefs.powerUnit !== "auto") return prefs.powerUnit;
  return Math.abs(Number.isFinite(referenceWatts) ? referenceWatts : 0) >= 1000 ? "kW" : "W";
}

/** Renders watts in an already-resolved unit. */
export function powerIn(watts: number, unit: "W" | "kW"): string {
  const safe = Number.isFinite(watts) ? watts : 0;
  return unit === "kW" ? (safe / 1000).toFixed(2) : safe.toFixed(0);
}

export function powerParts(watts: number, prefs: UnitPrefs): ValueParts {
  const unit = resolvePowerUnit(watts, prefs);
  return { value: powerIn(watts, unit), unit };
}

/**
 * `decimals` is the precision wanted in kWh; the Wh rendering drops three
 * places to match, because 1 kWh = 1000 Wh (0.015 kWh → 15 Wh, not 15.000).
 */
export function energyIn(kwh: number, unit: EnergyUnit, decimals = 2): string {
  const safe = Number.isFinite(kwh) ? kwh : 0;
  return unit === "Wh"
    ? (safe * 1000).toFixed(Math.max(0, decimals - 3))
    : safe.toFixed(decimals);
}

export function energyParts(kwh: number, prefs: UnitPrefs, decimals = 2): ValueParts {
  return { value: energyIn(kwh, prefs.energyUnit, decimals), unit: prefs.energyUnit };
}

export function formatPower(watts: number, prefs: UnitPrefs): string {
  const { value, unit } = powerParts(watts, prefs);
  return `${value} ${unit}`;
}

export function formatEnergy(kwh: number, prefs: UnitPrefs, decimals = 2): string {
  const { value, unit } = energyParts(kwh, prefs, decimals);
  return `${value} ${unit}`;
}

/** Money always keeps two decimals — a bill figure with fewer reads as an estimate. */
export function formatCost(amount: number, prefs: UnitPrefs): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return `${currencyFor(prefs.currencyCode).symbol}${safe.toFixed(2)}`;
}

/**
 * Cost of an energy figure at the current rate.
 *
 * Screens prefer this over the cost fields the API returns so that a tariff
 * change is reflected the instant it is saved, and so the offline fallback data
 * is priced with the user's own rate instead of the seeded demo one.
 */
export function costOf(kwh: number, prefs: UnitPrefs): number {
  const safe = Number.isFinite(kwh) ? kwh : 0;
  return safe * prefs.ratePerKwh;
}

export function formatCostOf(kwh: number, prefs: UnitPrefs): string {
  return formatCost(costOf(kwh, prefs), prefs);
}

/** The tariff itself, e.g. "₱10.50 /kWh". Always per kWh regardless of energyUnit — utilities bill in kWh. */
export function formatRate(prefs: UnitPrefs): string {
  return `${currencyFor(prefs.currencyCode).symbol}${prefs.ratePerKwh.toFixed(2)} /kWh`;
}

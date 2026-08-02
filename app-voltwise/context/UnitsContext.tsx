import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { api, type TariffInfo } from "../lib/api";
import { useAuth } from "./AuthContext";
import {
  CURRENCIES,
  DEFAULT_UNIT_PREFS,
  costOf as costOfRule,
  currencyFor,
  currencyForSymbol,
  energyParts as energyPartsRule,
  formatCost as formatCostRule,
  formatEnergy as formatEnergyRule,
  formatPower as formatPowerRule,
  formatRate as formatRateRule,
  powerParts as powerPartsRule,
  type Currency,
  type EnergyUnit,
  type PowerUnit,
  type UnitPrefs,
  type ValueParts,
} from "../lib/unit-prefs";
import { getStoredUnitPrefs, saveUnitPrefs } from "../lib/unit-storage";

/**
 * Unit + tariff preferences, and the formatters bound to them.
 *
 * Ownership is split, and the split matters:
 *
 *  - powerUnit / energyUnit are pure display choices. They never leave the
 *    device — the server has no opinion on whether you like W or kW.
 *  - ratePerKwh / currency are account data. The backend stores them (Tariff
 *    rows) and uses the rate to compute the cost fields it returns, so the two
 *    sides must not drift.
 *
 * Sync rule for the account half: the server wins on read, the user wins on
 * write. Signing in fetches the stored tariff and adopts it, because every cost
 * figure the API has already computed used that rate — showing a different one
 * would make the app contradict itself. Saving pushes to the server and applies
 * locally either way, so an edit made offline still takes effect immediately;
 * it will be replaced by the server's value on the next successful fetch.
 */

interface UnitsContextValue {
  prefs: UnitPrefs;
  /** False until persisted preferences have finished loading. */
  isReady: boolean;
  currency: Currency;

  setPowerUnit: (unit: PowerUnit) => void;
  setEnergyUnit: (unit: EnergyUnit) => void;
  /** Persists locally, then mirrors to the account's tariff record. */
  setCurrency: (code: string) => Promise<boolean>;
  /** Persists locally, then pushes to the backend. Resolves false if the push failed. */
  setRatePerKwh: (rate: number) => Promise<boolean>;
  /**
   * Restores the display units only. The rate and currency are account data and
   * survive — see resetDisplayUnits below.
   */
  resetDisplayUnits: () => void;

  // Formatters bound to the current preferences.
  formatPower: (watts: number) => string;
  formatEnergy: (kwh: number, decimals?: number) => string;
  formatCost: (amount: number) => string;
  /** Prices an energy figure at the current rate — see costOf in lib/unit-prefs.ts. */
  formatCostOf: (kwh: number) => string;
  costOf: (kwh: number) => number;
  formatRate: () => string;
  powerParts: (watts: number) => ValueParts;
  energyParts: (kwh: number, decimals?: number) => ValueParts;
}

const UnitsContext = createContext<UnitsContextValue | undefined>(undefined);

export function UnitsProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isBootstrapping } = useAuth();

  const [prefs, setPrefsState] = useState<UnitPrefs>(DEFAULT_UNIT_PREFS);
  const [isReady, setIsReady] = useState(false);

  // Hydration must not clobber an edit the user made while it was in flight.
  const hydratedRef = useRef(false);

  // ---- Hydration ----

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = await getStoredUnitPrefs();
      if (cancelled) return;
      if (stored && !hydratedRef.current) setPrefsState(stored);
      hydratedRef.current = true;
      setIsReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const update = useCallback((patch: Partial<UnitPrefs>) => {
    setPrefsState((prev) => {
      const next = { ...prev, ...patch };
      saveUnitPrefs(next).catch(() => {});
      return next;
    });
  }, []);

  // ---- Pull the account's tariff once signed in ----

  useEffect(() => {
    if (!isReady || !isAuthenticated || isBootstrapping) return;
    let cancelled = false;
    (async () => {
      try {
        const tariff = await api.get<TariffInfo>("/analytics/tariff");
        if (cancelled) return;
        // The server stores a symbol; only adopt it when it maps to a currency
        // we can render a full label for, so an unrecognised one leaves the
        // local choice (and the settings list) intact.
        const matched = currencyForSymbol(tariff.currency);
        update({
          ratePerKwh: tariff.ratePerKwh,
          ...(matched ? { currencyCode: matched.code } : {}),
        });
      } catch {
        // Offline — the stored mirror is still a usable rate.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isReady, isAuthenticated, isBootstrapping, update]);

  // ---- Setters ----

  const setPowerUnit = useCallback((unit: PowerUnit) => update({ powerUnit: unit }), [update]);
  const setEnergyUnit = useCallback((unit: EnergyUnit) => update({ energyUnit: unit }), [update]);

  /**
   * Both account-side setters go through the same PUT: the backend writes the
   * rate and the currency as one Tariff row, so pushing either alone would drop
   * the other back to its default.
   */
  const pushTariff = useCallback(async (rate: number, currencyCode: string): Promise<boolean> => {
    try {
      await api.put<TariffInfo>("/analytics/tariff", {
        ratePerKwh: rate,
        currency: currencyFor(currencyCode).symbol,
      });
      return true;
    } catch {
      return false;
    }
  }, []);

  const setRatePerKwh = useCallback(
    async (rate: number) => {
      update({ ratePerKwh: rate });
      return pushTariff(rate, prefs.currencyCode);
    },
    [update, pushTariff, prefs.currencyCode]
  );

  const setCurrency = useCallback(
    async (code: string) => {
      if (!CURRENCIES.some((c) => c.code === code)) return false;
      update({ currencyCode: code });
      return pushTariff(prefs.ratePerKwh, code);
    },
    [update, pushTariff, prefs.ratePerKwh]
  );

  /**
   * Puts the display half back to its defaults for the Data & Export reset.
   *
   * Stops at the split this provider is built around: powerUnit and energyUnit
   * are this device's opinion and are safe to discard, while ratePerKwh and the
   * currency are the account's. Resetting those would push a new Tariff row to
   * the server, so a user who reset their theme would find their electricity
   * rate silently back at 10.5 — on every device they own.
   */
  const resetDisplayUnits = useCallback(() => {
    update({
      powerUnit: DEFAULT_UNIT_PREFS.powerUnit,
      energyUnit: DEFAULT_UNIT_PREFS.energyUnit,
    });
  }, [update]);

  // ---- Bound formatters ----

  const value = useMemo<UnitsContextValue>(
    () => ({
      prefs,
      isReady,
      currency: currencyFor(prefs.currencyCode),
      setPowerUnit,
      setEnergyUnit,
      setCurrency,
      setRatePerKwh,
      resetDisplayUnits,
      formatPower: (watts) => formatPowerRule(watts, prefs),
      formatEnergy: (kwh, decimals) => formatEnergyRule(kwh, prefs, decimals),
      formatCost: (amount) => formatCostRule(amount, prefs),
      formatCostOf: (kwh) => formatCostRule(costOfRule(kwh, prefs), prefs),
      costOf: (kwh) => costOfRule(kwh, prefs),
      formatRate: () => formatRateRule(prefs),
      powerParts: (watts) => powerPartsRule(watts, prefs),
      energyParts: (kwh, decimals) => energyPartsRule(kwh, prefs, decimals),
    }),
    [
      prefs,
      isReady,
      setPowerUnit,
      setEnergyUnit,
      setCurrency,
      setRatePerKwh,
      resetDisplayUnits,
    ]
  );

  return <UnitsContext.Provider value={value}>{children}</UnitsContext.Provider>;
}

export function useUnits(): UnitsContextValue {
  const ctx = useContext(UnitsContext);
  if (!ctx) {
    throw new Error("useUnits must be used within a UnitsProvider");
  }
  return ctx;
}

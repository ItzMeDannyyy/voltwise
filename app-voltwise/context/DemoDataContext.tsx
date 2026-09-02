import { createContext, useCallback, useContext, useMemo, useState } from "react";

/**
 * Sample-data mode: a presentation switch that swaps Dashboard, Devices and
 * Analytics onto the static showcase dataset in `lib/demo-data.ts`, so the
 * charts and breakdowns can be seen fully populated on an account that has no
 * history yet.
 *
 * Deliberately **in-memory only**. It is not in `lib/local-data.ts` and never
 * touches SecureStore, because a demo switch that survives a restart is a demo
 * switch someone forgets is on — and every screen it affects would then be
 * quietly showing figures the meter never measured. Closing the app is the
 * guaranteed way back to the truth.
 *
 * Nothing here writes: while it is on, the affected screens skip their API
 * mutations and the dashboard's relay button stops publishing MQTT commands, so
 * a demo can never move a real contactor or edit a real device.
 */
interface DemoDataValue {
  /** True while the sample dataset is replacing real data on screen. */
  demoData: boolean;
  setDemoData: (value: boolean) => void;
  toggleDemoData: () => void;
}

const DemoDataContext = createContext<DemoDataValue | undefined>(undefined);

export function DemoDataProvider({ children }: { children: React.ReactNode }) {
  const [demoData, setDemoData] = useState(false);

  const toggleDemoData = useCallback(() => setDemoData((prev) => !prev), []);

  const value = useMemo(
    () => ({ demoData, setDemoData, toggleDemoData }),
    [demoData, toggleDemoData]
  );

  return <DemoDataContext.Provider value={value}>{children}</DemoDataContext.Provider>;
}

export function useDemoData(): DemoDataValue {
  const ctx = useContext(DemoDataContext);
  if (!ctx) {
    throw new Error("useDemoData must be used inside a DemoDataProvider");
  }
  return ctx;
}

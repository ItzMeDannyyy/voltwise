import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useColorScheme } from "react-native";
import {
  ColorScheme,
  FONT_SCALES,
  FontSize,
  ThemeColors,
  ThemeMode,
  getColors,
} from "../constants/theme";
import {
  getStoredFontSize,
  getStoredThemeMode,
  saveFontSize,
  saveThemeMode,
} from "../lib/theme-storage";

interface ThemeContextValue {
  /** User's chosen preference ("system" follows the OS). */
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  /** Resolved scheme after applying "system" — always "light" or "dark". */
  colorScheme: ColorScheme;
  colors: ThemeColors;
  fontSize: FontSize;
  setFontSize: (size: FontSize) => void;
  /** Multiplier to apply on top of explicit fontSize values in styles. */
  fontScale: number;
  /** False until persisted preferences have finished loading. */
  isReady: boolean;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>("system");
  const [fontSize, setFontSizeState] = useState<FontSize>("medium");
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [storedMode, storedFontSize] = await Promise.all([
        getStoredThemeMode(),
        getStoredFontSize(),
      ]);
      if (cancelled) return;
      if (storedMode) setModeState(storedMode);
      if (storedFontSize) setFontSizeState(storedFontSize);
      setIsReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    saveThemeMode(next).catch(() => {});
  }, []);

  const setFontSize = useCallback((next: FontSize) => {
    setFontSizeState(next);
    saveFontSize(next).catch(() => {});
  }, []);

  const colorScheme: ColorScheme = mode === "system" ? systemScheme ?? "dark" : mode;
  const colors = useMemo(() => getColors(colorScheme), [colorScheme]);
  const fontScale = FONT_SCALES[fontSize];

  const value = useMemo<ThemeContextValue>(
    () => ({ mode, setMode, colorScheme, colors, fontSize, setFontSize, fontScale, isReady }),
    [mode, setMode, colorScheme, colors, fontSize, setFontSize, fontScale, isReady]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return ctx;
}

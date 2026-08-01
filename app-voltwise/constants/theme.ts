/**
 * Global theme tokens. Every screen/component should pull colors from
 * `useTheme().colors` (see context/ThemeContext.tsx) rather than hardcoding
 * hex values, so that dark mode, light mode, and "system" all stay in sync
 * app-wide.
 */

export type ThemeMode = "light" | "dark" | "system";
export type ColorScheme = "light" | "dark";
export type FontSize = "small" | "medium" | "large";

export interface ThemeColors {
  /** Screen background */
  bg: string;
  /** Elevated surface (cards, sheets, modals) */
  card: string;
  /** Nested surface inside a card (icon chips, inset rows) */
  surface: string;
  /** Hairline borders / dividers */
  border: string;
  /** Primary text */
  text: string;
  /** Secondary / muted text */
  sub: string;
  /** Brand accent (teal) */
  accent: string;
  /** Translucent accent background, e.g. banners */
  accentSoft: string;
  /** Translucent accent border */
  accentBorder: string;
  /** Semantic: warnings */
  yellow: string;
  /** Semantic: danger/errors */
  red: string;
  /** Semantic: success/positive */
  green: string;
  /** Semantic: secondary warning/info accent */
  amber: string;
  /** Constant white, for text/icons on top of accent-filled surfaces */
  white: string;
  /** Disabled / inactive icon-tint */
  inactive: string;
  /** Modal backdrop */
  overlay: string;
  /** Stronger modal backdrop, for full-screen critical alerts */
  overlayStrong: string;
  /** Shadow color for elevation */
  shadow: string;
}

export const darkColors: ThemeColors = {
  bg: "#1a1f2e",
  card: "#242b3d",
  surface: "#2a3245",
  border: "#2d3448",
  text: "#ffffff",
  sub: "#9ca3af",
  accent: "#00d4aa",
  accentSoft: "rgba(0, 212, 170, 0.12)",
  accentBorder: "rgba(0, 212, 170, 0.3)",
  yellow: "#f59e0b",
  red: "#ef4444",
  green: "#10b981",
  amber: "#f97316",
  white: "#ffffff",
  inactive: "#6b7280",
  overlay: "rgba(0, 0, 0, 0.6)",
  overlayStrong: "rgba(0, 0, 0, 0.75)",
  shadow: "#000000",
};

export const lightColors: ThemeColors = {
  bg: "#f3f5f9",
  card: "#ffffff",
  surface: "#edf0f6",
  border: "#e1e5ee",
  text: "#151a27",
  sub: "#64748b",
  accent: "#00a389",
  accentSoft: "rgba(0, 163, 137, 0.1)",
  accentBorder: "rgba(0, 163, 137, 0.25)",
  yellow: "#b45309",
  red: "#dc2626",
  green: "#059669",
  amber: "#c2410c",
  white: "#ffffff",
  inactive: "#94a3b8",
  overlay: "rgba(15, 23, 42, 0.45)",
  overlayStrong: "rgba(15, 23, 42, 0.7)",
  shadow: "#94a3b8",
};

export function getColors(scheme: ColorScheme): ThemeColors {
  return scheme === "dark" ? darkColors : lightColors;
}

/** Multiplier applied on top of any explicit `fontSize` in themed styles. */
export const FONT_SCALES: Record<FontSize, number> = {
  small: 0.92,
  medium: 1,
  large: 1.15,
};

export const FONT_SIZE_LABELS: Record<FontSize, string> = {
  small: "Small",
  medium: "Medium",
  large: "Large",
};

export const THEME_MODE_LABELS: Record<ThemeMode, string> = {
  light: "Light",
  dark: "Dark",
  system: "System",
};

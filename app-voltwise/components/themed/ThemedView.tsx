import React from "react";
import { View, ViewProps } from "react-native";
import { useTheme } from "../../context/ThemeContext";

type Variant = "bg" | "card" | "surface" | "transparent";

interface ThemedViewProps extends ViewProps {
  /** Which theme surface to paint as the background. Defaults to the screen background. */
  variant?: Variant;
}

/**
 * A View whose backgroundColor tracks the active theme. Use this (or
 * ScreenContainer for a full screen root) instead of hardcoding
 * backgroundColor so the surface repaints on theme change.
 */
export function ThemedView({ variant = "bg", style, ...rest }: ThemedViewProps) {
  const { colors } = useTheme();
  const backgroundColor =
    variant === "transparent"
      ? "transparent"
      : variant === "card"
        ? colors.card
        : variant === "surface"
          ? colors.surface
          : colors.bg;

  return <View style={[{ backgroundColor }, style]} {...rest} />;
}

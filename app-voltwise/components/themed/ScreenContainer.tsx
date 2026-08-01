import React from "react";
import { StyleSheet, ViewStyle } from "react-native";
import { Edge, SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../../context/ThemeContext";

interface ScreenContainerProps {
  children: React.ReactNode;
  edges?: readonly Edge[];
  style?: ViewStyle | ViewStyle[];
  /** Which theme surface to use as the screen background. Defaults to "bg". */
  variant?: "bg" | "card";
}

/**
 * The global, theme-aware background wrapper every screen root should use
 * instead of a bare SafeAreaView with a hardcoded backgroundColor. Swapping
 * the active theme (light/dark/system) repaints every screen that uses this
 * automatically.
 */
export function ScreenContainer({
  children,
  edges = ["top", "bottom"],
  style,
  variant = "bg",
}: ScreenContainerProps) {
  const { colors } = useTheme();
  const backgroundColor = variant === "card" ? colors.card : colors.bg;

  return (
    <SafeAreaView style={[styles.root, { backgroundColor }, style]} edges={edges}>
      {children}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});

import React from "react";
import { StyleSheet, Text, TextProps } from "react-native";
import { useTheme } from "../../context/ThemeContext";

type Variant = "primary" | "sub" | "accent" | "danger" | "warning" | "success" | "inverse";

interface ThemedTextProps extends TextProps {
  /** Semantic color to apply. Defaults to the primary text color. */
  variant?: Variant;
  /** Multiply any explicit `fontSize` in `style` by the user's font-size preference. Defaults to true. */
  scaleFont?: boolean;
}

/**
 * A Text whose color tracks the active theme and whose fontSize (if set via
 * `style`) tracks the user's font-size preference. Prefer this over a bare
 * <Text> for any user-facing copy.
 */
export function ThemedText({
  variant = "primary",
  scaleFont = true,
  style,
  ...rest
}: ThemedTextProps) {
  const { colors, fontScale } = useTheme();
  const color =
    variant === "sub"
      ? colors.sub
      : variant === "accent"
        ? colors.accent
        : variant === "danger"
          ? colors.red
          : variant === "warning"
            ? colors.yellow
            : variant === "success"
              ? colors.green
              : variant === "inverse"
                ? colors.white
                : colors.text;

  const flatStyle = (StyleSheet.flatten(style) ?? {}) as { fontSize?: number };
  const appliedStyle =
    scaleFont && typeof flatStyle.fontSize === "number"
      ? { ...flatStyle, fontSize: flatStyle.fontSize * fontScale }
      : flatStyle;

  return <Text style={[{ color }, appliedStyle]} {...rest} />;
}

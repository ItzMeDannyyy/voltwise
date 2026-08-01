import { useMemo } from "react";
import type { ThemeColors } from "../../constants/theme";
import { useTheme } from "../../context/ThemeContext";

/**
 * Builds a memoized StyleSheet from the active theme colors + font scale.
 *
 * Usage: define the factory once at module scope (so its identity is
 * stable across renders) and call the hook inside the component:
 *
 *   function createStyles(colors: ThemeColors, fontScale: number) {
 *     return StyleSheet.create({
 *       root: { flex: 1, backgroundColor: colors.bg },
 *       title: { color: colors.text, fontSize: 18 * fontScale },
 *     });
 *   }
 *
 *   function Screen() {
 *     const styles = useThemedStyles(createStyles);
 *     ...
 *   }
 */
export function useThemedStyles<T>(factory: (colors: ThemeColors, fontScale: number) => T): T {
  const { colors, fontScale } = useTheme();
  return useMemo(() => factory(colors, fontScale), [factory, colors, fontScale]);
}

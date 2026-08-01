import { useRef, useState, ReactNode } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Easing,
  LayoutAnimation,
  Platform,
  UIManager,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";
import { useThemedStyles } from "./themed";
import type { ThemeColors } from "../constants/theme";

// Enable LayoutAnimation on Android (no-op on iOS where it's always enabled).
if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface CollapsibleProps {
  title: string | ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}

export default function Collapsible({
  title,
  defaultOpen = false,
  children,
}: CollapsibleProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [open, setOpen] = useState(defaultOpen);
  // Animated value drives the chevron rotation: 0 = closed, 1 = open.
  const chevronAnim = useRef(new Animated.Value(defaultOpen ? 1 : 0)).current;

  function toggle() {
    const next = !open;
    // Animate chevron rotation via the same Easing pattern used in DemoFab.
    Animated.timing(chevronAnim, {
      toValue: next ? 1 : 0,
      duration: next ? 200 : 160,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
    // LayoutAnimation handles the body height change without needing
    // a measured height — it animates any layout change in the next frame.
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen(next);
  }

  const chevronRotate = chevronAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "180deg"],
  });

  return (
    <View>
      <TouchableOpacity
        style={styles.header}
        onPress={toggle}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel={typeof title === "string" ? title : "Toggle section"}
        accessibilityState={{ expanded: open }}
      >
        {typeof title === "string" ? (
          <Text style={styles.headerText}>{title}</Text>
        ) : (
          <View style={styles.headerContent}>{title}</View>
        )}
        <Animated.View style={{ transform: [{ rotate: chevronRotate }] }}>
          <Ionicons name="chevron-down" size={16} color={colors.sub} />
        </Animated.View>
      </TouchableOpacity>

      {open && <View style={styles.body}>{children}</View>}
    </View>
  );
}

function createStyles(colors: ThemeColors, fontScale: number) {
  return StyleSheet.create({
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 2,
      minHeight: 44,
    },
    headerText: {
      color: colors.sub,
      fontSize: 13 * fontScale,
      fontWeight: "600",
      flex: 1,
    },
    headerContent: {
      flex: 1,
    },
    body: {
      marginTop: 8,
    },
  });
}

import { useEffect } from "react";
import { StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  Easing,
  Extrapolation,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

const AnimatedIonicons = Animated.createAnimatedComponent(Ionicons);

interface RefreshIndicatorProps {
  pullDistance: SharedValue<number>;
  triggerDistance: number;
  refreshing: boolean;
  color?: string;
  background?: string;
}

/**
 * Purely visual: an arrow that fades in and rotates 180deg as the user pulls
 * past `triggerDistance`, swapping to a spin animation while `refreshing` is
 * true. Knows nothing about gestures or data fetching — PullToRefresh drives
 * `pullDistance`, and any screen could reuse this indicator with its own driver.
 */
export default function RefreshIndicator({
  pullDistance,
  triggerDistance,
  refreshing,
  color = "#00d4aa",
  background = "#242b3d",
}: RefreshIndicatorProps) {
  const spin = useSharedValue(0);

  // Continuous spin while a refresh is in flight; stops (and resets) once done.
  useEffect(() => {
    if (refreshing) {
      spin.value = withRepeat(withTiming(360, { duration: 700, easing: Easing.linear }), -1);
    } else {
      cancelAnimation(spin);
      spin.value = 0;
    }
  }, [refreshing, spin]);

  const wrapStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pullDistance.value, [0, triggerDistance * 0.6], [0, 1], Extrapolation.CLAMP),
    transform: [
      {
        scale: interpolate(pullDistance.value, [0, triggerDistance], [0.6, 1], Extrapolation.CLAMP),
      },
    ],
  }));

  // Before release: arrow rotates 0->180deg with the pull. While refreshing:
  // continuous spin takes over instead.
  const iconStyle = useAnimatedStyle(() => ({
    transform: [
      {
        rotate: `${
          refreshing ? spin.value : interpolate(pullDistance.value, [0, triggerDistance], [0, 180], Extrapolation.CLAMP)
        }deg`,
      },
    ],
  }));

  return (
    <Animated.View style={[styles.wrap, { backgroundColor: background, height: triggerDistance }, wrapStyle]}>
      <AnimatedIonicons name={refreshing ? "sync" : "arrow-down"} size={18} color={color} style={iconStyle} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
});

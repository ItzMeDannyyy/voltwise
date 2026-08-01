import { useEffect } from "react";
import { StyleSheet } from "react-native";
import Animated, {
  Easing,
  Extrapolation,
  cancelAnimation,
  interpolate,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";
import { useTheme } from "../../context/ThemeContext";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const SIZE = 26; // outer diameter of the ring, in px
const STROKE = 2.5;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const SPINNER_ARC = 0.25; // fraction of the ring drawn while a refresh is in flight
const MIN_ARC = 0.06; // small seed arc so the ring reads as a ring from the first pixel of pull

interface RefreshIndicatorProps {
  pullDistance: SharedValue<number>;
  triggerDistance: number;
  refreshing: boolean;
  color?: string;
}

/**
 * Purely visual: a chromeless circular spinner (no card/pill behind it) that
 * sits centered in whatever gap the pull has opened. While dragging, the ring
 * traces itself from empty to full as a progress cue for "release now"; once
 * `refreshing` flips it collapses to a quarter arc and spins continuously.
 * Knows nothing about gestures or data fetching — PullToRefresh drives
 * `pullDistance`, and any screen could reuse this indicator with its own driver.
 */
export default function RefreshIndicator({
  pullDistance,
  triggerDistance,
  refreshing,
  color,
}: RefreshIndicatorProps) {
  const { colors } = useTheme();
  const resolvedColor = color ?? colors.accent;
  const spin = useSharedValue(0);

  // Continuous spin while a refresh is in flight; stops (and resets) once done.
  useEffect(() => {
    if (refreshing) {
      spin.value = withRepeat(withTiming(360, { duration: 750, easing: Easing.linear }), -1);
    } else {
      cancelAnimation(spin);
      spin.value = 0;
    }
  }, [refreshing, spin]);

  // The wrapper is exactly as tall as the revealed gap, so the ring stays
  // optically centered in the space above the content the whole way down.
  const wrapStyle = useAnimatedStyle(() => ({
    height: pullDistance.value,
    opacity: interpolate(pullDistance.value, [0, triggerDistance * 0.35], [0, 1], Extrapolation.CLAMP),
  }));

  // Pulling rotates the ring with the drag; refreshing hands rotation over to
  // the continuous spin instead.
  const ringStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: interpolate(pullDistance.value, [0, triggerDistance], [0.7, 1], Extrapolation.CLAMP) },
      {
        rotate: `${
          refreshing
            ? spin.value
            : interpolate(pullDistance.value, [0, triggerDistance], [0, 150], Extrapolation.CLAMP)
        }deg`,
      },
    ],
  }));

  const arcProps = useAnimatedProps(() => {
    const progress = refreshing
      ? SPINNER_ARC
      : interpolate(pullDistance.value, [0, triggerDistance], [MIN_ARC, 1], Extrapolation.CLAMP);
    return { strokeDashoffset: CIRCUMFERENCE * (1 - progress) };
  });

  return (
    <Animated.View pointerEvents="none" style={[styles.wrap, wrapStyle]}>
      <Animated.View style={ringStyle}>
        <Svg width={SIZE} height={SIZE}>
          {/* Faint full ring so the arc always has a track to travel along. */}
          <Circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            stroke={resolvedColor}
            strokeOpacity={0.18}
            strokeWidth={STROKE}
            fill="none"
          />
          <AnimatedCircle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            stroke={resolvedColor}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            fill="none"
            // Rotate the dash origin to 12 o'clock so the arc grows clockwise
            // from the top rather than from the right edge.
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
            animatedProps={arcProps}
          />
        </Svg>
      </Animated.View>
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

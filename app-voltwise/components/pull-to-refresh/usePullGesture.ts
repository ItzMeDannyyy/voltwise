import { useEffect, useState } from "react";
import { Platform } from "react-native";
import * as Haptics from "expo-haptics";
import {
  Gesture,
  type GestureUpdateEvent,
  type PanGestureHandlerEventPayload,
} from "react-native-gesture-handler";
import {
  runOnJS,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

export const TRIGGER_DISTANCE = 64; // drag distance (px) that commits to a refresh
export const REFRESH_HOLD_DISTANCE = 88; // gap held open under the spinner while refreshing
export const MAX_PULL_DISTANCE = 120; // hard cap so the gesture doesn't feel unbounded
const PULL_RESISTANCE = 0.55; // rubber-band factor applied to raw finger travel
const SETTLE_SPRING = { damping: 16, stiffness: 180 };
const HOLD_SPRING = { damping: 18, stiffness: 220 };

type PanGestureEvent = GestureUpdateEvent<PanGestureHandlerEventPayload>;

interface UsePullGestureArgs {
  refreshing: boolean;
  onRefresh: () => void;
}

function tick() {
  // Matches the tab bar's convention: haptics on iOS only.
  if (Platform.OS === "ios") {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }
}

/**
 * Gesture/animation core shared by <PullToRefresh> (ScrollView) and
 * <PullToRefreshList> (FlatList): a Gesture.Pan() composed simultaneously
 * with the scrollable's own Gesture.Native() scroll gesture, dynamically
 * enabled only while the list rests at y=0 so ordinary scrolling elsewhere
 * is never intercepted. Returns everything a scrollable wrapper needs to
 * hook itself up — the indicator, the onScroll handler, the gesture to
 * attach via GestureDetector, and the translateY style for the content.
 */
export function usePullGesture({ refreshing, onRefresh }: UsePullGestureArgs) {
  const pullDistance = useSharedValue(0);
  // Latches once per drag so the "release to refresh" haptic fires on the
  // threshold crossing rather than on every frame past it.
  const armed = useSharedValue(false);
  // The pan gesture is only allowed to intercept drags while the list is
  // pinned at y=0; everywhere else the scrollable's native gesture wins.
  const [pullEnabled, setPullEnabled] = useState(true);

  const scrollHandler = useAnimatedScrollHandler({
    onEndDrag: (event) => {
      runOnJS(setPullEnabled)(event.contentOffset.y <= 0);
    },
    onMomentumEnd: (event) => {
      runOnJS(setPullEnabled)(event.contentOffset.y <= 0);
    },
  });

  const nativeGesture = Gesture.Native();

  const panGesture = Gesture.Pan()
    .enabled(pullEnabled)
    .activeOffsetY(12)
    .failOffsetX([-10, 10])
    .onBegin(() => {
      armed.value = false;
    })
    .onUpdate((event: PanGestureEvent) => {
      if (event.translationY <= 0) {
        pullDistance.value = 0;
        return;
      }
      pullDistance.value = Math.min(event.translationY * PULL_RESISTANCE, MAX_PULL_DISTANCE);
      if (!armed.value && pullDistance.value >= TRIGGER_DISTANCE) {
        armed.value = true;
        runOnJS(tick)();
      }
    })
    .onEnd(() => {
      if (pullDistance.value >= TRIGGER_DISTANCE) {
        // Settle into the wider hold gap so the spinner has room of its own
        // while the fetch is in flight.
        pullDistance.value = withSpring(REFRESH_HOLD_DISTANCE, HOLD_SPRING);
        runOnJS(onRefresh)();
      } else {
        pullDistance.value = withSpring(0, SETTLE_SPRING);
      }
      armed.value = false;
    });

  const composedGesture = Gesture.Simultaneous(panGesture, nativeGesture);

  // Open the gap for refreshes started elsewhere (a button, a screen focus),
  // and snap it shut again once the caller's async refresh resolves.
  useEffect(() => {
    if (refreshing) {
      pullDistance.value = withSpring(REFRESH_HOLD_DISTANCE, HOLD_SPRING);
    } else {
      pullDistance.value = withTiming(0, { duration: 220 });
    }
  }, [refreshing, pullDistance]);

  const contentStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: pullDistance.value }],
  }));

  return { pullDistance, scrollHandler, composedGesture, contentStyle };
}

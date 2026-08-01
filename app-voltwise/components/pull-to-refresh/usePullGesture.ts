import { useEffect, useState } from "react";
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

export const TRIGGER_DISTANCE = 72; // drag distance (px) that commits to a refresh
export const MAX_PULL_DISTANCE = 96; // hard cap so the gesture doesn't feel unbounded
const PULL_RESISTANCE = 0.5; // rubber-band factor applied to raw finger travel
const SETTLE_SPRING = { damping: 16, stiffness: 180 };

type PanGestureEvent = GestureUpdateEvent<PanGestureHandlerEventPayload>;

interface UsePullGestureArgs {
  refreshing: boolean;
  onRefresh: () => void;
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
    .onUpdate((event: PanGestureEvent) => {
      if (event.translationY <= 0) {
        pullDistance.value = 0;
        return;
      }
      pullDistance.value = Math.min(event.translationY * PULL_RESISTANCE, MAX_PULL_DISTANCE);
    })
    .onEnd(() => {
      if (pullDistance.value >= TRIGGER_DISTANCE) {
        pullDistance.value = withTiming(TRIGGER_DISTANCE * 0.55, { duration: 150 });
        runOnJS(onRefresh)();
      } else {
        pullDistance.value = withSpring(0, SETTLE_SPRING);
      }
    });

  const composedGesture = Gesture.Simultaneous(panGesture, nativeGesture);

  // Once the caller's async refresh resolves, snap the indicator away.
  useEffect(() => {
    if (!refreshing) {
      pullDistance.value = withSpring(0, SETTLE_SPRING);
    }
  }, [refreshing, pullDistance]);

  const contentStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: pullDistance.value }],
  }));

  return { pullDistance, scrollHandler, composedGesture, contentStyle };
}
